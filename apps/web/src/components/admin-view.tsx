"use client";

import { useEffect, useState, type FormEvent } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { callFunction, readableError } from "@/lib/callable";
import { getFirebase } from "@/lib/firebase";
import { WorkspaceEditor } from "./workspace-editor";
import { DemoWorkspace } from "./demo-workspace";

interface CsvRow {
  password: string;
  displayName: string;
  rollNumber: string;
  sectionId: "A" | "B";
  wingId: string;
  cr: boolean;
  wingPocWings: string[];
  subjectPocOfferings: string[];
}

interface PushHealth {
  configured?: boolean;
  processed?: number;
  delivered?: number;
  failed?: number;
  lastSuccessAt?: Timestamp;
}

function parseCsv(text: string): CsvRow[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((value) => value.trim());
  const required = ["rollNumber", "password", "displayName", "sectionId", "wingId"];
  if (required.some((field) => !headers.includes(field))) throw new Error(`CSV requires columns: ${required.join(", ")}`);
  return lines.map((line) => {
    const cells = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return {
      password: row.password ?? "", displayName: row.displayName ?? "", rollNumber: (row.rollNumber ?? "").toUpperCase(),
      sectionId: row.sectionId as "A" | "B", wingId: row.wingId ?? "", cr: (row.cr ?? "").toLowerCase() === "true",
      wingPocWings: (row.wingPocWings ?? "").split("|").filter(Boolean),
      subjectPocOfferings: (row.subjectPocOfferings ?? "").split("|").filter(Boolean),
    };
  });
}

export function AdminView({ onNavigate }: { onNavigate?: (view: "reports" | "compliance") => void }) {
  const [batchName, setBatchName] = useState("MBA Batch");
  const [termId, setTermId] = useState("TERM-1");
  const [csvText, setCsvText] = useState("rollNumber,password,displayName,sectionId,wingId,cr\n");
  const [preview, setPreview] = useState<{ valid: boolean; errors: string[]; summary: Record<string, number> } | null>(null);
  const [offering, setOffering] = useState({ offeringId: "", subjectCode: "", subjectName: "", sectionId: "A", termId: "TERM-1" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushHealth, setPushHealth] = useState<PushHealth | null>(null);
  const [schedulerHealth, setSchedulerHealth] = useState<{ processedJobs?: number; deliveries?: number; lastSuccessAt?: Timestamp } | null>(null);

  useEffect(() => {
    const database = getFirebase().db;
    const stopPush = onSnapshot(doc(database, "systemHealth", "push"), (snapshot) => setPushHealth(snapshot.exists() ? snapshot.data() as PushHealth : null));
    const stopScheduler = onSnapshot(doc(database, "systemHealth", "scheduler"), (snapshot) => setSchedulerHealth(snapshot.exists() ? snapshot.data() : null));
    return () => { stopPush(); stopScheduler(); };
  }, []);

  async function initialize(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await callFunction("initializeAppConfig", { batchName, currentTermId: termId }); setMessage("Application configuration initialized."); }
    catch (initError) { setError(readableError(initError)); } finally { setBusy(false); }
  }
  async function validateRoster() {
    setBusy(true); setError(null);
    try { setPreview(await callFunction("validateRosterImport", { rows: parseCsv(csvText) })); }
    catch (validationError) { setError(readableError(validationError)); } finally { setBusy(false); }
  }
  async function commitRoster() {
    setBusy(true); setError(null);
    try { const result = await callFunction<unknown, { total: number }>("commitRosterImport", { rows: parseCsv(csvText) }); setMessage(`${result.total} roster records committed.`); setPreview(null); setCsvText("rollNumber,password,displayName,sectionId,wingId,cr\n"); }
    catch (commitError) { setError(readableError(commitError)); } finally { setBusy(false); }
  }
  async function saveOffering(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await callFunction("saveSubjectOffering", { ...offering, active: true }); setMessage(`${offering.offeringId} saved.`); setOffering({ ...offering, offeringId: "", subjectCode: "", subjectName: "" }); }
    catch (offeringError) { setError(readableError(offeringError)); } finally { setBusy(false); }
  }
  async function migrateWings() {
    setBusy(true); setError(null);
    try { const result = await callFunction<unknown, { updated: number; idempotent?: boolean }>("migrateWingIds", {}); setMessage(result.idempotent ? "Wing migration was already completed." : `${result.updated} legacy records migrated to Wings A–J.`); }
    catch (migrationError) { setError(readableError(migrationError)); } finally { setBusy(false); }
  }
  async function migrateCompetitions() {
    setBusy(true); setError(null);
    try { const result = await callFunction<unknown, { updated: number; idempotent?: boolean }>("migrateCompetitionConfirmations", {}); setMessage(result.idempotent ? "Competition confirmation migration was already completed." : `${result.updated} competition records prepared for dual confirmations.`); }
    catch (migrationError) { setError(readableError(migrationError)); } finally { setBusy(false); }
  }

  return (
    <div className="page-wrap">
      <header className="page-heading"><div><h1>System admin</h1><p>Roster, subject catalogues and delivery health.</p></div>{onNavigate && <div className="form-actions"><button className="secondary-button" onClick={() => onNavigate("compliance")}>Task compliance</button><button className="secondary-button" onClick={() => onNavigate("reports")}>Opportunity reports</button></div>}</header>
      {message && <div className="success-banner" role="status">{message}</div>}{error && <p className="form-error" role="alert">{error}</p>}
      <DemoWorkspace disabled={busy} onBusyChange={setBusy} />
      <div className="admin-grid">
        <WorkspaceEditor title="Batch configuration"><form className="panel create-form" onSubmit={initialize}><div className="panel-head"><div><h2>Batch configuration</h2></div></div><label>Batch name<input value={batchName} onChange={(event) => setBatchName(event.target.value)} required /></label><label>Current term ID<input value={termId} onChange={(event) => setTermId(event.target.value)} required /></label><button className="primary-button" disabled={busy}>Initialize catalogs</button><small>Creates Sections A/B, Wings A–J, the current term, timezone, and reminder defaults.</small></form></WorkspaceEditor>
        <WorkspaceEditor title="Add subject offering"><form className="panel create-form" onSubmit={saveOffering}><div className="panel-head"><div><h2>Subject offering</h2></div></div><div className="form-row"><label>Offering ID<input value={offering.offeringId} onChange={(event) => setOffering({ ...offering, offeringId: event.target.value })} placeholder="FIN-A" required /></label><label>Code<input value={offering.subjectCode} onChange={(event) => setOffering({ ...offering, subjectCode: event.target.value })} placeholder="FIN101" required /></label></div><label>Subject name<input value={offering.subjectName} onChange={(event) => setOffering({ ...offering, subjectName: event.target.value })} required /></label><div className="form-row"><label>Section<select value={offering.sectionId} onChange={(event) => setOffering({ ...offering, sectionId: event.target.value })}><option>A</option><option>B</option></select></label><label>Term<input value={offering.termId} onChange={(event) => setOffering({ ...offering, termId: event.target.value })} required /></label></div><button className="primary-button" disabled={busy}>Save offering</button></form></WorkspaceEditor>
      </div>
      <details className="maintenance-details"><summary>Migration tools</summary>
      <section className="panel create-form migration-panel"><div className="panel-head"><div><h2>Convert W01–W10 to A–J</h2></div></div><p className="helper">Safe to run repeatedly. It updates legacy users, wing task scopes, and assignment snapshots, then marks old wing records inactive.</p><button className="secondary-button" onClick={migrateWings} disabled={busy}>Run wing migration</button></section>
      <section className="panel create-form migration-panel"><div className="panel-head"><div><h2>Enable dual competition confirmations</h2></div></div><p className="helper">Copies legacy registration links, preserves historical records, and flags competitions that still need an internal Google Form.</p><button className="secondary-button" onClick={migrateCompetitions} disabled={busy}>Run competition migration</button></section>
</details>
      <section className="panel create-form migration-panel">
        <div className="panel-head"><div><h2>Scheduler and push health</h2></div></div>
        <div className="form-row">
          <div className="recipient-preview"><strong>Reminder scheduler</strong><p>{schedulerHealth?.lastSuccessAt ? `Last run ${schedulerHealth.lastSuccessAt.toDate().toLocaleString("en-IN")}` : "No successful run recorded yet."}</p><small>{schedulerHealth ? `${schedulerHealth.processedJobs ?? 0} jobs · ${schedulerHealth.deliveries ?? 0} inbox deliveries in the last run` : "Deploy the Cloudflare scheduler to wake maintenance every minute."}</small></div>
          <div className="recipient-preview"><strong>Web Push {pushHealth?.configured === false ? "not configured" : pushHealth?.configured ? "configured" : "not checked"}</strong><p>{pushHealth?.lastSuccessAt ? `Last run ${pushHealth.lastSuccessAt.toDate().toLocaleString("en-IN")}` : "No successful push run recorded yet."}</p><small>{pushHealth ? `${pushHealth.delivered ?? 0} delivered · ${pushHealth.failed ?? 0} failed in the last run` : "Push health appears after the first maintenance pass."}</small></div>
        </div>
      </section>
      <section className="panel roster-panel"><div className="panel-head"><div><h2>Validate, then commit</h2></div><a className="text-button" href="data:text/csv;charset=utf-8,rollNumber%2Cpassword%2CdisplayName%2CsectionId%2CwingId%2Ccr%0A26M2301%2CChangeMe123!%2CAarav%20Shah%2CA%2CA%2Cfalse" download="roster-template.csv">Download template</a></div><p className="helper">Student roll numbers must match <b>26M2xxx</b>. Wing IDs are A–J. Assign Wing and Subject POCs separately from POC Setup. Committing an existing roll number resets its password to the CSV value.</p><textarea aria-label="Roster CSV" className="csv-area" value={csvText} onChange={(event) => { setCsvText(event.target.value); setPreview(null); }} rows={10} spellCheck={false} />{preview && <div className={preview.valid ? "validation-box valid" : "validation-box"}><strong>{preview.valid ? "Roster is valid" : "Resolve validation errors"}</strong><p>{Object.entries(preview.summary).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>{preview.errors.map((item) => <small key={item}>{item}</small>)}</div>}<div className="form-actions"><button className="secondary-button" onClick={validateRoster} disabled={busy}>Validate roster</button><button className="primary-button" onClick={commitRoster} disabled={busy || !preview?.valid}>Commit import</button></div></section>
    </div>
  );
}
