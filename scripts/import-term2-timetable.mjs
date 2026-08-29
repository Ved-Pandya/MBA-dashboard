import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const TERM_ID = "TERM-2";
const TERM_START = "2026-09-28";
const TERM_END = "2026-11-13";
const shouldCommit = process.argv.includes("--commit");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.vercel");
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase Admin credentials are required");
}

if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
const db = getFirestore();

const subjects = [
  { code: "SOM606", name: "Corporate Finance-I", faculty: "Prof. S. N. Rao", credits: 4 },
  { code: "SOM607", name: "Macroeconomics", faculty: "Prof. Sarthak Gaurav", credits: 4 },
  { code: "SOM608", name: "Decision Models in Management", faculty: "Prof. Omkar Palsule", credits: 4 },
  { code: "SOM609", name: "Information Systems", faculty: "Prof. R M Sonar", credits: 4 },
  { code: "SOM610", name: "Marketing Management-II", faculty: "Prof. Dinesh Sharma", credits: 4 },
  { code: "SOM611", name: "Operations Management-I", faculty: "Prof. Indrajit Mukherjee", credits: 4 },
];

const rows = [
  // Section A: regular afternoon schedule plus the two CR6 morning sessions.
  { sectionId: "A", weekday: 1, startTime: "13:45", endTime: "15:45", subjectCode: "SOM609", room: "CR-1" },
  { sectionId: "A", weekday: 1, startTime: "16:00", endTime: "18:00", subjectCode: "SOM611", room: "CR-1" },
  { sectionId: "A", weekday: 2, startTime: "13:45", endTime: "15:45", subjectCode: "SOM610", room: "CR-1" },
  { sectionId: "A", weekday: 2, startTime: "16:00", endTime: "18:00", subjectCode: "SOM607", room: "CR-1" },
  { sectionId: "A", weekday: 3, startTime: "10:45", endTime: "12:45", subjectCode: "SOM608", room: "CR6" },
  { sectionId: "A", weekday: 3, startTime: "13:45", endTime: "15:45", subjectCode: "SOM609", room: "CR-1" },
  { sectionId: "A", weekday: 3, startTime: "16:00", endTime: "18:00", subjectCode: "SOM606", room: "CR-1" },
  { sectionId: "A", weekday: 4, startTime: "10:45", endTime: "12:45", subjectCode: "SOM611", room: "CR6" },
  { sectionId: "A", weekday: 4, startTime: "13:45", endTime: "15:45", subjectCode: "SOM610", room: "CR-1" },
  { sectionId: "A", weekday: 4, startTime: "16:00", endTime: "18:00", subjectCode: "SOM607", room: "CR-1" },
  { sectionId: "A", weekday: 5, startTime: "13:45", endTime: "15:45", subjectCode: "SOM608", room: "CR-1" },
  { sectionId: "A", weekday: 5, startTime: "16:00", endTime: "18:00", subjectCode: "SOM606", room: "CR-1" },

  // Section B: regular morning schedule plus the two CR6 afternoon sessions.
  { sectionId: "B", weekday: 1, startTime: "08:30", endTime: "10:30", subjectCode: "SOM609", room: "CR-1" },
  { sectionId: "B", weekday: 1, startTime: "10:45", endTime: "12:45", subjectCode: "SOM611", room: "CR-1" },
  { sectionId: "B", weekday: 2, startTime: "08:30", endTime: "10:30", subjectCode: "SOM610", room: "CR-1" },
  { sectionId: "B", weekday: 2, startTime: "10:45", endTime: "12:45", subjectCode: "SOM607", room: "CR-1" },
  { sectionId: "B", weekday: 3, startTime: "08:30", endTime: "10:30", subjectCode: "SOM609", room: "CR-1" },
  { sectionId: "B", weekday: 3, startTime: "10:45", endTime: "12:45", subjectCode: "SOM606", room: "CR-1" },
  { sectionId: "B", weekday: 3, startTime: "13:45", endTime: "15:45", subjectCode: "SOM608", room: "CR6" },
  { sectionId: "B", weekday: 4, startTime: "08:30", endTime: "10:30", subjectCode: "SOM610", room: "CR-1" },
  { sectionId: "B", weekday: 4, startTime: "10:45", endTime: "12:45", subjectCode: "SOM607", room: "CR-1" },
  { sectionId: "B", weekday: 4, startTime: "16:00", endTime: "18:00", subjectCode: "SOM611", room: "CR6" },
  { sectionId: "B", weekday: 5, startTime: "08:30", endTime: "10:30", subjectCode: "SOM608", room: "CR-1" },
  { sectionId: "B", weekday: 5, startTime: "10:45", endTime: "12:45", subjectCode: "SOM606", room: "CR-1" },
];

function classCountFor(row) {
  const start = new Date(`${TERM_START}T00:00:00Z`);
  const end = new Date(`${TERM_END}T00:00:00Z`);
  let count = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (weekday === row.weekday) count += 1;
  }
  return count;
}

const counts = new Map();
for (const row of rows) {
  const key = `${row.subjectCode}-${row.sectionId}`;
  counts.set(key, (counts.get(key) ?? 0) + classCountFor(row));
}
if ([...counts.values()].some((count) => count !== 14)) {
  throw new Error(`Expected exactly 14 classes for every offering: ${JSON.stringify(Object.fromEntries(counts))}`);
}

const termRef = db.doc(`academicTerms/${TERM_ID}`);
const [termSnapshot, existingSlots] = await Promise.all([
  termRef.get(),
  db.collection("timetableSlots").where("termId", "==", TERM_ID).get(),
]);

console.log(JSON.stringify({
  mode: shouldCommit ? "commit" : "dry-run",
  projectId,
  termId: TERM_ID,
  termStart: TERM_START,
  termEnd: TERM_END,
  termExists: termSnapshot.exists,
  existingTermSlots: existingSlots.size,
  offeringsToUpsert: subjects.length * 2,
  slotsToUpsert: rows.length,
  calculatedClassesPerOffering: Object.fromEntries(counts),
}, null, 2));

if (!shouldCommit) {
  console.log("Dry run only. Add --commit to write these deterministic records.");
  process.exit(0);
}

const batch = db.batch();
batch.set(termRef, {
  name: "Autumn Semester 2026-27 - Term 2",
  startDate: TERM_START,
  endDate: TERM_END,
  active: true,
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

for (const sectionId of ["A", "B"]) {
  for (const subject of subjects) {
    batch.set(db.doc(`subjectOfferings/${subject.code}-${sectionId}`), {
      subjectCode: subject.code,
      subjectName: subject.name,
      faculty: subject.faculty,
      credits: subject.credits,
      sectionId,
      termId: TERM_ID,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

rows.forEach((row, index) => {
  const offeringId = `${row.subjectCode}-${row.sectionId}`;
  const slotId = `${TERM_ID}_${offeringId}_${row.weekday}_${row.startTime.replace(":", "")}_${index}`;
  batch.set(db.doc(`timetableSlots/${slotId}`), {
    offeringId,
    termId: TERM_ID,
    sectionId: row.sectionId,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    room: row.room,
    active: true,
    source: "confirmed_image_import",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

batch.set(db.doc("auditEvents/timetable_TERM-2_section-A-B_v1"), {
  actorUid: "local_admin_script",
  action: "timetable.imported",
  resourceType: "academicTerm",
  resourceId: TERM_ID,
  after: {
    offerings: 12,
    slots: 24,
    sections: ["A", "B"],
    startDate: TERM_START,
    endDate: TERM_END,
    classesPerOffering: 14,
    source: "confirmed_image_import",
  },
  createdAt: FieldValue.serverTimestamp(),
}, { merge: true });

await batch.commit();
console.log("Committed 12 offerings and 24 deterministic weekly slots to TERM-2.");
