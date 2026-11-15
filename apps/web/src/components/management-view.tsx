"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { TaskRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { AppIcon } from "./app-icon";

type Preview = { count: number; sample: Array<{ uid: string; displayName: string; rollNumber: string }> };

function indiaIso(value: string) {
  if (!value) throw new Error("Choose a deadline");
  return new Date(`${value}:00+05:30`).toISOString();
}

export function ManagementView() {
  const { user, profile } = useAuth();
  const [editorOpen, setEditorOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [taskFilter, setTaskFilter] = useState("all");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [editingTaskId, setEditingTaskId] = useState("");
  const type = "administrative_form" as const;
  const [scopeId, setScopeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wingIds = Object.keys(profile?.scopes.wingPocWings ?? {});
  const availableScopes = wingIds;
  useEffect(() => { if (editorOpen) titleRef.current?.focus({ preventScroll: true }); }, [editorOpen, editingTaskId]);

  useEffect(() => { setScopeId(availableScopes[0] ?? ""); setPreview(null); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || !wingIds.length) return;
    return onSnapshot(query(collection(getFirebase().db, "tasks"), where("target.kind", "==", "wing"), where("target.wingId", "in", wingIds)), (snap) => {
      setTasks(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as TaskRecord).sort((a, b) => b.dueAt.toMillis() - a.dueAt.toMillis()));
    }, (queryError) => setError(readableError(queryError)));
  }, [user, profile]);

  const payload = useMemo(() => ({
    title, description, taskType: type,
    target: { kind: "wing" as const, scopeKey: `wing:${scopeId}`, wingId: scopeId },
    dueAtIso: dueAt ? indiaIso(dueAt) : "",
    resourceUrl: resourceUrl || undefined,
  }), [title, description, scopeId, dueAt, resourceUrl]);

  async function previewRecipients() {
    setBusy(true); setError(null);
    try { setPreview(await callFunction<typeof payload, Preview>("previewTaskRecipients", payload)); }
    catch (previewError) { setError(readableError(previewError)); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (editingTaskId) {
        await callFunction("updateTask", { ...payload, taskId: editingTaskId });
      } else {
        const result = await callFunction<typeof payload & { idempotencyKey: string }, { taskId: string }>("createTask", { ...payload, idempotencyKey: crypto.randomUUID() });
        setEditingTaskId(result.taskId);
        await callFunction("publishTask", { taskId: result.taskId });
      }
      resetForm();
    } catch (createError) { setError(readableError(createError)); }
    finally { setBusy(false); }
  }

  function resetForm() { setEditorOpen(false); setEditingTaskId(""); setTitle(""); setDescription(""); setDueAt(""); setResourceUrl(""); setPreview(null); }

  function edit(task: TaskRecord) {
    setEditorOpen(true);
    setEditingTaskId(task.id); setTitle(task.title); setDescription(task.description); setScopeId(task.target.wingId ?? "");
    setDueAt(new Date(task.dueAt.toMillis() + 330 * 60_000).toISOString().slice(0, 16)); setResourceUrl(task.resourceUrl ?? ""); setPreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function act(name: "publishTask" | "closeTask" | "cancelTask" | "syncTaskRecipients", taskId: string) {
    setBusy(true); setError(null);
    try { await callFunction(name, { taskId, reason: name === "cancelTask" ? "Cancelled by task owner" : undefined }); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  return (
    <div className="page-wrap">
      <header className="page-heading"><div><h1>Wing forms</h1><p>Publish deadlines for your wing. Review the audience before sending.</p></div><button className="primary-button" onClick={() => { resetForm(); setEditorOpen(true); }}><AppIcon name="plus" />New wing form</button></header>
      {error && !editorOpen && <p className="form-error" role="alert">{error}</p>}
      <div className={editorOpen ? "management-workspace is-editing" : "management-workspace"}>
        <section className="panel managed-list"><div className="panel-head"><h2>Your wing forms</h2><span className="count-badge">{tasks.length}</span></div><div className="record-tabs" aria-label="Form status">{[{ id: "all", label: "All forms" }, { id: "published", label: "Live" }, { id: "draft", label: "Drafts" }, { id: "closed", label: "Closed" }].map((item) => <button key={item.id} className={taskFilter === item.id ? "active" : ""} aria-pressed={taskFilter === item.id} onClick={() => setTaskFilter(item.id)}>{item.label}</button>)}</div>
          {tasks.filter((task) => taskFilter === "all" || (taskFilter === "closed" ? ["closed", "cancelled"].includes(task.status) : task.status === taskFilter)).map((task) => <article key={task.id} className="managed-task"><div><div className="record-meta"><span className={`status-pill ${task.status}`}>{task.status}</span><span>Wing {task.target.wingId}</span></div><h3>{task.title}</h3><p>Due {formatDeadline(task.dueAt)}</p></div><div className="managed-actions">{["draft", "published"].includes(task.status) && <button className="secondary-button" onClick={() => edit(task)} disabled={busy}>Edit</button>}{task.status === "draft" && <button className="primary-button" onClick={() => act("publishTask", task.id)} disabled={busy}>Publish</button>}{task.status === "published" && <details className="row-menu"><summary aria-label={`More actions for ${task.title}`}>More<AppIcon name="chevron" /></summary><div><button onClick={() => act("syncTaskRecipients", task.id)} disabled={busy}>Sync audience</button><button onClick={() => act("closeTask", task.id)} disabled={busy}>Close</button><button className="danger-link" onClick={() => act("cancelTask", task.id)} disabled={busy}>Cancel</button></div></details>}</div></article>)}
          {!tasks.length && <div className="list-empty"><h3>No wing forms yet.</h3><p>Create a form, check who will receive it, then publish it to your wing.</p><button className="text-link" onClick={() => setEditorOpen(true)}>Create your first form<AppIcon name="arrow" /></button></div>}
        </section>
        {editorOpen && <form className="panel create-form wing-editor" onSubmit={create}><div className="editor-title"><div><h2>{editingTaskId ? "Edit wing form" : "New wing form"}</h2><p>The details students will see.</p></div><button type="button" className="icon-button" aria-label="Close form editor" onClick={resetForm}><AppIcon name="close" /></button></div>
          <label>Wing<select value={scopeId} disabled={Boolean(editingTaskId && tasks.find((task) => task.id === editingTaskId)?.status === "published")} onChange={(event) => { setScopeId(event.target.value); setPreview(null); }} required>{!availableScopes.length && <option value="">No authorized scope</option>}{availableScopes.map((id) => <option key={id} value={id}>Wing {id}</option>)}</select></label>
          <label>Title<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Submit your placement preferences" minLength={3} maxLength={140} required /></label>
          <label>Instructions<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does your wing need to do?" rows={4} required /></label>
          <label>Deadline · IST<input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setPreview(null); }} required /></label>
          <label>Resource URL<input type="url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://" /><small>Link to the form or document, if there is one.</small></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {preview && <div className="recipient-preview"><strong>{preview.count} recipients in Wing {scopeId}</strong><p>{preview.sample.slice(0, 4).map((person) => person.displayName).join(", ")}{preview.count > 4 ? ` and ${preview.count - 4} more` : ""}</p></div>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={previewRecipients} disabled={busy || !scopeId || !title || !dueAt}>Preview audience</button><button className="primary-button" disabled={busy || (!editingTaskId && !preview)}>{busy ? "Saving…" : editingTaskId ? "Save changes" : "Publish task"}<AppIcon name="arrow" /></button></div>
        </form>}
      </div>
    </div>
  );
}
