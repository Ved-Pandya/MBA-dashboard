import { createHash } from "node:crypto";
import type { TimetableRow } from "@mba/domain";

const slug = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]+/g, "-");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);

/** Stable across row reordering. Reuse existing same-term identities to preserve POC grants. */
export function planTimetable(termId: string, rows: TimetableRow[], existing: Array<{ id: string; subjectCode: string; sectionId: string }>) {
  const offerings = new Map<string, { id: string; subjectCode: string; subjectName: string; sectionId: string }>();
  const slots = new Map<string, TimetableRow & { id: string; offeringId: string }>();
  for (const row of rows) {
    const key = `${row.subjectCode.toUpperCase()}-${row.sectionId}`;
    const prior = existing.find((item) => `${item.subjectCode.toUpperCase()}-${item.sectionId}` === key);
    const offeringId = prior?.id ?? `${slug(termId).slice(0, 20)}_${slug(key).slice(0, 30)}_${hash([termId, key]).slice(0, 12)}`;
    if (offerings.has(key) && offerings.get(key)!.subjectName !== row.subjectName) throw new Error(`Use one subject name for ${key}`);
    offerings.set(key, { id: offeringId, subjectCode: row.subjectCode, subjectName: row.subjectName, sectionId: row.sectionId });
    const id = `slot_${hash([termId, key, row.weekday, row.startTime])}`;
    if (slots.has(id)) throw new Error(`Duplicate class for ${key} on day ${row.weekday} at ${row.startTime}`);
    slots.set(id, { ...row, id, offeringId });
  }
  return { offerings: [...offerings.values()], slots: [...slots.values()] };
}
