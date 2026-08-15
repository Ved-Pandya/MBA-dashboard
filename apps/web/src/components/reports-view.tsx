"use client";

import { useEffect, useMemo, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { callFunction, readableError } from "@/lib/callable";
import { useAuth } from "./auth-provider";

type ResponseRow = { id: string; status: string; opportunityId?: string; internshipId?: string; registeredLate?: boolean; studentSnapshot?: { displayName: string; rollNumber: string } };
type TeamRow = { id: string; competitionId: string; name: string; status: string; ownWingMembers: Array<{ displayName: string; rollNumber: string }>; otherWingMemberCount: number };
type WingReport = { wingId: string; competitionResponses: ResponseRow[]; internshipResponses: ResponseRow[]; teams: TeamRow[] };

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n");
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
}

export function ReportsView() {
  const { profile } = useAuth();
  const manager = Boolean(profile?.roles.systemAdmin || profile?.roles.cr);
  const availableWings = manager ? [...WING_IDS] : Object.keys(profile?.scopes.wingPocWings ?? {});
  const [wingId, setWingId] = useState(availableWings[0] ?? profile?.wingId ?? "A");
  const [report, setReport] = useState<WingReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(selected = wingId) {
    setBusy(true); setError("");
    try { setReport(await callFunction<unknown, WingReport>("getWingOpportunityReport", { wingId: selected })); }
    catch (loadError) { setError(readableError(loadError)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (availableWings.length) void load(availableWings[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const all = [...(report?.competitionResponses ?? []), ...(report?.internshipResponses ?? [])];
    return { noResponse: all.filter((item) => item.status === "no_response").length, registered: all.filter((item) => item.status === "registered").length, late: all.filter((item) => item.registeredLate).length };
  }, [report]);

  const exportRows = (report?.competitionResponses ?? []).map((row) => ({ type: "competition", opportunityId: row.opportunityId, name: row.studentSnapshot?.displayName, rollNumber: row.studentSnapshot?.rollNumber, status: row.status, late: row.registeredLate ?? false }))
    .concat((report?.internshipResponses ?? []).map((row) => ({ type: "internship", opportunityId: row.internshipId, name: row.studentSnapshot?.displayName, rollNumber: row.studentSnapshot?.rollNumber, status: row.status, late: row.registeredLate ?? false })));

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">COMPLIANCE</p><h1>Wing opportunity report</h1><p>Named data is limited to your authorized wing. Cross-wing teammates remain sanitized.</p></div></header>
    <div className="toolbar"><label>Wing<select value={wingId} onChange={(event) => { setWingId(event.target.value); void load(event.target.value); }}>{availableWings.map((wing) => <option key={wing}>{wing}</option>)}</select></label><button className="secondary-button" onClick={() => void load()} disabled={busy}>Refresh</button><button className="secondary-button" onClick={() => downloadCsv(`wing-${wingId}-opportunities.csv`, exportRows)} disabled={!report}>Export CSV</button></div>
    {error && <p className="form-error">{error}</p>}
    <div className="stats-grid stats-three"><div className="stat-card danger"><span>No response</span><strong>{counts.noResponse}</strong><small>Needs follow-up</small></div><div className="stat-card success"><span>Registered</span><strong>{counts.registered}</strong><small>Competition + internship</small></div><div className="stat-card warning"><span>Late</span><strong>{counts.late}</strong><small>Retained for audit</small></div></div>
    <section className="panel compliance-panel"><div className="panel-head"><div><p className="eyebrow">RESPONSE MATRIX</p><h2>Students in Wing {wingId}</h2></div><span className="count-badge">{exportRows.length}</span></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>Roll number</th><th>Type</th><th>Opportunity</th><th>Status</th></tr></thead><tbody>{exportRows.map((row, index) => <tr key={`${row.type}_${row.opportunityId}_${index}`}><td>{row.name}</td><td>{row.rollNumber}</td><td>{row.type}</td><td>{row.opportunityId}</td><td><span className={`status-pill ${row.status}`}>{row.status.replaceAll("_", " ")}{row.late ? " · late" : ""}</span></td></tr>)}</tbody></table></div></section>
    <section className="panel compliance-panel report-teams"><div className="panel-head"><div><p className="eyebrow">REGISTERED TEAMS</p><h2>Teams containing Wing {wingId}</h2></div></div>{report?.teams.map((team) => <article className="academic-row" key={team.id}><div><h3>{team.name}</h3><p>{team.ownWingMembers.map((member) => `${member.displayName} (${member.rollNumber})`).join(", ")}</p><small>{team.otherWingMemberCount} member(s) from other wings hidden · Team ID {team.id}</small></div><span className={`status-pill ${team.status}`}>{team.status}</span></article>)}</section>
  </div>;
}
