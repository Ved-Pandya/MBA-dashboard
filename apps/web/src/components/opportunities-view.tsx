"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { CompetitionRecord, InternshipRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { useAuth } from "./auth-provider";
import { useClock } from "@/lib/use-clock";
import { WorkspaceEditor } from "./workspace-editor";
import { AppIcon } from "./app-icon";

type ConfirmationStatus = "pending" | "confirmed";
type ResponseRecord = {
  id: string;
  uid?: string;
  opportunityId?: string;
  internshipId?: string;
  status: string;
  registeredLate?: boolean;
  wingId?: string;
  studentSnapshot?: { displayName: string; rollNumber: string };
  externalRegistration?: { status: ConfirmationStatus };
  internalForm?: { status: ConfirmationStatus };
};

const indiaIso = (value: string) => new Date(`${value}:00+05:30`).toISOString();
const indiaLocalInput = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
const normalizeUrl = (value: string) => /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;

function confirmationLabel(response?: ResponseRecord) {
  const external = response?.externalRegistration?.status === "confirmed";
  const internal = response?.internalForm?.status === "confirmed";
  if (external && internal) return "Both forms confirmed";
  if (external || internal) return "One confirmation remaining";
  return "No confirmations yet";
}

export function OpportunitiesView() {
  const { user, profile } = useAuth();
  const now = useClock();
  const [editorRequest, setEditorRequest] = useState(0);
  const [editorCompleted, setEditorCompleted] = useState(0);
  const [tab, setTab] = useState<"competition" | "internship">("competition");
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [responsesError, setResponsesError] = useState("");
  const governor = Boolean(profile?.roles.systemAdmin || profile?.roles.cr);
  const manager = Boolean(governor || profile?.scopes.batchPocRoles?.caseCompetition);
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [internships, setInternships] = useState<InternshipRecord[]>([]);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [internshipResponses, setInternshipResponses] = useState<ResponseRecord[]>([]);
  const [competition, setCompetition] = useState({ title: "", organizer: "", description: "", externalRegistrationUrl: "", internalFormUrl: "", registrationDeadline: "" });
  const [internship, setInternship] = useState({ company: "", role: "", description: "", registrationUrl: "", registrationDeadline: "" });
  const [editingCompetitionId, setEditingCompetitionId] = useState("");
  const [editingInternshipId, setEditingInternshipId] = useState("");
  const [confirmationReport, setConfirmationReport] = useState<{ competitionId: string; rows: ResponseRecord[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !profile) return;
    const db = getFirebase().db;
    setResponsesLoading(true); setResponsesError("");
    const unsubs = [
      onSnapshot(manager ? collection(db, "competitions") : query(collection(db, "competitions"), where("status", "in", ["published", "in_progress", "completed"])), (snap) => setCompetitions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CompetitionRecord)), (snapshotError) => setError(readableError(snapshotError))),
      onSnapshot(governor ? collection(db, "internships") : query(collection(db, "internships"), where("status", "in", ["published", "completed"])), (snap) => setInternships(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as InternshipRecord)), (snapshotError) => setError(readableError(snapshotError))),
      onSnapshot(query(collection(db, "opportunityResponses"), where("uid", "==", user.uid)), (snap) => setResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ResponseRecord))),
      onSnapshot(query(collection(db, "internshipResponses"), where("uid", "==", user.uid), where("status", "in", ["no_response", "registered", "not_participating"])), (snap) => { setInternshipResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ResponseRecord)); setResponsesLoading(false); setResponsesError(""); }, (err) => { setResponsesError(readableError(err)); setResponsesLoading(false); }),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, profile, manager, governor]);

  const responseByCompetition = useMemo(() => new Map(responses.map((item) => [item.opportunityId, item])), [responses]);
  const responseByInternship = useMemo(() => new Map(internshipResponses.map((item) => [item.internshipId, item])), [internshipResponses]);

  async function run(name: string, payload: unknown, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await callFunction(name, payload); setMessage(success); return true; }
    catch (runError) { setError(readableError(runError)); return false; }
    finally { setBusy(false); }
  }

  async function saveCompetition(event: FormEvent) {
    event.preventDefault();
    const existing = competitions.find((item) => item.id === editingCompetitionId);
    const saved = await run(editingCompetitionId ? "updateCompetition" : "createCompetition", {
      ...competition,
      minTeamSize: existing?.minTeamSize ?? 1,
      maxTeamSize: existing?.maxTeamSize ?? 1,
      externalRegistrationUrl: normalizeUrl(competition.externalRegistrationUrl),
      internalFormUrl: normalizeUrl(competition.internalFormUrl),
      ...(editingCompetitionId ? { competitionId: editingCompetitionId } : {}),
      registrationDeadlineIso: indiaIso(competition.registrationDeadline),
    }, editingCompetitionId ? "Competition updated." : "Competition draft created.");
    if (!saved) return;
    setCompetition((current) => ({ ...current, title: "", organizer: "", description: "", externalRegistrationUrl: "", internalFormUrl: "" }));
    setEditingCompetitionId(""); setEditorCompleted((value) => value + 1);
  }

  async function saveInternship(event: FormEvent) {
    event.preventDefault();
    const saved = await run(editingInternshipId ? "updateInternship" : "createInternship", {
      ...internship,
      registrationUrl: internship.registrationUrl ? normalizeUrl(internship.registrationUrl) : "",
      ...(editingInternshipId ? { internshipId: editingInternshipId } : {}),
      registrationDeadlineIso: indiaIso(internship.registrationDeadline),
    }, editingInternshipId ? "Internship updated." : "Internship draft created.");
    if (!saved) return;
    setInternship({ company: "", role: "", description: "", registrationUrl: "", registrationDeadline: "" });
    setEditingInternshipId(""); setEditorCompleted((value) => value + 1);
  }

  function editCompetition(item: CompetitionRecord) {
    setEditorRequest((value) => value + 1);
    setEditingCompetitionId(item.id);
    setCompetition({
      title: item.title, organizer: item.organizer, description: item.description,
      externalRegistrationUrl: item.externalRegistrationUrl ?? item.registrationUrl ?? "",
      internalFormUrl: item.internalFormUrl ?? "",
      registrationDeadline: indiaLocalInput(item.registrationDeadline.toDate()),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editInternship(item: InternshipRecord) {
    setEditorRequest((value) => value + 1);
    setEditingInternshipId(item.id);
    setInternship({ company: item.company, role: item.role, description: item.description, registrationUrl: item.registrationUrl ?? "", registrationDeadline: indiaLocalInput(item.registrationDeadline.toDate()) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadConfirmationReport(competitionId: string) {
    setBusy(true); setError("");
    try {
      const data = await callFunction<{ competitionId: string }, { responses: ResponseRecord[] }>("getCompetitionConfirmationReport", { competitionId });
      setConfirmationReport({ competitionId, rows: data.responses });
    } catch (reportError) { setError(readableError(reportError)); }
    finally { setBusy(false); }
  }

  async function correctConfirmation(row: ResponseRecord, kind: "externalRegistration" | "internalForm") {
    if (!confirmationReport || !row.uid) return;
    const reason = window.prompt("Reason for this audited correction");
    if (!reason) return;
    const current = row[kind]?.status ?? "pending";
    await run("correctCompetitionConfirmation", {
      competitionId: confirmationReport.competitionId,
      uid: row.uid,
      kind,
      status: current === "confirmed" ? "pending" : "confirmed",
      reason,
    }, "Confirmation corrected.");
    await loadConfirmationReport(confirmationReport.competitionId);
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><h1>Opportunities</h1><p>Keep track of registrations and the confirmations your batch needs.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}

    <div className="record-tabs opportunity-tabs" aria-label="Opportunity type"><button aria-label="Competitions" aria-pressed={tab === "competition"} className={tab === "competition" ? "active" : ""} onClick={() => setTab("competition")}>Competitions<span>{competitions.length}</span></button><button aria-label="Internships" aria-pressed={tab === "internship"} className={tab === "internship" ? "active" : ""} onClick={() => setTab("internship")}>Internships<span>{internships.length}</span></button></div>
    {manager && <div className="opportunity-editors">
      {tab === "competition" && <WorkspaceEditor title={editingCompetitionId ? "Edit competition" : "New competition"} editing={Boolean(editingCompetitionId)} request={editorRequest} completed={editorCompleted}><form className="panel create-form" onSubmit={saveCompetition}><div className="panel-head"><div><h2>{editingCompetitionId ? "Edit competition" : "Create competition"}</h2></div></div><label>Title<input value={competition.title} onChange={(event) => setCompetition({ ...competition, title: event.target.value })} required /></label><label>Organizer<input value={competition.organizer} onChange={(event) => setCompetition({ ...competition, organizer: event.target.value })} required /></label><label>Details<textarea value={competition.description} onChange={(event) => setCompetition({ ...competition, description: event.target.value })} required /></label><label>Deadline · IST<input type="datetime-local" value={competition.registrationDeadline} onChange={(event) => setCompetition({ ...competition, registrationDeadline: event.target.value })} required /></label><label>External registration link<input type="text" inputMode="url" placeholder="forms.google.com/..." value={competition.externalRegistrationUrl} onChange={(event) => setCompetition({ ...competition, externalRegistrationUrl: event.target.value })} required /></label><label>Internal Google Form link<input type="text" inputMode="url" placeholder="forms.google.com/..." value={competition.internalFormUrl} onChange={(event) => setCompetition({ ...competition, internalFormUrl: event.target.value })} required /></label><small>Students confirm the external registration and internal form separately.</small><button className="primary-button" disabled={busy}>{editingCompetitionId ? "Save changes" : "Create draft"}</button></form></WorkspaceEditor>}
      {governor && tab === "internship" && <WorkspaceEditor title={editingInternshipId ? "Edit internship" : "New internship"} editing={Boolean(editingInternshipId)} request={editorRequest} completed={editorCompleted}><form className="panel create-form" onSubmit={saveInternship}><div className="panel-head"><div><h2>{editingInternshipId ? "Edit internship" : "Create internship"}</h2></div></div><label>Company<input value={internship.company} onChange={(event) => setInternship({ ...internship, company: event.target.value })} required /></label><label>Role<input value={internship.role} onChange={(event) => setInternship({ ...internship, role: event.target.value })} required /></label><label>Details<textarea value={internship.description} onChange={(event) => setInternship({ ...internship, description: event.target.value })} required /></label><label>Deadline · IST<input type="datetime-local" value={internship.registrationDeadline} onChange={(event) => setInternship({ ...internship, registrationDeadline: event.target.value })} required /></label><label>Registration link<input value={internship.registrationUrl} onChange={(event) => setInternship({ ...internship, registrationUrl: event.target.value })} /></label><button className="primary-button" disabled={busy}>{editingInternshipId ? "Save changes" : "Create draft"}</button>{editingInternshipId && <button type="button" className="secondary-button" onClick={() => { setEditingInternshipId(""); setInternship({ company: "", role: "", description: "", registrationUrl: "", registrationDeadline: "" }); }}>Cancel edit</button>}</form></WorkspaceEditor>}
    </div>}

    {manager && tab === "competition" && <details className="report-disclosure"><summary><AppIcon name="report" />Competition responses<AppIcon name="chevron" /></summary><section className="panel report-teams"><div className="panel-head"><div><h2>Competition form confirmations</h2></div><select aria-label="Choose competition report" value={confirmationReport?.competitionId ?? ""} onChange={(event) => { if (event.target.value) void loadConfirmationReport(event.target.value); }}><option value="">Choose competition</option>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>{confirmationReport ? <div className="simple-table">{confirmationReport.rows.map((row) => <div className="simple-table-row" key={row.id}><strong>{row.studentSnapshot?.displayName ?? row.uid}</strong><span>{row.studentSnapshot?.rollNumber ?? ""}</span><span>Wing {row.wingId ?? "–"}</span><span>External: {row.externalRegistration?.status ?? "pending"} <button className="text-button" onClick={() => void correctConfirmation(row, "externalRegistration")}>Correct</button><br />Internal: {row.internalForm?.status ?? "pending"} <button className="text-button" onClick={() => void correctConfirmation(row, "internalForm")}>Correct</button></span></div>)}</div> : <p className="helper">Choose a competition to inspect named confirmation status.</p>}</section></details>}

    <div className="opportunity-grid">
      <section className="panel managed-list" hidden={tab !== "competition"}><div className="panel-head"><div><h2>Competition registrations</h2></div><span className="count-badge">{competitions.length}</span></div>{competitions.map((item) => { const response = responseByCompetition.get(item.id); const canConfirm = item.status === "published" && item.registrationDeadline.toMillis() > now && Boolean(response); return <article className="opportunity-card" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{item.organizer} · {formatDeadline(item.registrationDeadline)}</p><small className="confirmation-state">{confirmationLabel(response)}</small>{item.description && <details className="item-description"><summary>Details</summary><p>{item.description}</p></details>}{item.status === "published" && item.registrationDeadline.toMillis() <= now && <small>Confirmation deadline has passed.</small>}</div><div className="opportunity-actions">{item.externalRegistrationUrl && <a className="resource-link" href={item.externalRegistrationUrl} target="_blank" rel="noreferrer">Open external form</a>}{item.internalFormUrl && <a className="resource-link" href={item.internalFormUrl} target="_blank" rel="noreferrer">Open internal form</a>}{canConfirm && <><button className={response?.externalRegistration?.status === "confirmed" ? "primary-button" : "secondary-button"} onClick={() => run(response?.externalRegistration?.status === "confirmed" ? "reopenCompetitionConfirmation" : "setCompetitionConfirmation", { competitionId: item.id, kind: "externalRegistration" }, "External confirmation updated.")} disabled={busy}>{response?.externalRegistration?.status === "confirmed" ? "External confirmed" : "Confirm external"}</button><button className={response?.internalForm?.status === "confirmed" ? "primary-button" : "secondary-button"} onClick={() => run(response?.internalForm?.status === "confirmed" ? "reopenCompetitionConfirmation" : "setCompetitionConfirmation", { competitionId: item.id, kind: "internalForm" }, "Internal confirmation updated.")} disabled={busy}>{response?.internalForm?.status === "confirmed" ? "Internal confirmed" : "Confirm internal"}</button></>}{manager && ["draft", "published"].includes(item.status) && <button className="secondary-button" disabled={busy} onClick={() => editCompetition(item)}>Edit</button>}{manager && item.status === "draft" && <button onClick={() => run("publishCompetition", { competitionId: item.id }, "Competition published.")} disabled={busy}>Publish</button>}{manager && ["draft", "published"].includes(item.status) && <button className="danger-link text-button" onClick={() => { const reason = window.prompt("Cancellation reason"); if (reason) void run("cancelCompetition", { competitionId: item.id, reason }, "Competition cancelled."); }}>Cancel</button>}</div></article>; })}</section>
      <section className="panel managed-list" hidden={tab !== "internship"}><div className="panel-head"><div><h2>Internship registrations</h2></div><span className="count-badge">{internships.length}</span></div>{!internships.length && !responsesLoading && <p className="list-message">No internships have been published yet.</p>}{responsesLoading && <p className="helper" role="status">Loading your internship assignments…</p>}{responsesError && <p className="form-error" role="alert">Could not load your internship assignments. {responsesError} Reopen this page to retry.</p>}{internships.map((item) => { const response = responseByInternship.get(item.id); const assignedToMe = Boolean(response && response.status !== "not_applicable_placed"); return <article className="opportunity-card" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.company} · {item.role}</h3><p>{formatDeadline(item.registrationDeadline)}</p></div><div className="opportunity-actions">{item.registrationUrl && (governor || assignedToMe) && <a className="resource-link" href={item.registrationUrl} target="_blank" rel="noreferrer">Open form</a>}{item.status === "published" && assignedToMe && <><button className={response?.status === "registered" ? "primary-button" : "secondary-button"} aria-pressed={response?.status === "registered"} disabled={busy} onClick={() => run("setInternshipResponse", { internshipId: item.id, status: "registered", confirmationReference: "self-attested" }, "Registration recorded.")}>I registered</button><button className={response?.status === "not_participating" ? "primary-button" : "secondary-button"} aria-pressed={response?.status === "not_participating"} disabled={busy} onClick={() => run("setInternshipResponse", { internshipId: item.id, status: "not_participating" }, "Response recorded.")}>Not participating</button></>}{!governor && !assignedToMe && !responsesLoading && !responsesError && <small>No action assigned.</small>}{governor && item.status === "draft" && <button onClick={() => run("publishInternship", { internshipId: item.id }, "Internship published.")}>Publish</button>}{governor && ["draft", "published"].includes(item.status) && <><button className="secondary-button" onClick={() => editInternship(item)} disabled={busy}>Edit</button><button className="danger-link text-button" disabled={busy} onClick={() => { const reason = window.prompt("Cancellation reason"); if (reason) void run("cancelInternship", { internshipId: item.id, reason }, "Internship cancelled."); }}>Cancel</button></>}{assignedToMe && <small>My status: {response?.status}</small>}</div></article>; })}</section>
    </div>
  </div>;
}
