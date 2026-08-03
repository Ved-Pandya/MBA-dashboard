export const INTERNAL_AUTH_DOMAIN = "users.deadlineos.app";

export const ROLL_NUMBER_PATTERN = /^24M2\d{3}$/;

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
