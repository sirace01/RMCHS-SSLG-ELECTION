import { createClient } from '@supabase/supabase-js';
import { Voter, Candidate, VoteSelection, Vote } from '../types';
import { generatePasscode } from './utils';

// Access environment variables
// Use provided credentials as default fallback if env vars are missing
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

// --- API FUNCTIONS ---

// 1. LOGIN: Fetch voter by LRN
export const getVoterByLrn = async (lrn: string): Promise<Voter | null> => {
  const { data, error } = await supabase
    .from('voters')
    .select('*')
    .eq('lrn', lrn)
    .single();

  if (error) {
    // If error code is 'PGRST116', it means no rows found (invalid LRN)
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
    // Check if election is open before submitting
    const isOpen = await getElectionStatus();
    if (!isOpen) {
      console.warn("Attempted to vote while election is closed.");
      return false;
    }

    // A. Create the votes array
    const votesToInsert = Object.entries(selections).map(([pos, candidateId]) => ({
      position: pos,
      candidate_id: candidateId === 'ABSTAIN' ? null : candidateId,
      grade_level: voter.grade_level
    }));

    // B. Insert votes
    const { error: voteError } = await supabase
      .from('votes')
      .insert(votesToInsert);

    if (voteError) throw voteError;

    // C. Mark voter as having voted
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
  const { data, error } = await supabase
    .from('voters')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching voters:', error);
    return [];
  }
  return data as Voter[];
};

// 5. ADMIN: Add Single Voter
export const addVoter = async (voterData: Partial<Voter>): Promise<Voter | null> => {
  // Generate passcode automatically
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

// 6. ADMIN: Bulk Import Voters
export const bulkImportVoters = async (votersData: any[]): Promise<void> => {
  // Process data to include generated passcodes
  const processedData = votersData.map(v => ({
    lrn: v.lrn,
    first_name: v.first_name,
    last_name: v.last_name,
    grade_level: parseInt(v.grade_level),
    passcode: generatePasscode(v.lrn, v.first_name, v.last_name),
    has_voted: false
  }));

  const { error } = await supabase
    .from('voters')
    .insert(processedData);

  if (error) throw error;
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

// 9. ADMIN: Delete Candidate
export const deleteCandidate = async (id: string): Promise<void> => {
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw error;
};

// 10. ADMIN: Get Vote Counts (Legacy simple count)
export const getVoteCounts = async (): Promise<Record<string, number>> => {
  const { data, error } = await supabase
    .from('votes')
    .select('candidate_id');

  if (error) {
    console.error("Error fetching votes:", error);
    return {};
  }

  // Aggregate locally
  const counts: Record<string, number> = {};
  data.forEach((vote: any) => {
    if (vote.candidate_id) {
      counts[vote.candidate_id] = (counts[vote.candidate_id] || 0) + 1;
    }
  });
  
  return counts;
};

// 11. ADMIN: Get All Votes Raw (For detailed analytics/print)
export const getAllVotes = async (): Promise<Vote[]> => {
  const { data, error } = await supabase
    .from('votes')
    .select('*');

  if (error) {
    console.error("Error fetching all votes:", error);
    return [];
  }
  
  return data as Vote[];
};

// 12. STORAGE: Upload Image
export const uploadCandidatePhoto = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  // Use timestamp and random string to ensure unique filenames
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('candidate-photos')
    .upload(filePath, file, {
       upsert: false
    });

  if (uploadError) {
    console.error('Error uploading image:', uploadError);
    throw uploadError; // Throwing error so UI can catch it
  }

  const { data } = supabase.storage
    .from('candidate-photos')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

// 13. CONFIG: Get Election Status
export const getElectionStatus = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'election_status')
      .single();

    if (error) {
       console.error("Error checking election status (table might be missing):", error);
       return true; 
    }
    if (!data) return true;
    return data.value === 'OPEN';
  } catch (e) {
    console.error("Unexpected error in getElectionStatus:", e);
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
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'school_year')
      .single();

    if (error || !data) return '2024-2025';
    return data.value;
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
    
    // Use DB value or fall back to default
    const correctLrn = lrnData?.value || DEFAULT_ADMIN_LRN;
    const correctPass = passData?.value || DEFAULT_ADMIN_PASS;

    return lrn === correctLrn && passcode === correctPass;
  } catch (e) {
    // If DB fails, fallback to default
    return lrn === DEFAULT_ADMIN_LRN && passcode === DEFAULT_ADMIN_PASS;
  }
};

// 18. AUTH: Update Admin Password
export const updateAdminPassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'admin_password', value: newPassword });
  
  if (error) throw error;
};