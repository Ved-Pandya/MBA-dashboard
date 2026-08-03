"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { TaskType } from "@mba/domain";
import type { TaskRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";

type Preview = { count: number; sample: Array<{ uid: string; displayName: string; rollNumber: string }> };

function indiaIso(value: string) {
  if (!value) throw new Error("Choose a deadline");
  return new Date(`${value}:00+05:30`).toISOString();
}

export function ManagementView() {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [type, setType] = useState<TaskType>(Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length ? "subject_assignment" : "administrative_form");
  const [scopeId, setScopeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjectIds = Object.keys(profile?.scopes.subjectPocOfferings ?? {});
  const wingIds = Object.keys(profile?.scopes.wingPocWings ?? {});
  const academic = type === "subject_assignment" || type === "pre_read";
  const availableScopes = academic ? subjectIds : wingIds;

  useEffect(() => { setScopeId(availableScopes[0] ?? ""); setPreview(null); }, [academic]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(getFirebase().db, "tasks"), where("ownerUid", "==", user.uid)), (snap) => {
      setTasks(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as TaskRecord).sort((a, b) => b.dueAt.toMillis() - a.dueAt.toMillis()));
    }, (queryError) => setError(readableError(queryError)));
  }, [user]);

  const payload = useMemo(() => ({
    title, description, taskType: type,
    target: academic
      ? { kind: "subject_offering" as const, scopeKey: `subject:${scopeId}`, subjectOfferingId: scopeId, sectionId: profile?.sectionId ?? "A" }
      : { kind: "wing" as const, scopeKey: `wing:${scopeId}`, wingId: scopeId },
    dueAtIso: dueAt ? indiaIso(dueAt) : "",
    resourceUrl: resourceUrl || undefined,
  }), [title, description, type, academic, scopeId, profile, dueAt, resourceUrl]);

  async function previewRecipients() {
    setBusy(true); setError(null);
    try { setPreview(await callFunction<typeof payload, Preview>("previewTaskRecipients", payload)); }
    catch (previewError) { setError(readableError(previewError)); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await callFunction<typeof payload & { idempotencyKey: string }, { taskId: string }>("createTask", { ...payload, idempotencyKey: crypto.randomUUID() });
      setTitle(""); setDescription(""); setDueAt(""); setResourceUrl(""); setPreview(null);
      await callFunction("publishTask", { taskId: result.taskId });
    } catch (createError) { setError(readableError(createError)); }
    finally { setBusy(false); }
  }

  async function act(name: "publishTask" | "closeTask" | "cancelTask", taskId: string) {
    setBusy(true); setError(null);
    try { await callFunction(name, { taskId, reason: name === "cancelTask" ? "Cancelled by task owner" : undefined }); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  return (
    <div className="page-wrap">
      <header className="page-heading"><div><p className="eyebrow">POC WORKSPACE</p><h1>Publish with confidence.</h1><p>Scope, recipient count, and reminder timing are validated before anything goes live.</p></div></header>
      <div className="two-column">
        <form className="panel create-form" onSubmit={create}>
          <div className="panel-head"><div><p className="eyebrow">NEW OBLIGATION</p><h2>Create deadline</h2></div><span className="status-pill">Draft</span></div>
          <label>Task type<select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
            {subjectIds.length > 0 && <><option value="subject_assignment">Subject assignment</option><option value="pre_read">Pre-read</option></>}
            {wingIds.length > 0 && <><option value="case_competition">Case competition</option><option value="administrative_form">Administrative form</option></>}
          </select></label>
          <label>{academic ? "Subject offering" : "Wing"}<select value={scopeId} onChange={(event) => { setScopeId(event.target.value); setPreview(null); }} required>
            {!availableScopes.length && <option value="">No authorized scope</option>}
            {availableScopes.map((id) => <option key={id} value={id}>{id}</option>)}
          </select></label>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Finance case memo" minLength={3} maxLength={140} required /></label>
          <label>Instructions<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What must be read, filled, or submitted?" rows={4} required /></label>
          <div className="form-row"><label>Deadline · IST<input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setPreview(null); }} required /></label><label>Resource URL<input type="url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://" /></label></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {preview && <div className="recipient-preview"><strong>{preview.count} recipients</strong><p>{preview.sample.slice(0, 4).map((person) => person.displayName).join(", ")}{preview.count > 4 ? ` +${preview.count - 4} more` : ""}</p></div>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={previewRecipients} disabled={busy || !scopeId || !title || !dueAt}>Preview audience</button><button className="primary-button" disabled={busy || !preview}>{busy ? "Working…" : "Publish task"}</button></div>
        </form>

        <section className="panel managed-list">
          <div className="panel-head"><div><p className="eyebrow">OWNED TASKS</p><h2>Live operations</h2></div><span className="count-badge">{tasks.length}</span></div>
          {!tasks.length && <div className="empty-state"><span>＋</span><h3>No tasks yet</h3><p>Your published obligations will appear here.</p></div>}
          {tasks.map((task) => <article key={task.id} className="managed-task"><div><span className={`category ${task.taskType}`}>{task.taskType.replaceAll("_", " ")}</span><h3>{task.title}</h3><p>{task.target.scopeKey.replace(":", " · ")} · {formatDeadline(task.dueAt)}</p></div><div className="managed-actions"><span className={`status-pill ${task.status}`}>{task.status}</span>{task.status === "draft" && <button onClick={() => act("publishTask", task.id)} disabled={busy}>Publish</button>}{task.status === "published" && <><button onClick={() => act("closeTask", task.id)} disabled={busy}>Close</button><button className="danger-link" onClick={() => act("cancelTask", task.id)} disabled={busy}>Cancel</button></>}</div></article>)}
        </section>
      </div>
    </div>
  );
}
