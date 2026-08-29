"use client";

import { useEffect, useMemo, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { callFunction, readableError } from "@/lib/callable";

type ComplianceKind = "deadline" | "competition" | "internship" | "session" | "poll";
type ComplianceStatus = "non_responder" | "action_needed" | "responded" | "completed" | "exempt";
type StatusFilter = "all" | ComplianceStatus;
type WingFilter = "all" | (typeof WING_IDS)[number];

type ComplianceItem = {
  key: string;
  id: string;
  kind: ComplianceKind;
  title: string;
  dueAtIso: string;
  scopeLabel: string;
};

type ComplianceRow = {
  id: string;
  itemKey: string;
  itemId: string;
  kind: ComplianceKind;
  uid: string;
  displayName: string;
  rollNumber: string;
  sectionId: string;
  wingId: string;
  status: ComplianceStatus;
  responseLabel: string;
  completedLate?: boolean;
};

type CompliancePayload = {
  items: ComplianceItem[];
  rows: ComplianceRow[];
  generatedAtIso: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function responseComplete(status: ComplianceStatus) {
  return status === "responded" || status === "completed";
}

export function CurrentComplianceView() {
  const [payload, setPayload] = useState<CompliancePayload>({ items: [], rows: [], generatedAtIso: "" });
  const [itemKey, setItemKey] = useState("all");
  const [wing, setWing] = useState<WingFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("non_responder");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true); setError("");
    try {
      const result = await callFunction<Record<string, never>, CompliancePayload>("getCurrentTaskCompliance", {});
      setPayload(result);
      if (itemKey !== "all" && !result.items.some((item) => item.key === itemKey)) setItemKey("all");
    } catch (loadError) { setError(readableError(loadError)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItem = payload.items.find((item) => item.key === itemKey);
  const scopedRows = useMemo(() => payload.rows.filter((row) => (
    (itemKey === "all" || row.itemKey === itemKey) && (wing === "all" || row.wingId === wing)
  )), [payload.rows, itemKey, wing]);
  const filteredRows = useMemo(() => scopedRows
    .filter((row) => status === "all" || row.status === status)
    .sort((a, b) => a.wingId.localeCompare(b.wingId) || a.rollNumber.localeCompare(b.rollNumber)), [scopedRows, status]);

  const summaries = useMemo(() => payload.items.map((item) => {
    const rows = payload.rows.filter((row) => row.itemKey === item.key);
    const accountable = rows.filter((row) => row.status !== "exempt");
    const complete = accountable.filter((row) => responseComplete(row.status)).length;
    return {
      ...item,
      recipients: rows.length,
      nonResponders: rows.filter((row) => row.status === "non_responder").length,
      actionNeeded: rows.filter((row) => row.status === "action_needed").length,
      complete,
      rate: accountable.length ? Math.round((complete / accountable.length) * 100) : null,
    };
  }), [payload]);

  const wingStats = useMemo(() => WING_IDS.map((wingId) => {
    const rows = payload.rows.filter((row) => (itemKey === "all" || row.itemKey === itemKey) && row.wingId === wingId);
    const accountable = rows.filter((row) => row.status !== "exempt");
    const complete = accountable.filter((row) => responseComplete(row.status)).length;
    return {
      wingId, total: rows.length,
      nonResponders: rows.filter((row) => row.status === "non_responder").length,
      actionNeeded: rows.filter((row) => row.status === "action_needed").length,
      complete,
      rate: accountable.length ? Math.round((complete / accountable.length) * 100) : null,
    };
  }), [payload.rows, itemKey]);

  const nonResponders = scopedRows.filter((row) => row.status === "non_responder").length;
  const actionNeeded = scopedRows.filter((row) => row.status === "action_needed").length;
  const accountable = scopedRows.filter((row) => row.status !== "exempt");
  const complete = accountable.filter((row) => responseComplete(row.status)).length;
  const compliance = accountable.length ? Math.round((complete / accountable.length) * 100) : null;

  function selectItem(next: string) {
    setItemKey(next); setWing("all");
  }

  function downloadCsv() {
    const headings = ["Task", "Type", "Student", "Roll number", "Section", "Wing", "Status", "Recorded response", "Deadline"];
    const rows = filteredRows.map((row) => {
      const item = payload.items.find((candidate) => candidate.key === row.itemKey);
      return [item?.title, row.kind, row.displayName, row.rollNumber, row.sectionId, row.wingId, row.status, row.responseLabel, item?.dueAtIso];
    });
    const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `current-task-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">COMPLIANCE DESK</p><h1>Current task compliance</h1><p>All ongoing deadlines, opportunities, placement sessions, and polls in one response matrix.</p></div><div className="form-actions"><button className="secondary-button" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button><button className="secondary-button" onClick={downloadCsv} disabled={!filteredRows.length}>Export CSV ↓</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}

    <section className="panel compliance-panel current-task-panel">
      <div className="panel-head"><div><p className="eyebrow">ONGOING TASKS</p><h2>Response status by task</h2><p className="helper">Published items stay here until a manager closes, completes, or cancels them.</p></div><span className="count-badge">{summaries.length} current</span></div>
      <div className="table-scroll"><table><thead><tr><th>Task</th><th>Type</th><th>Deadline</th><th>Recipients</th><th>Non-responders</th><th>Action needed</th><th>Compliant</th><th /></tr></thead><tbody>
        {summaries.map((item) => <tr key={item.key} className={itemKey === item.key ? "selected-wing-row" : undefined}><td><strong>{item.title}</strong><small>{item.scopeLabel.replace(":", " · ")}</small></td><td><span className="status-pill">{item.kind}</span></td><td>{formatDate(item.dueAtIso)}{new Date(item.dueAtIso).getTime() < Date.now() && <small className="danger-text">Deadline passed</small>}</td><td>{item.recipients}</td><td><strong>{item.nonResponders}</strong></td><td>{item.actionNeeded}</td><td><strong>{item.rate === null ? "—" : `${item.rate}%`}</strong></td><td><button className="text-button" onClick={() => { selectItem(item.key); setStatus("non_responder"); }}>View students</button></td></tr>)}
      </tbody></table></div>
      {!busy && !summaries.length && <div className="empty-state"><span>◌</span><h3>No ongoing tasks</h3><p>Publish a form, competition, internship, session, or poll and it will appear here.</p></div>}
    </section>

    <section className="stats-grid">
      <article className="stat-card"><span>Recipients</span><strong>{scopedRows.length}</strong><small>{selectedItem?.title ?? "All ongoing tasks"}</small></article>
      <article className="stat-card danger"><span>Non-responders</span><strong>{nonResponders}</strong><small>No response recorded</small></article>
      <article className="stat-card warning"><span>Action needed</span><strong>{actionNeeded}</strong><small>Started but incomplete</small></article>
      <article className="stat-card success"><span>Compliance</span><strong>{compliance === null ? "—" : `${compliance}%`}</strong><small>{complete} responded or completed</small></article>
    </section>

    <section className="panel compliance-panel">
      <div className="toolbar"><label>Task<select value={itemKey} onChange={(event) => selectItem(event.target.value)}><option value="all">All ongoing tasks</option>{payload.items.map((item) => <option key={item.key} value={item.key}>{item.title} · {item.kind}</option>)}</select></label><label>Wing<select value={wing} onChange={(event) => setWing(event.target.value as WingFilter)}><option value="all">All wings</option>{WING_IDS.map((wingId) => <option key={wingId} value={wingId}>Wing {wingId}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="non_responder">Non-responders</option><option value="action_needed">Action needed</option><option value="responded">Responded</option><option value="completed">Completed</option><option value="exempt">Exempt</option><option value="all">All statuses</option></select></label><span className="result-count">{filteredRows.length} students</span></div>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Wing</th><th>Task</th><th>Type</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{filteredRows.map((row) => { const item = payload.items.find((candidate) => candidate.key === row.itemKey); return <tr key={`${row.itemKey}_${row.id}`}><td><strong>{row.displayName}</strong><small>{row.rollNumber} · Section {row.sectionId}</small></td><td><strong>Wing {row.wingId}</strong></td><td>{item?.title}</td><td>{row.kind}</td><td>{item ? formatDate(item.dueAtIso) : "—"}</td><td><span className={`status-pill ${row.status === "non_responder" ? "overdue" : row.status === "action_needed" ? "urgent" : "done"}`}>{row.status === "non_responder" ? "Non-responder" : row.responseLabel}</span>{row.completedLate && <small>Late</small>}</td></tr>; })}</tbody></table></div>
      {!busy && !filteredRows.length && <div className="empty-state"><span>◌</span><h3>No matching students</h3><p>There are no students in this task, wing, and status combination.</p></div>}
    </section>

    <section className="panel wing-compliance-panel"><div className="panel-head"><div><p className="eyebrow">WING BREAKDOWN</p><h2>{selectedItem?.title ?? "All ongoing tasks"}</h2></div>{wing !== "all" && <button className="secondary-button" onClick={() => setWing("all")}>Show all wings</button>}</div><div className="table-scroll"><table><thead><tr><th>Wing</th><th>Recipients</th><th>Non-responders</th><th>Action needed</th><th>Compliant</th><th>Compliance</th><th /></tr></thead><tbody>{wingStats.map((item) => <tr key={item.wingId} className={wing === item.wingId ? "selected-wing-row" : undefined}><td><strong>Wing {item.wingId}</strong></td><td>{item.total}</td><td>{item.nonResponders}</td><td>{item.actionNeeded}</td><td>{item.complete}</td><td><strong>{item.rate === null ? "—" : `${item.rate}%`}</strong></td><td><button className="text-button" onClick={() => setWing(item.wingId)}>View students</button></td></tr>)}</tbody></table></div></section>
  </div>;
}
