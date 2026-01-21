export interface Voter {
  id: string;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  grade_level: number;
  passcode: string;
  has_voted: boolean;
}

export interface Candidate {
  id: string;
  full_name: string;
  position: string;
  partylist?: string;
  image_url?: string;
  grade_level?: number;
}

export interface Vote {
  candidate_id: string | null; // null represents abstaining logic if stored that way, or we just don't store row
  position: string;
  grade_level: number;
}

export type VoteSelection = Record<string, string | 'ABSTAIN'>;

export enum AppScreen {
  LOGIN = 'LOGIN',
  FLASH = 'FLASH',
  BALLOT = 'BALLOT',
  SUCCESS = 'SUCCESS',
  ADMIN = 'ADMIN'
}

export const POSITIONS_ORDER = [
  'President',
  'Vice President',
  'Secretary',
  'Treasurer',
  'Auditor',
  'PIO',
  'Protocol Officer',
  'Grade Level Rep'
];

export const SCHOOL_LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyAvwcGMAaV6-A54QZA1rpKFw6vSBXTOJ8AQ&s";
export const SSLG_LOGO_URL = "https://picsum.photos/id/20/200/200"; // Placeholder for SSLG logo as one wasn't provided, using generic