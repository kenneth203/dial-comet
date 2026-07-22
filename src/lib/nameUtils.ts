/**
 * Utility functions for formatting and displaying names consistently
 */

/**
 * Formats a name extracted from email or other sources to display as "First name Last name"
 * Examples:
 * - "k.pote" → "K Pote" 
 * - "john.smith" → "John Smith"
 * - "mary-jane.doe" → "Mary-jane Doe"
 * - "singlename" → "Singlename"
 */
export function formatDisplayName(rawName: string): string {
  if (!rawName || rawName.trim() === '') {
    return 'User';
  }

  // If the name looks like an email, extract the part before @
  let name = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  
  // Split by spaces, dots, underscores, or dashes
  const nameParts = name.split(/[\s._-]+/).filter(part => part.length > 0);
  
  if (nameParts.length === 0) {
    return 'User';
  }
  
  // Capitalize the first letter of each part, preserve the rest
  const formattedParts = nameParts.map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  );
  
  return formattedParts.join(' ');
}

/**
 * Gets initials from a name for avatars. Always returns 1-2 uppercase letters.
 * Examples:
 * - "Kenneth Pote" → "KP"
 * - "kenneth@thevateam.co.uk" → "KE" (single token, takes first two letters)
 * - "Madonna" → "MA"
 * - "Anne-Marie Smith" → "AS" (first part + last part)
 * - "Mary Jane Smith" → "MS"
 * - "k.pote" → "KP"
 * - "X" → "X"
 */
export function getNameInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?';
  const formatted = formatDisplayName(name);
  const parts = formatted.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const p = parts[0];
    return (p.length >= 2 ? p.slice(0, 2) : p).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Extracts and formats name from profile data consistently
 */
export function getFormattedNameFromProfile(profile: { name?: string }): string {
  if (!profile?.name) {
    return 'User';
  }
  
  return formatDisplayName(profile.name);
}