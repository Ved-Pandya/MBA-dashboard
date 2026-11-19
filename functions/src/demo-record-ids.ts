import type { DemoRecord } from "./demo-fixtures.js";
import { DEMO_STATS_SOURCES } from "./demo-metadata.js";

function containsReference(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((item) => containsReference(item, id));
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).some((item) => containsReference(item, id));
  return false;
}

function replaceReference(value: unknown, oldId: string, newId: string): unknown {
  if (value === oldId) return newId;
  if (Array.isArray(value)) return value.map((item) => replaceReference(item, oldId, newId));
  // Preserve Timestamp and any other Firestore values instead of spreading them.
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceReference(item, oldId, newId)]));
  return value;
}

/** Move one planned source and its linked fixture records to an unused identity.
 * No database records are changed here. Exact references avoid renaming similarly
 * prefixed independent sources (e.g. demo_internship_analytics). */
export function remapDemoSource(records: DemoRecord[], sourcePath: string, newId: string): DemoRecord[] {
  const [collection, oldId] = sourcePath.split("/");
  const statsCollection = Object.keys(DEMO_STATS_SOURCES).find((key) => DEMO_STATS_SOURCES[key] === collection);
  if (!collection || !oldId || !statsCollection) throw new Error("Unsupported sample source identity");
  return records.map((record) => {
    const slash = record.path.lastIndexOf("/"), parent = record.path.slice(0, slash), id = record.path.slice(slash + 1);
    const linked = containsReference(record.data, oldId);
    const sameSource = record.path === sourcePath || record.path === `${statsCollection}/${oldId}`;
    const newDocumentId = sameSource ? newId : linked && id.startsWith(oldId + "_") ? newId + id.slice(oldId.length) : id;
    return { path: `${parent}/${newDocumentId}`, data: replaceReference(record.data, oldId, newId) as Record<string, unknown> };
  });
}
