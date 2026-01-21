import { createClient } from '@supabase/supabase-js';
import { Voter, Candidate } from '../types';
import { generatePasscode } from './utils';

// NOTE: In a real Next.js app, these would be process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyzcompany.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- MOCK DATA FOR DEMONSTRATION IF NO DB CONNECTION ---
// This allows the app to function visually without a live backend connection in this generated sandbox.

export let mockVoters: Voter[] = [
  {
    id: 'v1',
    lrn: '123456789012',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    grade_level: 10,
    passcode: '89012JD', // Derived from logic
    has_voted: false
  },
  {
    id: 'v2',
    lrn: '109876543210',
    first_name: 'Maria',
    last_name: 'Clara',
    grade_level: 9,
    passcode: '43210MC',
    has_voted: true
  },
  {
    id: 'demo1',
    lrn: '111111111111',
    first_name: 'Demo',
    last_name: 'Student',
    grade_level: 11,
    passcode: '11111DS',
    has_voted: false
  },
  {
    id: 'admin',
    lrn: 'ADMIN',
    first_name: 'Admin',
    last_name: 'User',
    grade_level: 12,
    passcode: 'ADMIN',
    has_voted: false
  }
];

export let mockCandidates: Candidate[] = [
  { id: 'c1', full_name: 'Sarah Geronimo', position: 'President', partylist: 'Tala Party', image_url: 'https://picsum.photos/id/64/300/300' },
  { id: 'c2', full_name: 'Bamboo Manalac', position: 'President', partylist: 'Kawayan Party', image_url: 'https://picsum.photos/id/65/300/300' },
  { id: 'c3', full_name: 'Catriona Gray', position: 'Vice President', partylist: 'Tala Party', image_url: 'https://picsum.photos/id/66/300/300' },
  { id: 'c4', full_name: 'Pia Wurtzbach', position: 'Vice President', partylist: 'Kawayan Party', image_url: 'https://picsum.photos/id/67/300/300' },
  { id: 'c5', full_name: 'Pedro Penduko', position: 'Grade Level Rep', grade_level: 10, partylist: 'Tala Party', image_url: 'https://picsum.photos/id/68/300/300' },
  { id: 'c6', full_name: 'Juan Tamad', position: 'Grade Level Rep', grade_level: 10, partylist: 'Kawayan Party', image_url: 'https://picsum.photos/id/69/300/300' },
  { id: 'c7', full_name: 'Nene K', position: 'Grade Level Rep', grade_level: 9, partylist: 'Tala Party', image_url: 'https://picsum.photos/id/70/300/300' },
];

// Helper to simulate DB delay
export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- Admin Helpers (Mock) ---
export const addCandidate = async (candidate: Omit<Candidate, 'id'>) => {
  await delay(500);
  const newCandidate = { ...candidate, id: `c${Date.now()}` };
  mockCandidates.push(newCandidate);
  return newCandidate;
};

export const deleteCandidate = async (id: string) => {
  await delay(500);
  mockCandidates = mockCandidates.filter(c => c.id !== id);
};

export const addVoter = async (voter: Omit<Voter, 'id' | 'has_voted' | 'passcode'>) => {
  await delay(300);
  const passcode = generatePasscode(voter.lrn, voter.first_name, voter.last_name);
  const newVoter: Voter = {
    ...voter,
    id: `v${Date.now()}`,
    passcode,
    has_voted: false
  };
  mockVoters.push(newVoter);
  return newVoter;
};

export const deleteVoter = async (id: string) => {
  await delay(300);
  mockVoters = mockVoters.filter(v => v.id !== id);
};

// Simulation for CSV Bulk Upload
export const bulkUploadVoters = async (count: number) => {
  await delay(1000);
  const startLrn = 123456000000;
  for (let i = 0; i < count; i++) {
    const lrn = (startLrn + i).toString();
    const newVoter: Voter = {
      id: `bulk${i}`,
      lrn: lrn,
      first_name: `Student`,
      last_name: `No.${i+1}`,
      grade_level: Math.floor(Math.random() * 6) + 7, // Grades 7-12
      passcode: generatePasscode(lrn, 'Student', `No.${i+1}`),
      has_voted: false
    };
    mockVoters.push(newVoter);
  }
};