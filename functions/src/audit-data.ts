/** Preserve Firestore values while removing omitted optional fields from audit payloads. */
export function auditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : auditData(item));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, auditData(item)]));
  }
  return value;
}
