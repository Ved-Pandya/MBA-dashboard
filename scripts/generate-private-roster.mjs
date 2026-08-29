import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve(process.argv[2] ?? "imports/wing-section-mapping.csv");
const rosterPath = resolve(process.argv[3] ?? "imports/roster.production.csv");
const pocPath = resolve(process.argv[4] ?? "imports/poc-assignments.private.csv");

if (!existsSync(sourcePath)) throw new Error(`Section mapping not found: ${sourcePath}`);
if (existsSync(rosterPath) || existsSync(pocPath)) {
  throw new Error("Private roster output already exists. Move or delete it explicitly before generating a different password set.");
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function pick(characters) {
  return characters[randomInt(characters.length)];
}

function password() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%_-";
  const all = `${upper}${lower}${digits}${symbols}`;
  const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (characters.length < 18) characters.push(pick(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join("");
}

const lines = readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
const headers = parseCsvLine(lines.shift());
const rows = lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])));

if (rows.length !== 114) throw new Error(`Expected 114 students, found ${rows.length}`);
if (new Set(rows.map((row) => row.rollNumber)).size !== rows.length) throw new Error("Roll numbers are not unique");
if (rows.some((row) => !/^26M2\d{3}$/.test(row.rollNumber))) throw new Error("Every student roll number must match 26M2xxx");
if (rows.filter((row) => row.sectionId === "A").length !== 57 || rows.filter((row) => row.sectionId === "B").length !== 57) throw new Error("Expected a 57/57 section split");

const passwords = new Set();
const rosterRows = [["rollNumber", "password", "displayName", "sectionId", "wingId", "cr"]];
for (const row of rows) {
  let generated = password();
  while (passwords.has(generated)) generated = password();
  passwords.add(generated);
  rosterRows.push([row.rollNumber, generated, row.displayName, row.sectionId, row.wingId, row.pocMarker.toLowerCase() === "cr"]);
}

const pocRows = [["kind", "scopeId", "rollNumber", "displayName"]];
for (const row of rows) {
  const marker = row.pocMarker.toLowerCase();
  if (marker === "wing poc") pocRows.push(["wing", row.wingId, row.rollNumber, row.displayName]);
  else if (marker === "grooming poc") pocRows.push(["grooming", "batch", row.rollNumber, row.displayName]);
  else if (marker === "attendance poc") pocRows.push(["attendance", "batch", row.rollNumber, row.displayName]);
  else if (marker === "case comp poc") pocRows.push(["case_competition", "batch", row.rollNumber, row.displayName]);
}

const wingAssignments = pocRows.slice(1).filter((row) => row[0] === "wing");
if (wingAssignments.length !== 10 || new Set(wingAssignments.map((row) => row[1])).size !== 10) throw new Error("Expected exactly one Wing POC for Wings A-J");
for (const kind of ["grooming", "attendance", "case_competition"]) {
  if (pocRows.slice(1).filter((row) => row[0] === kind).length !== 1) throw new Error(`Expected exactly one ${kind} POC`);
}

mkdirSync(dirname(rosterPath), { recursive: true });
writeFileSync(rosterPath, csv(rosterRows), { encoding: "utf8", flag: "wx" });
writeFileSync(pocPath, csv(pocRows), { encoding: "utf8", flag: "wx" });

console.log(JSON.stringify({
  students: rows.length,
  sectionA: 57,
  sectionB: 57,
  uniquePasswords: passwords.size,
  passwordLength: 18,
  crs: rosterRows.slice(1).filter((row) => row[5] === true).length,
  pocAssignments: pocRows.length - 1,
  rosterPath,
  pocPath,
}, null, 2));
