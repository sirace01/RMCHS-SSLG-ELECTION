import { createClient } from '@supabase/supabase-js';
import { Voter, Candidate, VoteSelection, Vote, Branding, DEFAULT_SCHOOL_NAME, DEFAULT_SCHOOL_LOGO, DEFAULT_SSLG_LOGO } from '../types';
import { generatePasscode } from './utils';

// Access environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aqcwibfanlyhpwmtqdgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxY3dpYmZhbmx5aHB3bXRxZGdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NjI1OTUsImV4cCI6MjA4NDUzODU5NX0.cpGVwPNOWaShEDzhyIu18QSczDo6XHhhZi0gT3uQ5dk';

if (!SUPABASE_URL) {
  throw new Error('supabaseUrl is required.');
}

if (!SUPABASE_ANON_KEY) {
  throw new Error('supabaseKey is required.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DEFAULTS ---
const DEFAULT_ADMIN_LRN = '111111111111';
const DEFAULT_ADMIN_PASS = 'SSLGRMCHS@2026';

const DEFAULT_SUPER_USER = 'SUPERADMIN';
const DEFAULT_SUPER_PASS = 'ADMINSUPER';

// --- HELPER: Fetch All Rows (Bypass 1000 limit) ---
const fetchAllRows = async <T>(table: string, orderBy: string = 'created_at'): Promise<T[]> => {
  let allRows: T[] = [];
  let from = 0;
  const step = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: false })
      .range(from, from + step - 1);
      
    if (error) {
      console.error(`Error fetching ${table}:`, error);
      break;
    }
    
    if (!data || data.length === 0) break;
    
    allRows = [...allRows, ...(data as T[])];
    
    if (data.length < step) break;
    from += step;
  }
  return allRows;
};

// --- API FUNCTIONS ---

// 1. LOGIN: Fetch voter by LRN
export const getVoterByLrn = async (lrn: string): Promise<Voter | null> => {
  const { data, error } = await supabase
    .from('voters')
    .select('*')
    .eq('lrn', lrn)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error fetching voter:', error);
    return null;
  }
  return data as Voter;
};

// 2. BALLOT: Fetch Candidates
export const getCandidates = async (): Promise<Candidate[]> => {
  const { data, error } = await supabase
    .from('candidates')
    .select('*');

  if (error) {
    console.error('Error fetching candidates:', error);
    return [];
  }
  return data as Candidate[];
};

// 3. BALLOT: Submit Vote (Transaction-like)
export const submitBallot = async (voter: Voter, selections: VoteSelection): Promise<boolean> => {
  try {
    const isOpen = await getElectionStatus();
    if (!isOpen) {
      console.warn("Attempted to vote while election is closed.");
      return false;
    }

    const votesToInsert = Object.entries(selections).map(([pos, candidateId]) => ({
      position: pos,
      candidate_id: candidateId === 'ABSTAIN' ? null : candidateId,
      grade_level: voter.grade_level
    }));

    const { error: voteError } = await supabase
      .from('votes')
      .insert(votesToInsert);

    if (voteError) throw voteError;

    const { error: updateError } = await supabase
      .from('voters')
      .update({ has_voted: true })
      .eq('id', voter.id);

    if (updateError) throw updateError;

    return true;
  } catch (error) {
    console.error('Error submitting ballot:', error);
    return false;
  }
};

// 4. ADMIN: Fetch all Voters
export const getAllVoters = async (): Promise<Voter[]> => {
  // Use batched fetching to get accurate count > 1000
  return fetchAllRows<Voter>('voters', 'created_at');
};

// 5. ADMIN: Add Single Voter
export const addVoter = async (voterData: Partial<Voter>): Promise<Voter | null> => {
  const passcode = generatePasscode(voterData.lrn!, voterData.first_name!, voterData.last_name!);
  
  const { data, error } = await supabase
    .from('voters')
    .insert([{ ...voterData, passcode, has_voted: false }])
    .select()
    .single();

  if (error) {
    console.error('Error adding voter:', error);
    throw error;
  }
  return data;
};

// 6. ADMIN: Bulk Import Voters (Batched)
export const bulkImportVoters = async (votersData: any[]): Promise<{ added: number, skipped: number }> => {
  // 1. Process all data objects first
  const processedData = votersData.map(v => ({
    lrn: v.lrn,
    first_name: v.first_name,
    last_name: v.last_name,
    grade_level: parseInt(v.grade_level) || 0,
    passcode: generatePasscode(v.lrn, v.first_name, v.last_name),
    has_voted: false
  }));

  // 2. Upload in batches to avoid payload limits
  const BATCH_SIZE = 100;
  let totalAdded = 0;

  for (let i = 0; i < processedData.length; i += BATCH_SIZE) {
    const chunk = processedData.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('voters')
      .upsert(chunk, { onConflict: 'lrn', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error(`Batch import error (batch ${i}):`, error);
      throw new Error(`Failed to import batch starting at row ${i + 1}. Details: ${error.message}`);
    }

    if (data) {
      totalAdded += data.length;
    }
  }

  const skippedCount = processedData.length - totalAdded;

  return { added: totalAdded, skipped: skippedCount };
};

// 7. ADMIN: Delete Voter
export const deleteVoter = async (id: string): Promise<void> => {
  const { error } = await supabase.from('voters').delete().eq('id', id);
  if (error) throw error;
};

// 8. ADMIN: Add Candidate
export const addCandidate = async (candidateData: Partial<Candidate>): Promise<Candidate | null> => {
  const { data, error } = await supabase
    .from('candidates')
    .insert([candidateData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// 8b. ADMIN: Update Candidate
export const updateCandidate = async (id: string, updates: Partial<Candidate>): Promise<void> => {
  const { error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
};

// 9. ADMIN: Delete Candidate
export const deleteCandidate = async (id: string): Promise<void> => {
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw error;
};

// 26. ADMIN: Bulk Import Candidates
export const bulkImportCandidates = async (candidatesData: any[]): Promise<{ added: number, skipped: number }> => {
  const processedData = candidatesData.map(c => ({
    full_name: c.full_name?.trim(),
    position: c.position?.trim(),
    partylist: c.partylist?.trim() || 'Independent',
    grade_level: c.grade_level ? parseInt(c.grade_level) : null,
    image_url: null 
  })).filter(c => c.full_name && c.position);

  if (processedData.length === 0) return { added: 0, skipped: 0 };

  // For candidates, we simply insert all. Assuming admin manages duplicates manually if needed.
  const { data, error } = await supabase
    .from('candidates')
    .insert(processedData)
    .select();

  if (error) {
    console.error('Error importing candidates:', error);
    throw error;
  }

  return { added: data.length, skipped: 0 };
};

// 10. ADMIN: Get Vote Counts
export const getVoteCounts = async (): Promise<Record<string, number>> => {
  // Use getAllVotes to ensure we have all records
  const allVotes = await getAllVotes();

  const counts: Record<string, number> = {};
  allVotes.forEach((vote: any) => {
    if (vote.candidate_id) {
      counts[vote.candidate_id] = (counts[vote.candidate_id] || 0) + 1;
    }
  });
  
  return counts;
};

// 11. ADMIN: Get All Votes Raw
export const getAllVotes = async (): Promise<Vote[]> => {
  // Use batched fetching to get all votes > 1000
  return fetchAllRows<Vote>('votes', 'created_at');
};

// 12. STORAGE: Generic Upload (Photos/Logos)
export const uploadFile = async (file: File, bucket: string = 'candidate-photos'): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, { upsert: false });

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return data.publicUrl;
};

// Legacy Wrapper for backward compatibility
export const uploadCandidatePhoto = async (file: File): Promise<string> => {
  return uploadFile(file, 'candidate-photos');
};

// 13. CONFIG: Get Election Status
export const getElectionStatus = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'election_status')
      .single();

    if (error) return true; 
    if (!data) return true;
    return data.value === 'OPEN';
  } catch (e) {
    return true; 
  }
};

// 14. CONFIG: Set Election Status
export const setElectionStatus = async (isOpen: boolean): Promise<void> => {
  const value = isOpen ? 'OPEN' : 'CLOSED';
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'election_status', value });
  
  if (error) throw error;
};

// 15. CONFIG: Get School Year
export const getSchoolYear = async (): Promise<string> => {
  try {
    const { data } = await supabase.from('config').select('value').eq('key', 'school_year').single();
    return data?.value || '2024-2025';
  } catch (e) {
    return '2024-2025';
  }
};

// 16. CONFIG: Set School Year
export const setSchoolYear = async (year: string): Promise<void> => {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'school_year', value: year });
  
  if (error) throw error;
};

// 17. AUTH: Verify Admin Credentials
export const verifyAdminCredentials = async (lrn: string, passcode: string): Promise<boolean> => {
  try {
    const { data: lrnData } = await supabase.from('config').select('value').eq('key', 'admin_lrn').single();
    const { data: passData } = await supabase.from('config').select('value').eq('key', 'admin_password').single();
    
    const correctLrn = lrnData?.value || DEFAULT_ADMIN_LRN;
    const correctPass = passData?.value || DEFAULT_ADMIN_PASS;

    return lrn === correctLrn && passcode === correctPass;
  } catch (e) {
    return lrn === DEFAULT_ADMIN_LRN && passcode === DEFAULT_ADMIN_PASS;
  }
};

// 18. AUTH: Get Admin LRN
export const getAdminLrn = async (): Promise<string> => {
  try {
    const { data } = await supabase.from('config').select('value').eq('key', 'admin_lrn').single();
    return data?.value || DEFAULT_ADMIN_LRN;
  } catch {
    return DEFAULT_ADMIN_LRN;
  }
};

// 19. AUTH: Update Admin Credentials
export const updateAdminCredentials = async (lrn: string, password?: string): Promise<void> => {
  const updates = [{ key: 'admin_lrn', value: lrn }];
  if (password) {
    updates.push({ key: 'admin_password', value: password });
  }
  const { error } = await supabase.from('config').upsert(updates);
  if (error) throw error;
};

// 20. AUTH: Verify Super Admin
export const verifySuperAdminCredentials = async (user: string, pass: string): Promise<boolean> => {
  try {
    const { data: userData } = await supabase.from('config').select('value').eq('key', 'superadmin_username').single();
    const { data: passData } = await supabase.from('config').select('value').eq('key', 'superadmin_password').single();

    const correctUser = userData?.value || DEFAULT_SUPER_USER;
    const correctPass = passData?.value || DEFAULT_SUPER_PASS;

    return user === correctUser && pass === correctPass;
  } catch (e) {
    return user === DEFAULT_SUPER_USER && pass === DEFAULT_SUPER_PASS;
  }
};

// 21. SUPER: Wipe All Voters
export const wipeAllVoters = async (): Promise<void> => {
  const { error } = await supabase.from('voters').delete().neq('lrn', '000000');
  if (error) throw error;
};

// 22. SUPER: Wipe All Candidates
export const wipeAllCandidates = async (): Promise<void> => {
  await supabase.from('votes').delete().neq('grade_level', 0);
  const { error } = await supabase.from('candidates').delete().neq('position', 'INVALID');
  if (error) throw error;
};

// 23. SUPER: Reset Everything
export const factoryResetElection = async (): Promise<void> => {
  await supabase.from('votes').delete().neq('grade_level', 0);
  await supabase.from('candidates').delete().neq('position', 'INVALID');
  await supabase.from('voters').delete().neq('lrn', '000000');
};

// 24. SUPER: Get Branding Config
export const getBrandingConfig = async (): Promise<Branding> => {
  try {
    const { data: nameData } = await supabase.from('config').select('value').eq('key', 'school_name').single();
    const { data: logoData } = await supabase.from('config').select('value').eq('key', 'school_logo_url').single();
    const { data: sslgData } = await supabase.from('config').select('value').eq('key', 'sslg_logo_url').single();

    return {
      school_name: nameData?.value || DEFAULT_SCHOOL_NAME,
      school_logo_url: logoData?.value || DEFAULT_SCHOOL_LOGO,
      sslg_logo_url: sslgData?.value || DEFAULT_SSLG_LOGO
    };
  } catch (e) {
    return {
      school_name: DEFAULT_SCHOOL_NAME,
      school_logo_url: DEFAULT_SCHOOL_LOGO,
      sslg_logo_url: DEFAULT_SSLG_LOGO
    };
  }
};

// 25. SUPER: Update Branding Config
export const updateBrandingConfig = async (branding: Branding): Promise<void> => {
  const updates = [
    { key: 'school_name', value: branding.school_name },
    { key: 'school_logo_url', value: branding.school_logo_url },
    { key: 'sslg_logo_url', value: branding.sslg_logo_url }
  ];
  
  const { error } = await supabase.from('config').upsert(updates);
  if (error) throw error;
};