import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const TERM_ID = "TERM-1";
const shouldCommit = process.argv.includes("--commit");

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

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

function normalizePrivateKey(value) {
  return value?.replace(/\\n/g, "\n").trim();
}

function validateDate(value, name) {
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
}

loadEnvFile(".env.vercel");

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
if (!projectId || !clientEmail || !privateKey) {
  throw new Error("FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY are required");
}

const termStart = argument("term-start");
const termEnd = argument("term-end");
validateDate(termStart, "term-start");
validateDate(termEnd, "term-end");
if (termStart && termEnd && termEnd < termStart) throw new Error("term-end must not precede term-start");

if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
const db = getFirestore();

const subjects = [
  { code: "SOM601", name: "Communication and Interpersonal Skills" },
  { code: "SOM602", name: "Microeconomics" },
  { code: "SOM603", name: "Fundamentals of Financial & Managerial Accounting" },
  { code: "SOM604", name: "Marketing Management I" },
  { code: "SOM605", name: "Statistical Methods" },
];

const subjectNames = new Map(subjects.map((subject) => [subject.code, subject.name]));
const sectionA = [
  [1, "08:30", "10:30", "SOM601"], [1, "11:00", "13:00", "SOM602"],
  [2, "08:30", "10:30", "SOM604"], [2, "11:00", "13:00", "SOM605"],
  [3, "08:30", "10:30", "SOM603"], [3, "11:00", "13:00", "SOM601"],
  [4, "08:30", "10:30", "SOM604"], [4, "11:00", "13:00", "SOM602"],
  [5, "08:30", "10:30", "SOM603"], [5, "11:00", "13:00", "SOM605"],
];
const sectionB = sectionA.map(([weekday, startTime, endTime], index, rows) => {
  const paired = rows[index % 2 === 0 ? index + 1 : index - 1];
  return [weekday, startTime, endTime, paired[3]];
});

const rows = [
  ...sectionA.map((row) => ({ sectionId: "A", weekday: row[0], startTime: row[1], endTime: row[2], subjectCode: row[3] })),
  ...sectionB.map((row) => ({ sectionId: "B", weekday: row[0], startTime: row[1], endTime: row[2], subjectCode: row[3] })),
];

const termRef = db.doc(`academicTerms/${TERM_ID}`);
const [termSnapshot, existingSlots] = await Promise.all([
  termRef.get(),
  db.collection("timetableSlots").where("termId", "==", TERM_ID).get(),
]);

console.log(JSON.stringify({
  mode: shouldCommit ? "commit" : "dry-run",
  projectId,
  termId: TERM_ID,
  termExists: termSnapshot.exists,
  existingTermStart: termSnapshot.get("startDate") ?? null,
  existingTermEnd: termSnapshot.get("endDate") ?? null,
  existingTermSlots: existingSlots.size,
  offeringsToUpsert: subjects.length * 2,
  slotsToUpsert: rows.length,
  suppliedTermDates: termStart || termEnd ? { startDate: termStart ?? null, endDate: termEnd ?? null } : null,
}, null, 2));

if (!shouldCommit) {
  console.log("Dry run only. Add --commit to write these deterministic records.");
  process.exit(0);
}

const batch = db.batch();
batch.set(termRef, {
  name: "Term 1",
  active: true,
  ...(termStart ? { startDate: termStart } : {}),
  ...(termEnd ? { endDate: termEnd } : {}),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

for (const sectionId of ["A", "B"]) {
  for (const subject of subjects) {
    batch.set(db.doc(`subjectOfferings/${subject.code}-${sectionId}`), {
      subjectCode: subject.code,
      subjectName: subject.name,
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
    room: "",
    active: true,
    source: "confirmed_image_import",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

batch.set(db.doc("auditEvents/timetable_TERM-1_section-A-B_v1"), {
  actorUid: "local_admin_script",
  action: "timetable.imported",
  resourceType: "academicTerm",
  resourceId: TERM_ID,
  after: { offerings: 10, slots: 20, sections: ["A", "B"], source: "confirmed_image_import" },
  createdAt: FieldValue.serverTimestamp(),
}, { merge: true });

await batch.commit();
console.log("Committed 10 offerings and 20 deterministic weekly slots to TERM-1.");
