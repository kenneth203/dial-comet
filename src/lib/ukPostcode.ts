// UK postcode validation & normalisation utilities.
// Reference: official UK postcode structure — Royal Mail / GOV.UK guidance.
// Full format: "AREA DISTRICT SECTOR UNIT" where the outward and inward codes
// are separated by a single space, e.g. "SW1A 1AA", "RG40 5PN", "M1 1AA".

// Anchored, case-insensitive full-match regex (accepts optional whitespace
// between the outward and inward codes; validated after stripping).
const UK_POSTCODE_FULL = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

// Loose regex to *extract* a postcode from a larger address string.
export const UK_POSTCODE_EXTRACT =
  /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/**
 * Normalise a UK postcode to canonical form: uppercase, single space
 * before the final 3 characters. Returns the trimmed input unchanged
 * if it doesn't match the UK postcode pattern.
 */
export function normaliseUkPostcode(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const m = raw.match(UK_POSTCODE_FULL);
  if (!m) return raw.toUpperCase();
  return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
}

/** True if `input` is a valid UK postcode (ignoring case / inner spacing). */
export function isValidUkPostcode(input: string): boolean {
  const raw = (input || "").trim();
  if (!raw) return false;
  return UK_POSTCODE_FULL.test(raw);
}

/**
 * Returns a human-friendly validation error explaining *why* the postcode is
 * invalid, or null if valid/empty. Empty is treated as valid so the field
 * remains optional at the field level.
 */
export function ukPostcodeError(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (isValidUkPostcode(raw)) return null;

  const compact = raw.replace(/\s+/g, "").toUpperCase();

  if (/[^A-Z0-9]/.test(compact)) {
    return "Postcode can only contain letters, numbers and a single space.";
  }
  if (compact.length < 5) {
    return "Postcode is too short — UK postcodes are 5–7 characters (e.g. M1 1AA, SW1A 1AA).";
  }
  if (compact.length > 7) {
    return "Postcode is too long — UK postcodes are 5–7 characters (e.g. SW1A 1AA).";
  }

  const inward = compact.slice(-3);
  const outward = compact.slice(0, -3);
  if (!/^\d[A-Z]{2}$/.test(inward)) {
    return "The last 3 characters must be a digit followed by two letters (e.g. 1AA).";
  }
  if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(outward)) {
    return "The first part must start with 1–2 letters followed by a digit (e.g. SW1A, RG40, M1).";
  }
  return "Enter a valid UK postcode (e.g. SW1A 1AA).";
}

