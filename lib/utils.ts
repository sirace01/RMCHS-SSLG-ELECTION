import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates the passcode based on requirements:
 * (Last 5 digits of LRN) + (First Letter of First Name) + (First Letter of Last Name)
 * All Uppercase.
 */
export const generatePasscode = (lrn: string, firstName: string, lastName: string): string => {
  if (!lrn || lrn.length < 5) return '';
  
  const lrnPart = lrn.slice(-5);
  const namePart = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  
  return `${lrnPart}${namePart}`;
};

export const getOrdinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};