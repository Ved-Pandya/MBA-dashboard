"use client";

import { useState } from "react";
import type { TimetableRow } from "@mba/domain";
import { callFunction, readableError } from "@/lib/callable";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const emptyRow = (): TimetableRow => ({ subjectCode: "", subjectName: "", sectionId: "A", weekday: 1, startTime: "09:00", endTime: "10:00", room: "" });

function parseLines(text: string): TimetableRow[] {
  const rows: TimetableRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const dayIndex = weekdays.findIndex((day) => new RegExp(`\\b${day.slice(0, 3)}`, "i").test(line));
    const times = [...line.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g)].map((match) => match[0]);
    const section = line.match(/\b(?:section\s*)?([AB])\b/i)?.[1]?.toUpperCase() as "A" | "B" | undefined;
    if (dayIndex < 0 || times.length < 2 || !section) continue;
    const code = line.match(/\b[A-Z]{2,}[ -]?\d{2,4}[A-Z]?\b/i)?.[0]?.replace(/\s/g, "") ?? line.split(" ")[0] ?? "SUBJECT";
    const title = line
      .replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      .replace(new RegExp(weekdays[dayIndex]!.slice(0, 3) + "[a-z]*", "i"), "")
      .replace(/\b(?:section\s*)?[AB]\b/i, "")
      .replace(times[0]!, "").replace(times[1]!, "").replace(/[-–|]+/g, " ").trim();
    rows.push({ subjectCode: code.toUpperCase(), subjectName: title || code.toUpperCase(), sectionId: section, weekday: dayIndex + 1, startTime: times[0]!, endTime: times[1]!, room: "" });
  }
  return rows;
}

export function TimetableView() {
  const [termId, setTermId] = useState("TERM-1");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function readPdf(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const lines: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const content = await (await pdf.getPage(pageNumber)).getTextContent();
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += `${item.str} `;
          if (item.hasEOL) { lines.push(line.trim()); line = ""; }
        }
        if (line.trim()) lines.push(line.trim());
      }
      const text = lines.join("\n");
      setRawText(text);
      const parsed = parseLines(text);
      setRows(parsed.length ? parsed : [emptyRow()]);
      setMessage(parsed.length ? `${parsed.length} possible timetable rows extracted. Confirm every field before saving.` : "No reliable rows were detected. This may be a scanned PDF; add the rows manually below.");
    } catch (pdfError) { setError(`Could not read this PDF locally: ${readableError(pdfError)}`); }
    finally { setBusy(false); }
  }

  function update(index: number, patch: Partial<TimetableRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function commit() {
    setBusy(true); setError("");
    try {
      const result = await callFunction<unknown, { offeringCount: number; slotCount: number }>("commitTimetableImport", { termId, termStartIso: start, termEndIso: end, rows });
      setMessage(`${result.offeringCount} subject offerings and ${result.slotCount} weekly slots saved.`);
    } catch (commitError) { setError(readableError(commitError)); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">ACADEMIC CATALOG</p><h1>Timetable import</h1><p>The PDF stays in this browser. Nothing is uploaded until you confirm the structured rows.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}
    <section className="panel create-form timetable-import">
      <div className="form-row"><label>Term ID<input value={termId} onChange={(event) => setTermId(event.target.value)} /></label><label>Weekly timetable PDF<input type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readPdf(file); }} /></label></div>
      <div className="form-row"><label>Term starts<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Term ends<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
      {rawText && <details><summary>Extracted PDF text</summary><pre className="pdf-text">{rawText}</pre></details>}
      <div className="table-scroll"><table><thead><tr><th>Code</th><th>Subject</th><th>Section</th><th>Day</th><th>Start</th><th>End</th><th>Room</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>
        <td><input value={row.subjectCode} onChange={(event) => update(index, { subjectCode: event.target.value })} /></td><td><input value={row.subjectName} onChange={(event) => update(index, { subjectName: event.target.value })} /></td>
        <td><select value={row.sectionId} onChange={(event) => update(index, { sectionId: event.target.value as "A" | "B" })}><option>A</option><option>B</option></select></td>
        <td><select value={row.weekday} onChange={(event) => update(index, { weekday: Number(event.target.value) })}>{weekdays.map((day, dayIndex) => <option key={day} value={dayIndex + 1}>{day}</option>)}</select></td>
        <td><input type="time" value={row.startTime} onChange={(event) => update(index, { startTime: event.target.value })} /></td><td><input type="time" value={row.endTime} onChange={(event) => update(index, { endTime: event.target.value })} /></td>
        <td><input value={row.room ?? ""} onChange={(event) => update(index, { room: event.target.value })} /></td><td><button className="danger-link text-button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></td>
      </tr>)}</tbody></table></div>
      <div className="form-actions"><button className="secondary-button" onClick={() => setRows((current) => [...current, emptyRow()])}>Add row</button><button className="primary-button" onClick={commit} disabled={busy || !termId || !start || !end || !rows.length}>Confirm and create timetable</button></div>
    </section>
  </div>;
}
