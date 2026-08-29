"use client";

import { useEffect, useMemo, useState } from "react";
import { WING_IDS } from "@mba/domain";
import { callFunction, readableError } from "@/lib/callable";

type PlacementStudent = {
  uid: string;
  displayName: string;
  rollNumber: string;
  sectionId: string;
  wingId: string;
  placementStatus: "seeking" | "placed";
};

export function PlacementStatusView() {
  const [students, setStudents] = useState<PlacementStudent[]>([]);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const [wing, setWing] = useState("all");
  const [status, setStatus] = useState("all");
  const [busyUid, setBusyUid] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await callFunction<unknown, { users: PlacementStudent[] }>("getPlacementRoster", {});
      setStudents(result.users);
    } catch (loadError) { setError(readableError(loadError)); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => students.filter((student) => {
    const matchesText = `${student.displayName} ${student.rollNumber}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesText && (section === "all" || student.sectionId === section) && (wing === "all" || student.wingId === wing) && (status === "all" || student.placementStatus === status);
  }), [students, query, section, wing, status]);
  const placedCount = students.filter((student) => student.placementStatus === "placed").length;

  async function change(student: PlacementStudent) {
    const nextStatus = student.placementStatus === "placed" ? "seeking" : "placed";
    const reason = window.prompt(nextStatus === "placed" ? "Placement details or reason" : "Reason for returning this student to seeking status");
    if (!reason) return;
    setBusyUid(student.uid); setError(""); setMessage("");
    try {
      const result = await callFunction<unknown, { responsesUpdated: number }>("setPlacementStatus", { uid: student.uid, status: nextStatus, reason });
      setMessage(`${student.displayName} is now ${nextStatus}. ${result.responsesUpdated} placement response(s) updated.`);
      await load();
    } catch (actionError) { setError(readableError(actionError)); }
    finally { setBusyUid(""); }
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">PLACEMENT ELIGIBILITY</p><h1>Placed students</h1><p>Placed students remain in academic and community modules but are excluded from placement registration compliance.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}
    <div className="stats-grid stats-three"><div className="stat-card"><span>Batch</span><strong>{students.length}</strong><small>Active and invited students</small></div><div className="stat-card success"><span>Placed</span><strong>{placedCount}</strong><small>Excluded from placement forms</small></div><div className="stat-card warning"><span>Seeking</span><strong>{students.length - placedCount}</strong><small>Included in placement forms</small></div></div>
    <section className="panel compliance-panel">
      <div className="toolbar"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or 26M2xxx" /></label><label>Section<select value={section} onChange={(event) => setSection(event.target.value)}><option value="all">Both</option><option>A</option><option>B</option></select></label><label>Wing<select value={wing} onChange={(event) => setWing(event.target.value)}><option value="all">All</option>{WING_IDS.map((id) => <option key={id}>{id}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="seeking">Seeking</option><option value="placed">Placed</option></select></label></div>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Roll number</th><th>Section</th><th>Wing</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((student) => <tr key={student.uid}><td>{student.displayName}</td><td>{student.rollNumber}</td><td>{student.sectionId}</td><td>{student.wingId}</td><td><span className={`status-pill ${student.placementStatus}`}>{student.placementStatus}</span></td><td><button className={student.placementStatus === "placed" ? "secondary-button" : "primary-button"} onClick={() => void change(student)} disabled={Boolean(busyUid)}>{busyUid === student.uid ? "Saving…" : student.placementStatus === "placed" ? "Return to seeking" : "Mark placed"}</button></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
