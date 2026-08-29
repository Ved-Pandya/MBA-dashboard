"use client";

import { useEffect, useMemo, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { callFunction, readableError } from "@/lib/callable";
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

  async function load(selectedWing = wingId, selectedKind = kind, selectedOpportunityId = opportunityId) {
    setBusy(true); setError("");
    try {
      setReport(await callFunction<unknown, WingReport>("getWingOpportunityReport", {
        wingId: selectedWing,
        opportunityKind: selectedKind,
        ...(selectedOpportunityId ? { opportunityId: selectedOpportunityId } : {}),
      }));
    } catch (loadError) { setError(readableError(loadError)); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (availableWings.length) void load(availableWings[0], "all", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const catalog = useMemo(() => {
    if (kind === "competition") return (report?.competitions ?? []).map((item) => ({ ...item, label: item.title ?? item.id }));
    if (kind === "internship") return (report?.internships ?? []).map((item) => ({ ...item, label: `${item.company ?? item.title ?? "Internship"}${item.role ? ` · ${item.role}` : ""}` }));
    return [];
  }, [report, kind]);

  const competitionNames = useMemo(() => new Map((report?.competitions ?? []).map((item) => [item.id, item.title ?? item.id])), [report]);
  const internshipNames = useMemo(() => new Map((report?.internships ?? []).map((item) => [item.id, `${item.company ?? item.title ?? "Internship"}${item.role ? ` · ${item.role}` : ""}`])), [report]);
  const rows = useMemo(() => [
    ...(report?.competitionResponses ?? []).map((row) => ({
      ...row, type: "competition" as const, opportunityName: competitionNames.get(row.opportunityId ?? "") ?? row.opportunityId ?? "Competition",
      responseState: competitionState(row),
    })),
    ...(report?.internshipResponses ?? []).map((row) => ({
      ...row, type: "internship" as const, opportunityName: internshipNames.get(row.internshipId ?? "") ?? row.internshipId ?? "Internship",
      responseState: row.status,
    })),
  ], [report, competitionNames, internshipNames]);

  const counts = useMemo(() => ({
    noResponse: rows.filter((row) => row.responseState === "no_response").length,
    partial: rows.filter((row) => row.responseState === "partial").length,
    complete: rows.filter((row) => ["confirmed", "registered", "not_participating"].includes(row.responseState)).length,
    placedExempt: rows.filter((row) => row.responseState === "not_applicable_placed").length,
    late: rows.filter((row) => row.registeredLate).length,
  }), [rows]);

  function chooseWing(nextWing: string) {
    setWingId(nextWing); void load(nextWing, kind, opportunityId);
  }

  function chooseKind(nextKind: OpportunityKind) {
    setKind(nextKind); setOpportunityId(""); void load(wingId, nextKind, "");
  }

  function chooseOpportunity(nextId: string) {
    setOpportunityId(nextId); void load(wingId, kind, nextId);
  }

  const exportRows = rows.map((row) => ({
    type: row.type,
    opportunity: row.opportunityName,
    name: row.studentSnapshot?.displayName,
    rollNumber: row.studentSnapshot?.rollNumber,
    status: row.responseState,
    externalForm: row.type === "competition" ? row.externalRegistration?.status ?? "pending" : "",
    internalForm: row.type === "competition" ? row.internalForm?.status ?? "pending" : "",
    late: row.registeredLate ?? false,
  }));

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">COMPLIANCE</p><h1>Wing opportunity report</h1><p>Filter one competition or internship and see exactly who has responded in the selected Wing.</p></div></header>
    <div className="toolbar">
      <label>Wing<select value={wingId} onChange={(event) => chooseWing(event.target.value)}>{availableWings.map((wing) => <option key={wing}>{wing}</option>)}</select></label>
      <label>Opportunity type<select value={kind} onChange={(event) => chooseKind(event.target.value as OpportunityKind)}><option value="all">All opportunities</option><option value="competition">Case competitions</option><option value="internship">Internships</option></select></label>
      {kind !== "all" && <label>Opportunity<select value={opportunityId} onChange={(event) => chooseOpportunity(event.target.value)}><option value="">All {kind === "competition" ? "competitions" : "internships"}</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <button className="secondary-button" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      <button className="secondary-button" onClick={() => downloadCsv(`wing-${wingId}-${kind}-compliance.csv`, exportRows)} disabled={!rows.length}>Export CSV</button>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="stats-grid"><div className="stat-card danger"><span>No response</span><strong>{counts.noResponse}</strong><small>No confirmation submitted</small></div><div className="stat-card warning"><span>Partial</span><strong>{counts.partial}</strong><small>One competition form pending</small></div><div className="stat-card success"><span>Complete</span><strong>{counts.complete}</strong><small>Required response recorded</small></div>{manager && <div className="stat-card"><span>Placed exempt</span><strong>{counts.placedExempt}</strong><small>Private CR/Admin status</small></div>}<div className="stat-card warning"><span>Late</span><strong>{counts.late}</strong><small>Retained for audit</small></div></div>
    <section className="panel compliance-panel"><div className="panel-head"><div><p className="eyebrow">RESPONSE MATRIX</p><h2>Students in Wing {wingId}</h2></div><span className="count-badge">{rows.length}</span></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>Type</th><th>Opportunity</th><th>External form</th><th>Internal form</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.type}_${row.id}`}><td><strong>{row.studentSnapshot?.displayName}</strong><small>{row.studentSnapshot?.rollNumber}</small></td><td>{row.type}</td><td>{row.opportunityName}</td><td>{row.type === "competition" ? row.externalRegistration?.status ?? "pending" : "—"}</td><td>{row.type === "competition" ? row.internalForm?.status ?? "pending" : "—"}</td><td><span className={`status-pill ${row.responseState === "no_response" ? "overdue" : row.responseState === "partial" ? "urgent" : "done"}`}>{row.responseState.replaceAll("_", " ")}{row.registeredLate ? " · late" : ""}</span></td></tr>)}</tbody></table></div>{!busy && !rows.length && <div className="empty-state"><span>◌</span><h3>No matching responses</h3><p>Try another Wing or opportunity filter.</p></div>}</section>
  </div>;
}
