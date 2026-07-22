import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Check if a URL belongs to a blocked map host - currently no hosts are blocked
// Google Maps links are allowed as they are the primary use case for customer locations
export function isBlockedMapHost(_url: string): boolean {
  return false;
}

// Check if URL is valid
export function isValidNonBlockedMapUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}
