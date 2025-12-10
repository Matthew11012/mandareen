/**
 * Username validation and generation utilities.
 * Rules: 3-30 chars, trimmed, no control characters, no leading/trailing whitespace.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Validate username format.
 * @returns null if valid, error message if invalid
 */
export function validateUsername(username: string): string | null {
  const trimmed = username.trim();

  if (trimmed !== username) {
    return 'Username cannot have leading or trailing whitespace';
  }

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return `Username cannot exceed ${USERNAME_MAX_LENGTH} characters`;
  }

  // Disallow control characters (but allow punctuation, mixed case, unicode)
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return 'Username cannot contain control characters';
    }
  }

  // Disallow whitespace-only
  if (/^\s*$/.test(trimmed)) {
    return 'Username cannot be empty or whitespace only';
  }

  return null;
}

/**
 * Generate a base username from email.
 * Takes local part, sanitizes lightly, caps length.
 */
export function generateBaseUsername(email: string): string {
  const localPart = email.split('@')[0] || 'user';
  // Replace invalid chars with underscore, trim to max length minus suffix room
  const sanitized = Array.from(localPart)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code <= 0x1f || code === 0x7f) {
        return '_';
      }
      return ch;
    })
    .join('')
    .slice(0, USERNAME_MAX_LENGTH - 5); // Leave room for suffix like _1234
  return sanitized || 'user';
}

// eslint-disable-next-line no-unused-vars
type CheckExistsFn = (value: string) => Promise<boolean>;

/**
 * Generate unique username with suffix if needed.
 * @param baseUsername - The base username to try
 * @param checkExists - Async function to check if username exists in DB
 */
export async function generateUniqueUsername(
  baseUsername: string,
  checkExists: CheckExistsFn,
): Promise<string> {
  let candidate = baseUsername.slice(0, USERNAME_MAX_LENGTH);

  if (!(await checkExists(candidate))) {
    return candidate;
  }

  // Try with numeric suffixes
  for (let i = 1; i <= 9999; i++) {
    const suffix = `_${i}`;
    candidate = `${baseUsername.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!(await checkExists(candidate))) {
      return candidate;
    }
  }

  // Fallback: random suffix
  const randomSuffix = `_${Date.now().toString(36)}`;
  return `${baseUsername.slice(0, USERNAME_MAX_LENGTH - randomSuffix.length)}${randomSuffix}`;
}
