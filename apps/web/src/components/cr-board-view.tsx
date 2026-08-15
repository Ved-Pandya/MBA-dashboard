"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CR_TASK_STATUSES, type CrTaskStatus } from "@mba/domain";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import type { CrTaskRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { useAuth } from "./auth-provider";

type DueFilter = "all" | "overdue" | "this_week" | "no_date";

const STATUS_LABELS: Record<CrTaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
};

function indiaIso(value: string) {
  return new Date(`${value}:00+05:30`).toISOString();
}

function localInput(taskDate: CrTaskRecord["dueAt"]) {
  if (!taskDate) return "";
  return new Date(taskDate.toMillis() + 330 * 60_000).toISOString().slice(0, 16);
}

function isOverdue(task: CrTaskRecord) {
  return task.status !== "completed" && Boolean(task.dueAt && task.dueAt.toMillis() < Date.now());
}

export function CrBoardView() {
  const { profile } = useAuth();
  const canEdit = Boolean(profile?.roles.cr);
  const canView = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const [tasks, setTasks] = useState<CrTaskRecord[]>([]);
  const [search, setSearch] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [mobileStatus, setMobileStatus] = useState<CrTaskStatus>("assigned");
  const [editorTaskId, setEditorTaskId] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", dueAt: "", status: "assigned" as CrTaskStatus });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!canView) return;
    return onSnapshot(
      query(collection(getFirebase().db, "crTasks"), limit(500)),
      (snapshot) => {
        setTasks(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as CrTaskRecord));
        setError("");
      },
      (queryError) => setError(readableError(queryError)),
    );
  }, [canView]);

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60_000;
    return tasks.filter((task) => {
      if (normalizedSearch && !`${task.title} ${task.notes}`.toLowerCase().includes(normalizedSearch)) return false;
      if (dueFilter === "overdue" && !isOverdue(task)) return false;
      if (dueFilter === "this_week" && (!task.dueAt || task.dueAt.toMillis() < Date.now() || task.dueAt.toMillis() > weekFromNow)) return false;
      if (dueFilter === "no_date" && task.dueAt) return false;
      return true;
    });
  }, [dueFilter, search, tasks]);

  const grouped = useMemo(() => Object.fromEntries(CR_TASK_STATUSES.map((status) => [
    status,
    visibleTasks.filter((task) => task.status === status).sort((a, b) => {
      if (status === "completed") return (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0);
      if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title);
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.toMillis() - b.dueAt.toMillis();
    }),
  ])) as Record<CrTaskStatus, CrTaskRecord[]>, [visibleTasks]);

  function openCreate() {
    setEditorTaskId(null);
    setEditorVersion(0);
    setForm({ title: "", notes: "", dueAt: "", status: "assigned" });
    setError("");
    setConflict(false);
    setEditorOpen(true);
  }

  function loadEditor(task: CrTaskRecord) {
    setEditorTaskId(task.id);
    setEditorVersion(task.version);
    setForm({ title: task.title, notes: task.notes ?? "", dueAt: localInput(task.dueAt), status: task.status });
    setError("");
    setConflict(false);
    setEditorOpen(true);
  }

  function refreshEditor() {
    const freshTask = tasks.find((task) => task.id === editorTaskId);
    if (freshTask) loadEditor(freshTask);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      if (editorTaskId) {
        const current = tasks.find((task) => task.id === editorTaskId);
        if (!current) throw new Error("This task is no longer available.");
        await callFunction("updateCrTask", {
          taskId: editorTaskId,
          expectedVersion: editorVersion,
          title: form.title,
          notes: form.notes,
          dueAtIso: form.dueAt ? indiaIso(form.dueAt) : null,
          status: form.status,
        });
      } else {
        await callFunction("createCrTask", {
          title: form.title,
          notes: form.notes,
          dueAtIso: form.dueAt ? indiaIso(form.dueAt) : undefined,
          idempotencyKey: crypto.randomUUID(),
        });
      }
      setEditorOpen(false);
    } catch (saveError) {
      const message = readableError(saveError);
      setError(message);
      setConflict(message.toLowerCase().includes("another cr") || message.toLowerCase().includes("refresh"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task: CrTaskRecord, status: CrTaskStatus) {
    if (!canEdit || task.status === status) return;
    setBusy(true);
    setError("");
    try {
      await callFunction("updateCrTask", { taskId: task.id, expectedVersion: task.version, status });
    } catch (statusError) {
      const message = readableError(statusError);
      setError(message);
      if (message.toLowerCase().includes("another cr") || message.toLowerCase().includes("refresh")) {
        loadEditor(task);
        setError(message);
        setConflict(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  return (
    <div className="page-wrap cr-board-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">PRIVATE CR WORKSPACE</p>
          <h1>CR Board</h1>
          <p>A shared operational board visible only to active CRs and read-only administrators.</p>
        </div>
        {canEdit && <button className="primary-button" onClick={openCreate}>+ Add CR task</button>}
      </header>

      {!canEdit && <div className="cr-readonly-banner"><strong>Read-only administrator view</strong><span>Only active CRs can create or update these tasks.</span></div>}
      {error && !editorOpen && <p className="form-error" role="alert">{error}</p>}

      <section className="stats-grid stats-three">
        {CR_TASK_STATUSES.map((status) => (
          <article className={`stat-card cr-stat-${status}`} key={status}>
            <span>{STATUS_LABELS[status]}</span>
            <strong>{tasks.filter((task) => task.status === status).length}</strong>
            <small>{status === "completed" ? "Retained as history" : `${tasks.filter((task) => task.status === status && isOverdue(task)).length} overdue`}</small>
          </article>
        ))}
      </section>

      <section className="panel cr-board-controls">
        <label>
          Search tasks
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or notes" />
        </label>
        <label>
          Due date
          <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)}>
            <option value="all">All dates</option>
            <option value="overdue">Overdue</option>
            <option value="this_week">Due in 7 days</option>
            <option value="no_date">No deadline</option>
          </select>
        </label>
        <span>{visibleTasks.length} matching tasks</span>
      </section>

      <div className="cr-mobile-tabs" role="tablist" aria-label="CR task status">
        {CR_TASK_STATUSES.map((status) => (
          <button key={status} role="tab" aria-selected={mobileStatus === status} className={mobileStatus === status ? "active" : ""} onClick={() => setMobileStatus(status)}>
            {STATUS_LABELS[status]} <span>{grouped[status].length}</span>
          </button>
        ))}
      </div>

      <div className="cr-board-grid">
        {CR_TASK_STATUSES.map((status) => (
          <section className="cr-column" data-mobile-active={mobileStatus === status} key={status}>
            <div className="cr-column-head">
              <h2>{STATUS_LABELS[status]}</h2><span>{grouped[status].length}</span>
            </div>
            <div className="cr-card-list">
              {!grouped[status].length && <div className="cr-column-empty">No matching tasks</div>}
              {grouped[status].map((task) => (
                <article className={`cr-task-card ${isOverdue(task) ? "overdue" : ""}`} key={task.id}>
                  <div className="cr-task-card-head">
                    <span className={`status-pill ${task.status}`}>{STATUS_LABELS[task.status]}</span>
                    {canEdit && <button className="text-button" onClick={() => loadEditor(task)}>Edit</button>}
                  </div>
                  <h3>{task.title}</h3>
                  {task.notes && <p>{task.notes}</p>}
                  <div className="cr-task-meta">
                    <span className={isOverdue(task) ? "overdue-text" : ""}>{task.dueAt ? `${isOverdue(task) ? "Overdue - " : "Due - "}${formatDeadline(task.dueAt)}` : "No deadline"}</span>
                    {task.creatorSnapshot?.displayName && <small>Created by {task.creatorSnapshot.displayName}</small>}
                  </div>
                  {canEdit && (
                    <div className="cr-status-actions">
                      {task.status !== "assigned" && <button onClick={() => changeStatus(task, "assigned")} disabled={busy}>Assigned</button>}
                      {task.status !== "in_progress" && <button onClick={() => changeStatus(task, "in_progress")} disabled={busy}>{task.status === "completed" ? "Reopen" : "Start"}</button>}
                      {task.status !== "completed" && <button className="complete" onClick={() => changeStatus(task, "completed")} disabled={busy}>Complete</button>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {editorOpen && (
        <>
          <button className="cr-editor-backdrop" onClick={() => setEditorOpen(false)} aria-label="Close CR task editor" />
          <aside className="cr-editor" aria-label={editorTaskId ? "Edit CR task" : "Create CR task"}>
            <div className="drawer-head">
              <div><p className="eyebrow">CR BOARD</p><h2>{editorTaskId ? "Edit task" : "Add task"}</h2></div>
              <button className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Close">x</button>
            </div>
            <form className="create-form" onSubmit={save}>
              <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={3} maxLength={140} required /></label>
              <label>Shared notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={7} maxLength={8000} placeholder="Context, decisions, links, or follow-up details" /></label>
              <label>Deadline - IST<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
              {editorTaskId && <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CrTaskStatus })}>{CR_TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {conflict && <button type="button" className="secondary-button cr-refresh-button" onClick={refreshEditor}>Refresh latest version</button>}
              <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditorOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving..." : editorTaskId ? "Save changes" : "Add task"}</button></div>
            </form>
          </aside>
        </>
      )}
    </div>
  );
}
