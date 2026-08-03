"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import type { AssignmentRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline, urgency } from "@/lib/date";

export function ComplianceView() {
  const { profile } = useAuth();
  const scopes = useMemo(() => [
    ...Object.keys(profile?.scopes.subjectPocOfferings ?? {}).map((id) => `subject:${id}`),
    ...Object.keys(profile?.scopes.wingPocWings ?? {}).map((id) => `wing:${id}`),
  ], [profile]);
  const broadAccess = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const [scope, setScope] = useState(broadAccess ? "all" : scopes[0] ?? "");
  const [status, setStatus] = useState<"all" | "pending" | "completed" | "exempt">("pending");
  const [records, setRecords] = useState<AssignmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || (!broadAccess && !scope)) return;
    const [scopeKind, scopeId] = scope.split(":");
    const clauses = scope !== "all"
      ? [where(scopeKind === "wing" ? "wingId" : "subjectOfferingId", "==", scopeId)]
      : [];
    return onSnapshot(query(collection(getFirebase().db, "taskAssignments"), ...clauses, limit(500)), (snap) => {
      setRecords(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AssignmentRecord));
    }, (queryError) => setError(readableError(queryError)));
  }, [profile, broadAccess, scope]);

  const filtered = records.filter((item) => status === "all" || item.status === status)
    .sort((a, b) => a.taskSnapshot.dueAt.toMillis() - b.taskSnapshot.dueAt.toMillis());
  const completed = records.filter((item) => item.status === "completed").length;
  const overdue = records.filter((item) => urgency(item.taskSnapshot.dueAt, item.status) === "overdue").length;
  const compliance = records.length ? Math.round((completed / records.length) * 100) : 100;

  async function downloadCsv() {
    try {
      const result = await callFunction<Record<string, string>, { csv: string }>("getComplianceExport", {
        ...(scope !== "all" ? { scopeKey: scope } : {}),
        ...(status !== "all" ? { status } : {}),
      });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `compliance-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (exportError) { setError(readableError(exportError)); }
  }

  async function exempt(record: AssignmentRecord) {
    const reason = window.prompt(`Reason for exempting ${record.studentSnapshot.displayName}?`);
    if (!reason) return;
    try { await callFunction("setTaskExemption", { taskId: record.taskId, uid: record.uid, reason }); }
    catch (exemptError) { setError(readableError(exemptError)); }
  }

  return (
    <div className="page-wrap">
      <header className="page-heading"><div><p className="eyebrow">COMPLIANCE DESK</p><h1>Know exactly what’s pending.</h1><p>Named, auditable submission status—never inferred from a missing document.</p></div><button className="secondary-button" onClick={downloadCsv}>Export CSV ↓</button></header>
      <section className="stats-grid stats-three">
        <article className="stat-card"><span>Recipients</span><strong>{records.length}</strong><small>Current query</small></article>
        <article className="stat-card success"><span>Compliance</span><strong>{compliance}%</strong><small>{completed} completed</small></article>
        <article className="stat-card danger"><span>Overdue</span><strong>{overdue}</strong><small>Needs intervention</small></article>
      </section>
      <section className="panel compliance-panel">
        <div className="toolbar">
          <label>Scope<select value={scope} onChange={(event) => setScope(event.target.value)}>{broadAccess && <option value="all">Entire batch</option>}{scopes.map((item) => <option key={item} value={item}>{item.replace(":", " · ")}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="pending">Pending</option><option value="completed">Completed</option><option value="exempt">Exempt</option><option value="all">All</option></select></label>
          <span className="result-count">{filtered.length} records</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="table-scroll"><table><thead><tr><th>Student</th><th>Task</th><th>Scope</th><th>Deadline</th><th>Status</th><th /></tr></thead><tbody>
          {filtered.map((record) => <tr key={record.id}><td><strong>{record.studentSnapshot.displayName}</strong><small>{record.studentSnapshot.rollNumber} · Section {record.sectionId} · {record.wingId}</small></td><td>{record.taskSnapshot.title}</td><td>{record.scopeKey.replace(":", " · ")}</td><td>{formatDeadline(record.taskSnapshot.dueAt)}</td><td><span className={`status-pill ${urgency(record.taskSnapshot.dueAt, record.status)}`}>{urgency(record.taskSnapshot.dueAt, record.status)}</span></td><td>{record.status !== "exempt" && !profile?.roles.cr && <button className="text-button" onClick={() => exempt(record)}>Exempt</button>}</td></tr>)}
        </tbody></table></div>
        {!filtered.length && <div className="empty-state"><span>◎</span><h3>No matching records</h3><p>Try another scope or status.</p></div>}
      </section>
    </div>
  );
}
