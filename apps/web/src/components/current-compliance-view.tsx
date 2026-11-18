"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { readReport, readableError } from "@/lib/callable";

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
  selectedItemKey: string;
  nextCursor: string | null;
  nextCatalogCursors: Record<string, string>;
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
  const [payload, setPayload] = useState<CompliancePayload>({ items: [], rows: [], generatedAtIso: "", selectedItemKey: "", nextCursor: null, nextCatalogCursors: {} });
  const [wing, setWing] = useState<WingFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("non_responder");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const cachedRows = useRef(new Map<string, Pick<CompliancePayload, "rows" | "nextCursor" | "generatedAtIso">>());
  const [page, setPage] = useState(0);
  type Request = { itemKey?: string; cursor?: string; rowsOnly?: boolean; catalogOnly?: boolean; catalogCursors?: Record<string, string> };
  async function load(input: Request = {}, appendRows = false, appendCatalog = false) {
    const request = ++latestRequest.current;
    if (input.itemKey && !appendRows && !appendCatalog) {
      const cached = cachedRows.current.get(input.itemKey);
      if (cached) {
        setPayload((previous) => ({ ...previous, ...cached, selectedItemKey: input.itemKey! }));
        setError(""); setBusy(false); return;
      }
      setPayload((previous) => ({ ...previous, selectedItemKey: input.itemKey!, rows: [], nextCursor: null }));
    }
    setBusy(true); setError("");
    try {
      const result = await readReport<Request, CompliancePayload>("getCurrentTaskCompliance", input);
      if (request !== latestRequest.current) return;
      const rows = appendRows ? [...new Map([...(cachedRows.current.get(result.selectedItemKey)?.rows ?? []), ...result.rows].map((row) => [row.id, row])).values()] : result.rows;
      if (result.selectedItemKey && !input.catalogOnly) cachedRows.current.set(result.selectedItemKey, { rows, nextCursor: result.nextCursor, generatedAtIso: result.generatedAtIso });
      setPayload((previous) => ({ ...result,
        items: input.rowsOnly ? previous.items : appendCatalog ? [...new Map([...previous.items, ...result.items].map((item) => [item.key, item])).values()] : result.items,
        rows: input.catalogOnly ? previous.rows : rows,
        nextCursor: input.catalogOnly ? previous.nextCursor : result.nextCursor,
        nextCatalogCursors: input.rowsOnly ? previous.nextCatalogCursors : appendCatalog ? { ...previous.nextCatalogCursors, ...result.nextCatalogCursors } : result.nextCatalogCursors,
      }));
    } catch (err) { if (request === latestRequest.current) setError(readableError(err)); }
    finally { if (request === latestRequest.current) setBusy(false); }
  }
  useEffect(() => { void load(); return () => { latestRequest.current += 1; }; }, []);
  const selected = payload.items.find((item) => item.key === payload.selectedItemKey);
  const rows = useMemo(() => payload.rows.filter((row) => wing === "all" || row.wingId === wing), [payload.rows, wing]);
  const filtered = useMemo(() => rows.filter((row) => status === "all" || row.status === status).sort((a, b) => a.wingId.localeCompare(b.wingId) || a.rollNumber.localeCompare(b.rollNumber)), [rows, status]);
  const complete = rows.filter((row) => responseComplete(row.status)).length;
  const accountable = rows.filter((row) => row.status !== "exempt").length;
  const partial = Boolean(payload.nextCursor);
  const moreCatalog = Object.values(payload.nextCatalogCursors).some(Boolean);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  function downloadCsv() {
    const data = [["Task", "Type", "Student", "Roll number", "Section", "Wing", "Status", "Recorded response", "Deadline"], ...filtered.map((row) => [selected?.title, row.kind, row.displayName, row.rollNumber, row.sectionId, row.wingId, row.status, row.responseLabel, selected?.dueAtIso])];
    const url = URL.createObjectURL(new Blob(["\ufeff", data.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "current-task-compliance.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="page-wrap">
    <header className="page-heading"><div><h1>Current task compliance</h1><p>Select an ongoing item to review its students and response status.</p></div><div className="form-actions"><button className="secondary-button" disabled={busy} onClick={() => { cachedRows.current.clear(); setPage(0); void load(); }}>Refresh current tasks</button><button className="secondary-button" disabled={busy || partial || !filtered.length} onClick={downloadCsv}>Export filtered CSV</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="panel compliance-panel report-records" aria-busy={busy}>
      <div className="toolbar"><label>Current task<select value={payload.selectedItemKey} disabled={!payload.items.length} onChange={(event) => { setWing("all"); setPage(0); void load({ itemKey: event.target.value, rowsOnly: true }); }}>
        {!payload.items.length && <option value="">No current tasks</option>}{payload.items.map((item) => <option key={item.key} value={item.key}>{item.title} · {item.kind}</option>)}
      </select></label><label>Wing<select value={wing} onChange={(event) => { setWing(event.target.value as WingFilter); setPage(0); }}><option value="all">All wings</option>{WING_IDS.map((id) => <option key={id}>{id}</option>)}</select></label><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(0); }}><option value="non_responder">Non-responders</option><option value="action_needed">Action needed</option><option value="responded">Responded</option><option value="completed">Completed</option><option value="exempt">Exempt</option><option value="all">All statuses</option></select></label></div>
      {moreCatalog && <button className="secondary-button" disabled={busy} onClick={() => void load({ itemKey: payload.selectedItemKey || undefined, catalogCursors: payload.nextCatalogCursors, catalogOnly: true }, false, true)}>Load more current tasks</button>}
      {selected && <p className="helper">{selected.title} · {selected.kind} · Due {formatDate(selected.dueAtIso)}</p>}
      {payload.generatedAtIso && <p className="helper">Last fetched {formatDate(payload.generatedAtIso)}. Refresh current tasks for the latest responses.</p>}
      {busy && <p role="status">Loading compliance records…</p>}
      {partial && <p className="form-error" role="status">Showing {payload.rows.length} loaded students. Load the remaining students for complete totals, filters, and CSV export.</p>}
      <p className="helper">{rows.length} {partial ? "loaded" : "total"} recipients in this wing selection · {rows.filter((row) => row.status === "non_responder").length} non-responders · {rows.filter((row) => row.status === "action_needed").length} need action · Compliance: {partial || !accountable ? "awaiting complete data" : Math.round(complete / accountable * 100) + "%"}</p>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Section</th><th>Wing</th><th>Response</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><strong>{row.displayName}</strong><small>{row.rollNumber}</small></td><td>{row.sectionId}</td><td>{row.wingId}</td><td>{row.responseLabel}{row.completedLate && <small>Recorded late</small>}</td></tr>)}</tbody></table></div>
      {filtered.length > 50 && <nav className="report-pagination" aria-label="Compliance pages"><span>Showing {currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, filtered.length)} of {filtered.length} loaded students</span><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
      {!busy && !filtered.length && <p className="helper">{payload.items.length ? "No matching students in the loaded records." : "No ongoing tasks. Publish an item to start tracking responses."}</p>}
      {payload.nextCursor && <button className="primary-button" disabled={busy} onClick={() => void load({ itemKey: payload.selectedItemKey, cursor: payload.nextCursor!, rowsOnly: true }, true)}>Load more students</button>}
    </section>
    {!partial && selected && <section className="panel compliance-panel report-records" aria-busy={busy}><h2>Wing breakdown</h2><div className="table-scroll"><table><thead><tr><th>Wing</th><th>Recipients</th><th>Non-responders</th><th>Action needed</th><th>Compliance</th></tr></thead><tbody>{WING_IDS.map((id) => {
      const group = payload.rows.filter((row) => row.wingId === id); const count = group.filter((row) => row.status !== "exempt").length;
      return <tr key={id}><td><button className="text-button" onClick={() => setWing(id)}>Wing {id}</button></td><td>{group.length}</td><td>{group.filter((row) => row.status === "non_responder").length}</td><td>{group.filter((row) => row.status === "action_needed").length}</td><td>{count ? Math.round(group.filter((row) => responseComplete(row.status)).length / count * 100) + "%" : "N/A"}</td></tr>;
    })}</tbody></table></div></section>}
  </div>;
}
