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
  candidate_id: string | null; 
  position: string;
  grade_level: number;
}

export interface Branding {
  school_name: string;
  school_logo_url: string;
  sslg_logo_url: string;
}

export type VoteSelection = Record<string, string | 'ABSTAIN'>;

export enum AppScreen {
  LOGIN = 'LOGIN',
  FLASH = 'FLASH',
  BALLOT = 'BALLOT',
  SUCCESS = 'SUCCESS',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN'
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

export const DEFAULT_SCHOOL_NAME = "Ramon Magsaysay (Cubao) High School";
export const DEFAULT_SCHOOL_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyAvwcGMAaV6-A54QZA1rpKFw6vSBXTOJ8AQ&s";
export const DEFAULT_SSLG_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcROg9KNTPLlAuGyuecZQ--Vm9XwxY6So7VRYw&s";