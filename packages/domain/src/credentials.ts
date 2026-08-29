export const INTERNAL_AUTH_DOMAIN = "users.deadlineos.app";

// The live batch uses 26M2xxx. The legacy 24M2xxx form remains valid only for
// existing bootstrap/test identities so production administrators are not locked out.
export const ROLL_NUMBER_PATTERN = /^(?:24|26)M2\d{3}$/;
export const CURRENT_BATCH_ROLL_NUMBER_PATTERN = /^26M2\d{3}$/;

export function normalizeRollNumber(value: string) {
  return value.trim().toUpperCase();
}

export function rollNumberToAuthEmail(rollNumber: string) {
  return `${normalizeRollNumber(rollNumber).toLowerCase()}@${INTERNAL_AUTH_DOMAIN}`;
}

export function authEmailToRollNumber(email: string) {
  const normalized = email.trim().toLowerCase();
  const suffix = `@${INTERNAL_AUTH_DOMAIN}`;
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length).toUpperCase() : "";
}
