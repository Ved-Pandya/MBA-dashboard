"use client";

import { useEffect, useMemo, useState } from "react";
import { callFunction, readableError } from "@/lib/callable";

type Candidate = { uid: string; displayName: string; rollNumber: string; sectionId: string; wingId: string };
type PocKind = "wing" | "subject" | "grooming" | "case_competition" | "attendance";
type Assignment = { id: string; kind: PocKind; scopeId: string; uid: string; seat?: 1 | 2; active: boolean };
type Setup = {
  users: Candidate[];
  assignments: Assignment[];
  offerings: Array<{ id: string; subjectCode: string; subjectName: string; sectionId: string }>;
  wings: Array<{ id: string; name: string }>;
};

export function PocSetupView() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PocKind>("wing");
  const [scopeId, setScopeId] = useState("A");
  const [seat, setSeat] = useState<1 | 2>(1);
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try { setSetup(await callFunction<unknown, Setup>("getPocSetup", {})); }
    catch (loadError) { setError(readableError(loadError)); }
  }
  useEffect(() => { void load(); }, []);

  const candidates = useMemo(() => (setup?.users ?? []).filter((user) => `${user.displayName} ${user.rollNumber}`.toLowerCase().includes(query.toLowerCase())), [setup, query]);
  const scopes = kind === "wing" ? (setup?.wings ?? []) : kind === "subject" ? (setup?.offerings ?? []).map((item) => ({ id: item.id, name: `${item.subjectCode} · Section ${item.sectionId}` })) : [{ id: "batch", name: kind === "grooming" ? "Entire batch · Grooming" : kind === "attendance" ? "Entire batch · Attendance" : "Entire batch · Case competitions" }];
  const assignmentKey = (itemKind: PocKind, itemScopeId: string, itemSeat = 1) => itemKind === "subject" ? `${itemKind}_${itemScopeId}_${itemSeat}` : `${itemKind}_${itemScopeId}`;
  const assigned = new Map((setup?.assignments ?? []).map((item) => [assignmentKey(item.kind, item.scopeId, item.seat ?? 1), item]));
  const names = new Map((setup?.users ?? []).map((item) => [item.uid, `${item.displayName} (${item.rollNumber})`]));

  async function assign() {
    if (!uid || !scopeId) return;
    setBusy(true); setError("");
    try { await callFunction("assignPoc", { kind, scopeId, uid, ...(kind === "subject" ? { seat } : {}) }); setMessage("POC assignment saved and affected students were notified."); await load(); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  async function revoke(target: Assignment) {
    if (!window.confirm(`Remove the POC for ${target.scopeId}?`)) return;
    setBusy(true); setError("");
    try { await callFunction("revokePoc", { kind: target.kind, scopeId: target.scopeId, ...(target.kind === "subject" ? { seat: target.seat ?? 1 } : {}) }); setMessage("POC assignment revoked."); await load(); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><h1>POC Setup</h1><p>Two active POCs per subject-section offering; one active owner for every other scope.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}
    <div className="two-column">
      <section className="panel create-form">
        <div className="panel-head"><div><h2>Choose scope and student</h2></div></div>
        <label>POC type<select value={kind} onChange={(event) => { const next = event.target.value as PocKind; setKind(next); setSeat(1); setScopeId(next === "wing" ? "A" : next === "subject" ? setup?.offerings[0]?.id ?? "" : "batch"); }}><option value="wing">Wing POC</option><option value="subject">Subject POC</option><option value="grooming">Grooming POC</option><option value="case_competition">Case Competition POC</option><option value="attendance">Attendance POC</option></select></label>
        <label>Scope<select value={scopeId} onChange={(event) => setScopeId(event.target.value)}>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</select></label>
        {kind === "subject" && <label>Subject POC seat<select value={seat} onChange={(event) => setSeat(Number(event.target.value) as 1 | 2)}><option value={1}>POC 1</option><option value={2}>POC 2</option></select></label>}
        <label>Search by name or roll number<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="26M2xxx or student name" /></label>
        <label>Student<select value={uid} onChange={(event) => setUid(event.target.value)}><option value="">Select student</option>{candidates.slice(0, 50).map((person) => <option key={person.uid} value={person.uid}>{person.displayName} · {person.rollNumber} · Wing {person.wingId}</option>)}</select></label>
        <button className="primary-button" onClick={assign} disabled={busy || !uid || !scopeId}>Assign or replace POC</button>
      </section>
      <section className="panel managed-list">
        <div className="panel-head"><div><h2>Governance directory</h2></div><span className="count-badge">{assigned.size}</span></div>
        {scopes.flatMap((scope) => (kind === "subject" ? [1, 2] : [1]).map((scopeSeat) => {
          const assignment = assigned.get(assignmentKey(kind, scope.id, scopeSeat));
          return <article className="managed-task" key={`${scope.id}_${scopeSeat}`}><div><span className="category">{kind === "subject" ? `subject · POC ${scopeSeat}` : kind}</span><h3>{scope.name}</h3><p>{assignment ? names.get(assignment.uid) ?? assignment.uid : "No POC assigned"}</p></div>{assignment && <button className="danger-link text-button" onClick={() => revoke(assignment)} disabled={busy}>Revoke</button>}</article>;
        }))}
      </section>
    </div>
  </div>;
}
