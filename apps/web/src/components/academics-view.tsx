"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { AcademicEventType } from "@mba/domain";
import type { AcademicEventRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { useAuth } from "./auth-provider";

type Offering = { id: string; subjectCode: string; subjectName: string; sectionId: string; termId: string };
type Slot = { id: string; offeringId: string; termId: string; weekday: number; startTime: string; active: boolean };
type Term = { id: string; startDate?: string; endDate?: string };
type Exception = { id: string; slotId: string; originalDate: string; status: "cancelled" | "rescheduled"; rescheduledAt?: { toDate(): Date } };

function indiaIso(value: string) { return new Date(`${value}:00+05:30`).toISOString(); }
function localInput(date: Date) { return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16); }

function nextClass(slots: Slot[], offering: Offering | undefined, terms: Term[], exceptions: Exception[]) {
  if (!offering) return undefined;
  const now = new Date();
  const indiaNow = new Date(now.getTime() + 330 * 60_000);
  const candidates: Date[] = [];
  const term = terms.find((item) => item.id === offering.termId);
  for (const slot of slots.filter((item) => item.offeringId === offering.id && item.active !== false)) {
    for (let add = 0; add <= 14; add += 1) {
      const candidate = new Date(indiaNow);
      candidate.setUTCDate(indiaNow.getUTCDate() + add);
      const weekday = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay();
      if (weekday !== slot.weekday) continue;
      const localDate = candidate.toISOString().slice(0, 10);
      if ((term?.startDate && localDate < term.startDate) || (term?.endDate && localDate > term.endDate)) continue;
      const exception = exceptions.find((item) => item.slotId === slot.id && item.originalDate === localDate);
      if (exception?.status === "cancelled") continue;
      if (exception?.status === "rescheduled" && exception.rescheduledAt) { const rescheduled = exception.rescheduledAt.toDate(); if (rescheduled > now) candidates.push(rescheduled); continue; }
      const [hours, minutes] = slot.startTime.split(":").map(Number);
      candidate.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
      const absolute = new Date(candidate.getTime() - 330 * 60_000);
      if (absolute > now) candidates.push(absolute);
    }
  }
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

export function AcademicsView() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<AcademicEventRecord[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const offeringIds = Object.keys(profile?.scopes.subjectPocOfferings ?? {});
  const [form, setForm] = useState({ offeringId: offeringIds[0] ?? "", eventType: "assignment_deadline" as AcademicEventType, title: "", details: "", occursAt: "", resourceUrl: "" });
  const [editingEventId, setEditingEventId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const unsubEvents = onSnapshot(query(collection(getFirebase().db, "academicEvents"), where("sectionId", "==", profile.sectionId)), (snap) => setEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AcademicEventRecord)), (err) => setError(readableError(err)));
    const unsubOfferings = onSnapshot(collection(getFirebase().db, "subjectOfferings"), (snap) => setOfferings(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Offering)));
    const unsubSlots = onSnapshot(collection(getFirebase().db, "timetableSlots"), (snap) => setSlots(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Slot)));
    const unsubTerms = onSnapshot(collection(getFirebase().db, "academicTerms"), (snap) => setTerms(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Term)));
    const unsubExceptions = onSnapshot(collection(getFirebase().db, "timetableExceptions"), (snap) => setExceptions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Exception)));
    return () => { unsubEvents(); unsubOfferings(); unsubSlots(); unsubTerms(); unsubExceptions(); };
  }, [profile]);

  const sorted = useMemo(() => events.filter((event) => event.status === "published").sort((a, b) => a.occursAt.toMillis() - b.occursAt.toMillis()), [events]);
  const groups = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(start); tomorrow.setDate(start.getDate() + 1);
    const week = new Date(start); week.setDate(start.getDate() + 7);
    return {
      Today: sorted.filter((item) => item.occursAt.toDate() >= start && item.occursAt.toDate() < tomorrow),
      "This Week": sorted.filter((item) => item.occursAt.toDate() >= tomorrow && item.occursAt.toDate() < week),
      Upcoming: sorted.filter((item) => item.occursAt.toDate() >= week),
    };
  }, [sorted]);

  function selectOffering(offeringId: string, eventType = form.eventType) {
    const suggestion = eventType === "pre_read" ? nextClass(slots, offerings.find((item) => item.id === offeringId), terms, exceptions) : undefined;
    setForm((current) => ({ ...current, offeringId, eventType, ...(suggestion ? { occursAt: localInput(suggestion) } : {}) }));
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await callFunction(editingEventId ? "updateAcademicEvent" : "createAcademicEvent", { ...(editingEventId ? { eventId: editingEventId } : {}), offeringId: form.offeringId, eventType: form.eventType, title: form.title, details: form.details, occursAtIso: indiaIso(form.occursAt), resourceUrl: form.resourceUrl || undefined });
      setForm((current) => ({ ...current, title: "", details: "", resourceUrl: "" }));
      setEditingEventId("");
    } catch (createError) { setError(readableError(createError)); }
    finally { setBusy(false); }
  }

  async function cancel(item: AcademicEventRecord) {
    const reason = window.prompt("Reason for cancelling this academic item?");
    if (!reason) return;
    setBusy(true);
    try { await callFunction("cancelAcademicEvent", { eventId: item.id, reason }); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  function edit(item: AcademicEventRecord) {
    setEditingEventId(item.id);
    setForm({ offeringId: item.offeringId, eventType: item.eventType, title: item.title, details: item.details ?? "", occursAt: localInput(item.occursAt.toDate()), resourceUrl: item.resourceUrl ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">ACADEMICS</p><h1>Your academic calendar</h1><p>Assignments, quizzes, midterms, and the reading needed before class.</p></div></header>
    {error && <p className="form-error">{error}</p>}
    {offeringIds.length > 0 && <form className="panel create-form academic-editor" onSubmit={create}>
      <div className="panel-head"><div><p className="eyebrow">SUBJECT POC</p><h2>Add calendar item</h2></div></div>
      <div className="form-row"><label>Subject<select value={form.offeringId} onChange={(event) => selectOffering(event.target.value)}>{offeringIds.map((id) => <option key={id} value={id}>{offerings.find((item) => item.id === id)?.subjectName ?? id}</option>)}</select></label><label>Type<select value={form.eventType} onChange={(event) => selectOffering(form.offeringId, event.target.value as AcademicEventType)}><option value="assignment_deadline">Assignment deadline</option><option value="quiz">Quiz</option><option value="midterm">Midterm</option><option value="pre_read">Pre-read</option></select></label></div>
      <label>Name<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Chapter, quiz, or assignment name" required /></label>
      <label>Details<textarea value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} rows={3} /></label>
      <div className="form-row"><label>Date and time · IST<input type="datetime-local" value={form.occursAt} onChange={(event) => setForm({ ...form, occursAt: event.target.value })} required /></label><label>Optional link<input type="url" value={form.resourceUrl} onChange={(event) => setForm({ ...form, resourceUrl: event.target.value })} /></label></div>
      <small>Pre-reads default to the next scheduled class when timetable data is available. You can override the date.</small>
      <div className="form-actions">{editingEventId && <button type="button" className="secondary-button" onClick={() => setEditingEventId("")}>Cancel edit</button>}<button className="primary-button" disabled={busy}>{editingEventId ? "Save changes" : "Publish academic item"}</button></div>
    </form>}
    <div className="calendar-groups">{Object.entries(groups).map(([label, items]) => <section className="panel task-panel" key={label}><div className="panel-head"><div><p className="eyebrow">{label.toUpperCase()}</p><h2>{label}</h2></div><span className="count-badge">{items.length}</span></div>{!items.length && <p className="helper">No academic items in this period.</p>}{items.map((item) => <article className="academic-row" key={item.id}><div><span className="category">{item.eventType.replaceAll("_", " ")}</span><h3>{item.title}</h3><p>{offerings.find((offering) => offering.id === item.offeringId)?.subjectName ?? item.offeringId} · {formatDeadline(item.occursAt)}</p>{item.details && <small>{item.details}</small>}</div><div>{item.resourceUrl && <a className="resource-link" href={item.resourceUrl} target="_blank" rel="noreferrer">Open</a>}{offeringIds.includes(item.offeringId) && <><button className="text-button" onClick={() => edit(item)} disabled={busy}>Edit</button><button className="danger-link text-button" onClick={() => cancel(item)} disabled={busy}>Cancel</button></>}</div></article>)}</section>)}</div>
  </div>;
}
