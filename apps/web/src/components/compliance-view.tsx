"use client";

import { useEffect, useMemo, useState } from "react";
import { WING_IDS } from "@mba/domain";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import type { AssignmentRecord, TaskRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline, urgency } from "@/lib/date";

type StatusFilter = "all" | "pending" | "completed" | "exempt";
type WingFilter = "all" | (typeof WING_IDS)[number];

const ASSIGNMENT_QUERY_LIMIT = 2_000;

function csvCell(value: string | number | boolean | undefined) {
  const text = value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function complianceRate(records: AssignmentRecord[]) {
  const completed = records.filter((record) => record.status === "completed").length;
  const accountable = records.filter((record) => record.status !== "exempt").length;
  return accountable ? Math.round((completed / accountable) * 100) : null;
}

export function ComplianceView() {
  const { profile } = useAuth();
  const scopes = useMemo(() => [
    ...Object.keys(profile?.scopes.subjectPocOfferings ?? {}).map((id) => `subject:${id}`),
    ...Object.keys(profile?.scopes.wingPocWings ?? {}).map((id) => `wing:${id}`),
  ], [profile]);
  const broadAccess = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const [scope, setScope] = useState("all");
  const [taskId, setTaskId] = useState("all");
  const [wing, setWing] = useState<WingFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [records, setRecords] = useState<AssignmentRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (broadAccess) return;
    if (scopes.length && (scope === "all" || !scopes.includes(scope))) setScope(scopes[0]);
  }, [broadAccess, scope, scopes]);

  useEffect(() => {
    if (!profile || !broadAccess) return;
    return onSnapshot(
      query(collection(getFirebase().db, "tasks"), limit(500)),
      (snapshot) => {
        setTasks(snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }) as TaskRecord)
          .filter((task) => task.status !== "draft" && task.status !== "publishing")
          .sort((a, b) => b.dueAt.toMillis() - a.dueAt.toMillis()));
      },
      (queryError) => setError(readableError(queryError)),
    );
  }, [profile, broadAccess]);

  useEffect(() => {
    if (!profile || (!broadAccess && (!scope || scope === "all"))) return;

    const clauses: QueryConstraint[] = [];
    if (broadAccess && taskId !== "all") {
      clauses.push(where("taskId", "==", taskId));
    } else if (!broadAccess) {
      const [scopeKind, scopeId] = scope.split(":");
      clauses.push(where(scopeKind === "wing" ? "wingId" : "subjectOfferingId", "==", scopeId));
    }

    setError(null);
    return onSnapshot(
      query(collection(getFirebase().db, "taskAssignments"), ...clauses, limit(ASSIGNMENT_QUERY_LIMIT)),
      (snapshot) => {
        setRecords(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }) as AssignmentRecord));
      },
      (queryError) => setError(readableError(queryError)),
    );
  }, [profile, broadAccess, scope, taskId]);

  const taskOptions = useMemo(() => {
    const options = new Map<string, { id: string; title: string; dueAt: AssignmentRecord["taskSnapshot"]["dueAt"] }>();
    tasks.forEach((task) => options.set(task.id, { id: task.id, title: task.title, dueAt: task.dueAt }));
    records.forEach((record) => {
      if (!options.has(record.taskId)) {
        options.set(record.taskId, {
          id: record.taskId,
          title: record.taskSnapshot.title,
          dueAt: record.taskSnapshot.dueAt,
        });
      }
    });
    return [...options.values()].sort((a, b) => b.dueAt.toMillis() - a.dueAt.toMillis());
  }, [records, tasks]);

  const scopedRecords = useMemo(() => records.filter((record) => {
    if (taskId !== "all" && record.taskId !== taskId) return false;
    if (scope !== "all" && record.scopeKey !== scope) return false;
    return true;
  }), [records, scope, taskId]);

  const wingRecords = useMemo(() => scopedRecords.filter((record) => (
    wing === "all" || record.wingId === wing
  )), [scopedRecords, wing]);

  const filtered = useMemo(() => wingRecords
    .filter((record) => status === "all" || record.status === status)
    .sort((a, b) => {
      const wingOrder = a.wingId.localeCompare(b.wingId);
      if (wingOrder) return wingOrder;
      return a.studentSnapshot.rollNumber.localeCompare(b.studentSnapshot.rollNumber);
    }), [status, wingRecords]);

  const wingStats = useMemo(() => WING_IDS.map((wingId) => {
    const wingItems = scopedRecords.filter((record) => record.wingId === wingId);
    return {
      wingId,
      total: wingItems.length,
      pending: wingItems.filter((record) => record.status === "pending").length,
      completed: wingItems.filter((record) => record.status === "completed").length,
      exempt: wingItems.filter((record) => record.status === "exempt").length,
      overdue: wingItems.filter((record) => urgency(record.taskSnapshot.dueAt, record.status) === "overdue").length,
      late: wingItems.filter((record) => record.status === "completed" && record.completedLate).length,
      rate: complianceRate(wingItems),
    };
  }), [scopedRecords]);

  const completed = wingRecords.filter((record) => record.status === "completed").length;
  const exempt = wingRecords.filter((record) => record.status === "exempt").length;
  const overdue = wingRecords.filter((record) => urgency(record.taskSnapshot.dueAt, record.status) === "overdue").length;
  const compliance = complianceRate(wingRecords);
  const selectedTask = taskOptions.find((task) => task.id === taskId);
  const resultMayBeTruncated = records.length === ASSIGNMENT_QUERY_LIMIT;

  function changeTask(nextTaskId: string) {
    setTaskId(nextTaskId);
    setWing("all");
  }

  function downloadCsv() {
    try {
      const headings = [
        "Task", "Task ID", "Student", "Roll number", "Section", "Wing", "Scope",
        "Deadline", "Status", "Completed late", "Exemption reason",
      ];
      const rows = filtered.map((record) => [
        record.taskSnapshot.title,
        record.taskId,
        record.studentSnapshot.displayName,
        record.studentSnapshot.rollNumber,
        record.sectionId,
        record.wingId,
        record.scopeKey,
        record.taskSnapshot.dueAt.toDate().toISOString(),
        record.status,
        record.completedLate ?? false,
        record.exemptionReason,
      ]);
      const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `compliance-${taskId === "all" ? "all-tasks" : taskId}-${wing === "all" ? "all-wings" : `wing-${wing}`}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (exportError) {
      setError(readableError(exportError));
    }
  }

  async function exemptAssignment(record: AssignmentRecord) {
    const reason = window.prompt(`Reason for exempting ${record.studentSnapshot.displayName}?`);
    if (!reason) return;
    try {
      await callFunction("setTaskExemption", { taskId: record.taskId, uid: record.uid, reason });
    } catch (exemptError) {
      setError(readableError(exemptError));
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-heading">
        <div>
          <p className="eyebrow">COMPLIANCE DESK</p>
          <h1>Know exactly what&apos;s pending.</h1>
          <p>Filter by task, compare Wings A–J, and follow up with the right students.</p>
        </div>
        <button className="secondary-button" onClick={downloadCsv}>Export current view ↓</button>
      </header>

      <section className="stats-grid stats-three">
        <article className="stat-card">
          <span>{taskId === "all" ? "Assignment records" : "Task recipients"}</span>
          <strong>{wingRecords.length}</strong>
          <small>{wing === "all" ? "All wings" : `Wing ${wing}`}</small>
        </article>
        <article className="stat-card success">
          <span>Compliance</span>
          <strong>{compliance === null ? "—" : `${compliance}%`}</strong>
          <small>{completed} completed · {exempt} exempt</small>
        </article>
        <article className="stat-card danger">
          <span>Overdue</span>
          <strong>{overdue}</strong>
          <small>Pending after the deadline</small>
        </article>
      </section>

      <section className="panel compliance-panel">
        <div className="toolbar">
          {broadAccess && (
            <label>
              Task
              <select value={taskId} onChange={(event) => changeTask(event.target.value)}>
                <option value="all">All tasks</option>
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>{task.title} · {formatDeadline(task.dueAt)}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Scope
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              {broadAccess && <option value="all">Entire batch</option>}
              {scopes.map((item) => <option key={item} value={item}>{item.replace(":", " · ")}</option>)}
            </select>
          </label>
          {broadAccess && (
            <label>
              Wing
              <select value={wing} onChange={(event) => setWing(event.target.value as WingFilter)}>
                <option value="all">All wings</option>
                {WING_IDS.map((wingId) => <option key={wingId} value={wingId}>Wing {wingId}</option>)}
              </select>
            </label>
          )}
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="exempt">Exempt</option>
              <option value="all">All</option>
            </select>
          </label>
          <span className="result-count">{filtered.length} records</span>
        </div>

        {selectedTask && (
          <div className="compliance-context">
            <strong>{selectedTask.title}</strong>
            <span>Due {formatDeadline(selectedTask.dueAt)}</span>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {resultMayBeTruncated && (
          <p className="form-error" role="alert">
            This view reached {ASSIGNMENT_QUERY_LIMIT.toLocaleString("en-IN")} records. Select one task for an exact task-level report.
          </p>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Student</th><th>Wing</th><th>Task</th><th>Scope</th><th>Deadline</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const recordUrgency = urgency(record.taskSnapshot.dueAt, record.status);
                const statusLabel = record.status === "pending" && recordUrgency === "overdue" ? "overdue" : record.status;
                return (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.studentSnapshot.displayName}</strong>
                      <small>{record.studentSnapshot.rollNumber} · Section {record.sectionId}</small>
                    </td>
                    <td><strong>Wing {record.wingId}</strong></td>
                    <td>{record.taskSnapshot.title}</td>
                    <td>{record.scopeKey.replace(":", " · ")}</td>
                    <td>{formatDeadline(record.taskSnapshot.dueAt)}</td>
                    <td>
                      <span className={`status-pill ${recordUrgency}`}>{statusLabel}</span>
                      {record.completedLate && <small>Completed late</small>}
                    </td>
                    <td>
                      {record.status !== "exempt" && !profile?.roles.cr && (
                        <button className="text-button" onClick={() => exemptAssignment(record)}>Exempt</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <span>◎</span><h3>No matching records</h3><p>Try another task, wing, scope, or status.</p>
          </div>
        )}
      </section>

      {broadAccess && (
        <section className="panel wing-compliance-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">WING BREAKDOWN</p>
              <h2>{selectedTask ? selectedTask.title : "All tasks"}</h2>
              <p className="helper">Exempt students are excluded from the compliance percentage.</p>
            </div>
            {wing !== "all" && <button className="secondary-button" onClick={() => setWing("all")}>Show all wings</button>}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Wing</th><th>Recipients</th><th>Pending</th><th>Completed</th><th>Exempt</th><th>Overdue</th><th>Late</th><th>Compliance</th><th /></tr>
              </thead>
              <tbody>
                {wingStats.map((item) => (
                  <tr key={item.wingId} className={wing === item.wingId ? "selected-wing-row" : undefined}>
                    <td><strong>Wing {item.wingId}</strong></td>
                    <td>{item.total}</td>
                    <td>{item.pending}</td>
                    <td>{item.completed}</td>
                    <td>{item.exempt}</td>
                    <td>{item.overdue}</td>
                    <td>{item.late}</td>
                    <td><strong>{item.rate === null ? "—" : `${item.rate}%`}</strong></td>
                    <td><button className="text-button" onClick={() => setWing(item.wingId)}>View students</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
