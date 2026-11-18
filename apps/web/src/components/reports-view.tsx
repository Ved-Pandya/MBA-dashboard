"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { readReport, readableError } from "@/lib/callable";
import { useAuth } from "./auth-provider";

type OpportunityKind = "all" | "competition" | "internship";
type Confirmation = { status?: "pending" | "confirmed" };
type ResponseRow = {
  id: string;
  uid?: string;
  status: string;
  opportunityId?: string;
  internshipId?: string;
  registeredLate?: boolean;
  externalRegistration?: Confirmation;
  internalForm?: Confirmation;
  studentSnapshot?: { displayName: string; rollNumber: string };
};
type CatalogItem = { id: string; title?: string; company?: string; role?: string; status: string };
type WingReport = {
  wingId: string;
  opportunityKind: OpportunityKind;
  opportunityId: string | null;
  competitions: CatalogItem[];
  internships: CatalogItem[];
  competitionResponses: ResponseRow[];
  internshipResponses: ResponseRow[];
};

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n");
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
}

function competitionState(row: ResponseRow) {
  const external = row.externalRegistration?.status === "confirmed";
  const internal = row.internalForm?.status === "confirmed";
  if (external && internal) return "confirmed";
  if (external || internal) return "partial";
  return "no_response";
}

export function ReportsView() {
  const { profile } = useAuth();
  const manager = Boolean(profile?.roles.systemAdmin || profile?.roles.cr);
  const availableWings = manager ? [...WING_IDS] : Object.keys(profile?.scopes.wingPocWings ?? {});
  const [wingId, setWingId] = useState(availableWings[0] ?? profile?.wingId ?? "A");
  const [kind, setKind] = useState<OpportunityKind>("all");
  const [opportunityId, setOpportunityId] = useState("");
  const [report, setReport] = useState<WingReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const latestRequest = useRef(0);
  const wingReports = useRef(new Map<string, WingReport>());
  const scopeKey = `${profile?.rollNumber}:${availableWings.join(",")}`;

  async function load(selectedWing = wingId, refresh = false) {
    const request = ++latestRequest.current;
    setError("");
    const cached = !refresh && wingReports.current.get(selectedWing);
    if (cached) { setReport(cached); setBusy(false); return; }
    setBusy(true);
    try {
      const result = await readReport<unknown, WingReport>("getWingOpportunityReport", { wingId: selectedWing, opportunityKind: "all" });
      if (request !== latestRequest.current) return;
      wingReports.current.set(selectedWing, result);
      setReport(result);
    } catch (loadError) { if (request === latestRequest.current) setError(readableError(loadError)); }
    finally { if (request === latestRequest.current) setBusy(false); }
  }

  useEffect(() => {
    wingReports.current.clear(); setReport(null); setPage(0);
    const firstWing = availableWings[0];
    if (firstWing) { setWingId(firstWing); void load(firstWing); }
    return () => { latestRequest.current += 1; };
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentReport = report?.wingId === wingId ? report : null;

  const catalog = useMemo(() => {
    if (kind === "competition") return (currentReport?.competitions ?? []).map((item) => ({ ...item, label: item.title ?? item.id }));
    if (kind === "internship") return (currentReport?.internships ?? []).map((item) => ({ ...item, label: `${item.company ?? item.title ?? "Internship"}${item.role ? ` · ${item.role}` : ""}` }));
    return [];
  }, [currentReport, kind]);

  const competitionNames = useMemo(() => new Map((report?.competitions ?? []).map((item) => [item.id, item.title ?? item.id])), [report]);
  const internshipNames = useMemo(() => new Map((report?.internships ?? []).map((item) => [item.id, `${item.company ?? item.title ?? "Internship"}${item.role ? ` · ${item.role}` : ""}`])), [report]);
  const rows = useMemo(() => [
    ...(currentReport?.competitionResponses ?? []).filter((row) => kind !== "internship" && (!opportunityId || row.opportunityId === opportunityId)).map((row) => ({
      ...row, type: "competition" as const, opportunityName: competitionNames.get(row.opportunityId ?? "") ?? row.opportunityId ?? "Competition",
      responseState: competitionState(row),
    })),
    ...(currentReport?.internshipResponses ?? []).filter((row) => kind !== "competition" && (!opportunityId || row.internshipId === opportunityId)).map((row) => ({
      ...row, type: "internship" as const, opportunityName: internshipNames.get(row.internshipId ?? "") ?? row.internshipId ?? "Internship",
      responseState: row.status,
    })),
  ], [currentReport, kind, opportunityId, competitionNames, internshipNames]);

  const counts = useMemo(() => ({
    noResponse: rows.filter((row) => row.responseState === "no_response").length,
    partial: rows.filter((row) => row.responseState === "partial").length,
    complete: rows.filter((row) => ["confirmed", "registered", "not_participating"].includes(row.responseState)).length,
    placedExempt: rows.filter((row) => row.responseState === "not_applicable_placed").length,
    late: rows.filter((row) => row.registeredLate).length,
  }), [rows]);

  function chooseWing(nextWing: string) {
    setWingId(nextWing); setPage(0); void load(nextWing);
  }

  function chooseKind(nextKind: OpportunityKind) {
    setKind(nextKind); setOpportunityId(""); setPage(0);
  }

  function chooseOpportunity(nextId: string) {
    setOpportunityId(nextId); setPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * 50, (currentPage + 1) * 50);

  const exportRows = useMemo(() => rows.map((row) => ({
    type: row.type,
    opportunity: row.opportunityName,
    name: row.studentSnapshot?.displayName,
    rollNumber: row.studentSnapshot?.rollNumber,
    status: row.responseState,
    externalForm: row.type === "competition" ? row.externalRegistration?.status ?? "pending" : "",
    internalForm: row.type === "competition" ? row.internalForm?.status ?? "pending" : "",
    late: row.registeredLate ?? false,
  })), [rows]);

  return <div className="page-wrap">
    <header className="page-heading"><div><h1>Wing opportunity report</h1><p>Filter one competition or internship and see exactly who has responded in the selected Wing.</p></div></header>
    <div className="toolbar">
      <label>Wing<select value={wingId} onChange={(event) => chooseWing(event.target.value)}>{availableWings.map((wing) => <option key={wing}>{wing}</option>)}</select></label>
      <label>Opportunity type<select value={kind} onChange={(event) => chooseKind(event.target.value as OpportunityKind)}><option value="all">All opportunities</option><option value="competition">Case competitions</option><option value="internship">Internships</option></select></label>
      {kind !== "all" && <label>Opportunity<select value={opportunityId} onChange={(event) => chooseOpportunity(event.target.value)}><option value="">All {kind === "competition" ? "competitions" : "internships"}</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <button className="secondary-button" onClick={() => void load(wingId, true)} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      <button className="secondary-button" onClick={() => downloadCsv(`wing-${wingId}-${kind}-compliance.csv`, exportRows)} disabled={busy || !rows.length}>Export CSV</button>
    </div>
    {error && <p className="form-error">{error}</p>}
    <p className="report-load-status" role="status">{busy ? currentReport ? "Updating this wing’s responses…" : "Loading this wing’s report…" : "Filters update instantly. Refresh to check for new responses."}</p>
    <div className="stats-grid"><div className="stat-card danger"><span>No response</span><strong>{counts.noResponse}</strong><small>No confirmation submitted</small></div><div className="stat-card warning"><span>Partial</span><strong>{counts.partial}</strong><small>One competition form pending</small></div><div className="stat-card success"><span>Complete</span><strong>{counts.complete}</strong><small>Required response recorded</small></div>{manager && <div className="stat-card"><span>Placed exempt</span><strong>{counts.placedExempt}</strong><small>Private CR/Admin status</small></div>}<div className="stat-card warning"><span>Late</span><strong>{counts.late}</strong><small>Retained for audit</small></div></div>
    <section className="panel compliance-panel report-records" aria-busy={busy}><div className="panel-head"><div><h2>Students in Wing {wingId}</h2></div><span className="count-badge">{rows.length}</span></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>Type</th><th>Opportunity</th><th>External form</th><th>Internal form</th><th>Status</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={`${row.type}_${row.id}`}><td><strong>{row.studentSnapshot?.displayName}</strong><small>{row.studentSnapshot?.rollNumber}</small></td><td>{row.type}</td><td>{row.opportunityName}</td><td>{row.type === "competition" ? row.externalRegistration?.status ?? "pending" : "—"}</td><td>{row.type === "competition" ? row.internalForm?.status ?? "pending" : "—"}</td><td><span className={`status-pill ${row.responseState === "no_response" ? "overdue" : row.responseState === "partial" ? "urgent" : "done"}`}>{row.responseState.replaceAll("_", " ")}{row.registeredLate ? " · late" : ""}</span></td></tr>)}</tbody></table></div>{!busy && !rows.length && <div className="empty-state"><h3>No matching responses</h3><p>Try another Wing or opportunity filter.</p></div>}</section>
    {rows.length > 50 && <nav className="report-pagination" aria-label="Report pages"><span>Showing {currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, rows.length)} of {rows.length} responses</span><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
  </div>;
}
