"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import type { SessionIntimationRecord, SessionResponseRecord } from "@/lib/models";
import { useAuth } from "./auth-provider";

function indiaIso(value: string) { return new Date(`${value}:00+05:30`).toISOString(); }
function localInput(date: Date) { return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16); }

export function SessionsView() {
  const { user, profile } = useAuth();
  const manager = Boolean(profile?.roles.cr || profile?.roles.systemAdmin || Object.keys(profile?.scopes.wingPocWings ?? {}).length);
  const [sessions, setSessions] = useState<SessionIntimationRecord[]>([]);
  const [responses, setResponses] = useState<SessionResponseRecord[]>([]);
  const [form, setForm] = useState({ title: "", details: "", venue: "", sessionStartsAt: "", responseDeadline: "" });
  const [editingSessionId, setEditingSessionId] = useState("");
  const [report, setReport] = useState<{ sessionId: string; rows: SessionResponseRecord[] } | null>(null);
  const [filter, setFilter] = useState({ status: "all", wingId: "all", sectionId: "all" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !profile) return;
    const db = getFirebase().db;
    const sessionsQuery = manager ? collection(db, "sessionIntimations") : query(collection(db, "sessionIntimations"), where("status", "in", ["published", "closed", "cancelled"]));
    const unsubSessions = onSnapshot(sessionsQuery, (snap) => setSessions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SessionIntimationRecord)), (err) => setError(readableError(err)));
    const unsubResponses = onSnapshot(query(collection(db, "sessionResponses"), where("uid", "==", user.uid)), (snap) => setResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SessionResponseRecord)), (err) => setError(readableError(err)));
    return () => { unsubSessions(); unsubResponses(); };
  }, [user, profile, manager]);

  const responseBySession = useMemo(() => new Map(responses.map((item) => [item.sessionId, item])), [responses]);
  const sorted = useMemo(() => [...sessions].sort((a, b) => a.sessionStartsAt.toMillis() - b.sessionStartsAt.toMillis()), [sessions]);
  const reportRows = useMemo(() => (report?.rows ?? []).filter((row) => (filter.status === "all" || row.status === filter.status) && (filter.wingId === "all" || row.studentSnapshot.wingId === filter.wingId) && (filter.sectionId === "all" || row.studentSnapshot.sectionId === filter.sectionId)), [report, filter]);

  async function run(name: string, payload: unknown, success: string) { setBusy(true); setError(""); setMessage(""); try { await callFunction(name, payload); setMessage(success); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }
  async function create(event: FormEvent) { event.preventDefault(); await run(editingSessionId ? "updateSessionIntimation" : "createSessionIntimation", { ...(editingSessionId ? { sessionId: editingSessionId } : {}), title: form.title, details: form.details, venue: form.venue, sessionStartsAtIso: indiaIso(form.sessionStartsAt), responseDeadlineIso: indiaIso(form.responseDeadline) }, editingSessionId ? "Session updated." : "Session draft created."); setForm({ title: "", details: "", venue: "", sessionStartsAt: "", responseDeadline: "" }); setEditingSessionId(""); }
  function edit(item: SessionIntimationRecord) { setEditingSessionId(item.id); setForm({ title: item.title, details: item.details, venue: item.venue ?? "", sessionStartsAt: localInput(item.sessionStartsAt.toDate()), responseDeadline: localInput(item.responseDeadline.toDate()) }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function loadReport(sessionId: string) { setBusy(true); setError(""); try { const data = await callFunction<{ sessionId: string }, { responses: SessionResponseRecord[] }>("getSessionReport", { sessionId }); setReport({ sessionId, rows: data.responses }); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">PLACEMENT SESSIONS</p><h1>Attendance intimation</h1><p>Confirm whether you plan to attend before the response deadline.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}
    {manager && <form className="panel create-form" onSubmit={create}><div className="panel-head"><div><p className="eyebrow">MANAGE</p><h2>{editingSessionId ? "Edit batch session" : "Create a batch session"}</h2></div></div>
      <label>Session name<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label>Details<textarea value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} rows={3} /></label><label>Venue<input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label>
      <div className="form-row"><label>Session starts · IST<input type="datetime-local" value={form.sessionStartsAt} onChange={(event) => setForm({ ...form, sessionStartsAt: event.target.value })} required /></label><label>Response deadline · IST<input type="datetime-local" value={form.responseDeadline} onChange={(event) => setForm({ ...form, responseDeadline: event.target.value })} required /></label></div><div className="form-actions">{editingSessionId && <button type="button" className="secondary-button" onClick={() => setEditingSessionId("")}>Cancel edit</button>}<button className="primary-button" disabled={busy}>{editingSessionId ? "Save changes" : "Create draft"}</button></div>
    </form>}
    <section className="panel managed-list"><div className="panel-head"><div><p className="eyebrow">SESSIONS</p><h2>Upcoming and previous</h2></div><span className="count-badge">{sessions.length}</span></div>
      {!sorted.length && <p className="helper">No placement sessions have been published.</p>}
      {sorted.map((item) => { const response = responseBySession.get(item.id); const open = item.status === "published" && item.responseDeadline.toMillis() > Date.now(); return <article className="managed-task" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{formatDeadline(item.sessionStartsAt)}{item.venue ? ` · ${item.venue}` : ""}</p><small>Respond by {formatDeadline(item.responseDeadline)} · Your answer: {response?.status.replaceAll("_", " ") ?? "not assigned"}</small></div><div className="managed-actions">
        {open && response && <><button className={response.status === "attending" ? "primary-button" : "secondary-button"} onClick={() => run("setSessionResponse", { sessionId: item.id, status: "attending" }, "Attendance response saved.")} disabled={busy}>Attending</button><button className={response.status === "not_attending" ? "primary-button" : "secondary-button"} onClick={() => run("setSessionResponse", { sessionId: item.id, status: "not_attending" }, "Attendance response saved.")} disabled={busy}>Not attending</button></>}
        {manager && ["draft", "published"].includes(item.status) && <button className="secondary-button" onClick={() => edit(item)} disabled={busy}>Edit</button>}{manager && item.status === "draft" && <button onClick={() => run("publishSessionIntimation", { sessionId: item.id }, "Session published to the batch.")} disabled={busy}>Publish</button>}{manager && item.status === "published" && <><button className="secondary-button" onClick={() => void loadReport(item.id)} disabled={busy}>View responses</button><button onClick={() => run("closeSessionIntimation", { sessionId: item.id }, "Session responses closed.")} disabled={busy}>Close</button></>}{manager && ["draft", "published"].includes(item.status) && <button className="danger-link" onClick={() => { const reason = window.prompt("Cancellation reason"); if (reason) void run("cancelSessionIntimation", { sessionId: item.id, reason }, "Session cancelled."); }} disabled={busy}>Cancel</button>}
      </div></article>; })}
    </section>
    {manager && report && <section className="panel"><div className="panel-head"><div><p className="eyebrow">NAMED REPORT</p><h2>Session responses</h2></div><span className="count-badge">{reportRows.length}</span></div><div className="form-row"><label>Status<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="all">All</option><option value="no_response">No response</option><option value="attending">Attending</option><option value="not_attending">Not attending</option></select></label><label>Wing<select value={filter.wingId} onChange={(event) => setFilter({ ...filter, wingId: event.target.value })}><option value="all">All Wings</option>{"ABCDEFGHIJ".split("").map((wing) => <option key={wing}>{wing}</option>)}</select></label><label>Section<select value={filter.sectionId} onChange={(event) => setFilter({ ...filter, sectionId: event.target.value })}><option value="all">Both</option><option>A</option><option>B</option></select></label></div><div className="simple-table">{reportRows.map((row) => <div className="simple-table-row" key={row.id}><strong>{row.studentSnapshot.displayName}</strong><span>{row.studentSnapshot.rollNumber}</span><span>Wing {row.studentSnapshot.wingId}</span><span><span className="status-pill">{row.status.replaceAll("_", " ")}</span> <button className="text-button" onClick={async () => { const reason = window.prompt("Reason for correction"); if (!reason) return; await run("correctSessionResponse", { sessionId: report.sessionId, uid: row.uid, status: row.status === "attending" ? "not_attending" : "attending", reason }, "Response corrected."); await loadReport(report.sessionId); }}>Correct</button></span></div>)}</div></section>}
  </div>;
}
