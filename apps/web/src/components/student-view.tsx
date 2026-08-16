"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { AssignmentRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { asDate, formatDeadline, relativeDeadline, urgency } from "@/lib/date";
import { callFunction, readableError } from "@/lib/callable";
import { GuidedAppSetupCard } from "./app-setup";

const labels = {
  subject_assignment: "Assignment",
  pre_read: "Pre-read",
  case_competition: "Case comp",
  administrative_form: "Form",
};

export function StudentView() {
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(getFirebase().db, "taskAssignments"), where("uid", "==", user.uid)),
      (snap) => setAssignments(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AssignmentRecord)),
      (snapshotError) => setError(readableError(snapshotError)),
    );
  }, [user]);

  const sorted = useMemo(() => assignments
    .filter((item) => filter === "all" || (filter === "active" ? item.status === "pending" : item.status === "completed"))
    .sort((a, b) => {
      const ranks = { overdue: 0, urgent: 1, upcoming: 2, done: 3 };
      const delta = ranks[urgency(a.taskSnapshot.dueAt, a.status)] - ranks[urgency(b.taskSnapshot.dueAt, b.status)];
      return delta || asDate(a.taskSnapshot.dueAt).getTime() - asDate(b.taskSnapshot.dueAt).getTime();
    }), [assignments, filter]);

  const stats = useMemo(() => {
    const now = new Date();
    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    return {
      overdue: assignments.filter((a) => urgency(a.taskSnapshot.dueAt, a.status) === "overdue").length,
      today: assignments.filter((a) => a.status === "pending" && asDate(a.taskSnapshot.dueAt) >= now && asDate(a.taskSnapshot.dueAt) <= endToday).length,
      upcoming: assignments.filter((a) => urgency(a.taskSnapshot.dueAt, a.status) === "upcoming").length,
      complete: assignments.filter((a) => a.status === "completed").length,
    };
  }, [assignments]);

  async function toggle(item: AssignmentRecord) {
    setBusy(item.id); setError(null);
    try {
      await callFunction(item.status === "completed" ? "reopenMyCompletion" : "setMyCompletion", { taskId: item.taskId, idempotencyKey: crypto.randomUUID() });
    } catch (toggleError) { setError(readableError(toggleError)); }
    finally { setBusy(null); }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toUpperCase();

  return (
    <div className="page-wrap">
      <header className="page-heading">
        <div><p className="eyebrow">{weekday} COMMAND CENTER</p><h1>{greeting}, {profile?.displayName.split(" ")[0]}.</h1><p>Here’s what needs your attention next.</p></div>
        <div className="date-tile"><strong>{new Date().getDate()}</strong><span>{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date())}</span></div>
      </header>

      <GuidedAppSetupCard />

      <section className="stats-grid" aria-label="Task summary">
        <article className="stat-card danger"><span>Overdue</span><strong>{stats.overdue}</strong><small>{stats.overdue ? "Resolve these first" : "All clear"}</small></article>
        <article className="stat-card warning"><span>Due today</span><strong>{stats.today}</strong><small>Before midnight</small></article>
        <article className="stat-card"><span>Upcoming</span><strong>{stats.upcoming}</strong><small>Beyond 24 hours</small></article>
        <article className="stat-card success"><span>Completed</span><strong>{stats.complete}</strong><small>Recorded & auditable</small></article>
      </section>

      <section className="panel task-panel">
        <div className="panel-head">
          <div><p className="eyebrow">PRIORITY QUEUE</p><h2>Your deadlines</h2></div>
          <div className="segmented">
            {(["active", "completed", "all"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="task-list">
          {!sorted.length && <div className="empty-state"><span>✓</span><h3>Nothing in this lane</h3><p>Your queue is clear for the selected filter.</p></div>}
          {sorted.map((item) => {
            const level = urgency(item.taskSnapshot.dueAt, item.status);
            return (
              <article className={`task-row ${level}`} key={item.id}>
                <button className={`check ${item.status === "completed" ? "checked" : ""}`} onClick={() => toggle(item)} disabled={busy === item.id || item.status === "exempt"} aria-label={item.status === "completed" ? "Reopen task" : "Mark complete"}>{item.status === "completed" ? "✓" : ""}</button>
                <div className="task-main">
                  <div className="task-meta"><span className={`category ${item.taskType}`}>{labels[item.taskType]}</span><span>{item.scopeKey.replace(":", " · ")}</span></div>
                  <h3>{item.taskSnapshot.title}</h3>
                  <p>{formatDeadline(item.taskSnapshot.dueAt)} · <b>{relativeDeadline(item.taskSnapshot.dueAt)}</b></p>
                </div>
                {item.taskSnapshot.resourceUrl && <a className="resource-link" href={item.taskSnapshot.resourceUrl} target="_blank" rel="noreferrer">Open ↗</a>}
                {item.status === "exempt" && <span className="status-pill">Exempt</span>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
