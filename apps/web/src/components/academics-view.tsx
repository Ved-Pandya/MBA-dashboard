"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { AcademicEventType } from "@mba/domain";
import type { AcademicEventRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { useAuth } from "./auth-provider";

type Offering = { id: string; subjectCode: string; subjectName: string; sectionId: string; termId: string; active?: boolean };
type Slot = { id: string; offeringId: string; termId: string; weekday: number; startTime: string; active: boolean };
type Term = { id: string; startDate?: string; endDate?: string };
type Exception = { id: string; slotId: string; originalDate: string; status: "cancelled" | "rescheduled"; rescheduledAt?: { toDate(): Date } };

function indiaIso(value: string) { return new Date(`${value}:00+05:30`).toISOString(); }
function localInput(date: Date) { return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16); }

function nextClass(slots: Slot[], offering: Offering | undefined, terms: Term[], exceptions: Exception[]) {
  if (!offering) return undefined;
  const now = new Date(); const indiaNow = new Date(now.getTime() + 330 * 60_000); const candidates: Date[] = []; const term = terms.find((item) => item.id === offering.termId);
  for (const slot of slots.filter((item) => item.offeringId === offering.id && item.active !== false)) for (let add = 0; add <= 14; add += 1) {
    const candidate = new Date(indiaNow); candidate.setUTCDate(indiaNow.getUTCDate() + add); const weekday = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay(); if (weekday !== slot.weekday) continue;
    const localDate = candidate.toISOString().slice(0, 10); if ((term?.startDate && localDate < term.startDate) || (term?.endDate && localDate > term.endDate)) continue;
    const exception = exceptions.find((item) => item.slotId === slot.id && item.originalDate === localDate); if (exception?.status === "cancelled") continue; if (exception?.status === "rescheduled" && exception.rescheduledAt) { const rescheduled = exception.rescheduledAt.toDate(); if (rescheduled > now) candidates.push(rescheduled); continue; }
    const [hours, minutes] = slot.startTime.split(":").map(Number); candidate.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0); const absolute = new Date(candidate.getTime() - 330 * 60_000); if (absolute > now) candidates.push(absolute);
  }
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

function timeGroups(items: AcademicEventRecord[], excludeExams = false) {
  const start = new Date(); start.setHours(0, 0, 0, 0); const tomorrow = new Date(start); tomorrow.setDate(start.getDate() + 1); const week = new Date(start); week.setDate(start.getDate() + 7);
  const filtered = items.filter((item) => item.occursAt.toDate() >= start && (!excludeExams || !["midterm", "endterm"].includes(item.eventType)));
  return { Today: filtered.filter((item) => item.occursAt.toDate() < tomorrow), "This Week": filtered.filter((item) => item.occursAt.toDate() >= tomorrow && item.occursAt.toDate() < week), Later: filtered.filter((item) => item.occursAt.toDate() >= week) };
}

export function AcademicsView() {
  const { profile } = useAuth(); const academicGovernor = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const [events, setEvents] = useState<AcademicEventRecord[]>([]); const [offerings, setOfferings] = useState<Offering[]>([]); const [slots, setSlots] = useState<Slot[]>([]); const [terms, setTerms] = useState<Term[]>([]); const [exceptions, setExceptions] = useState<Exception[]>([]);
  const scopedOfferingIds = useMemo(() => Object.keys(profile?.scopes.subjectPocOfferings ?? {}), [profile]);
  const [form, setForm] = useState({ offeringId: "", eventType: "assignment_deadline" as AcademicEventType, title: "", details: "", occursAt: "", endsAt: "", venue: "", syllabus: "", resourceUrl: "" });
  const [editingEventId, setEditingEventId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return; const db = getFirebase().db; const eventQuery = academicGovernor ? collection(db, "academicEvents") : query(collection(db, "academicEvents"), where("sectionId", "==", profile.sectionId));
    const unsubs = [onSnapshot(eventQuery, (snap) => setEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AcademicEventRecord)), (err) => setError(readableError(err))), onSnapshot(collection(db, "subjectOfferings"), (snap) => setOfferings(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Offering))), onSnapshot(collection(db, "timetableSlots"), (snap) => setSlots(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Slot))), onSnapshot(collection(db, "academicTerms"), (snap) => setTerms(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Term))), onSnapshot(collection(db, "timetableExceptions"), (snap) => setExceptions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Exception)))]; return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [profile, academicGovernor]);

  const offeringIds = useMemo(() => academicGovernor ? offerings.filter((item) => item.active !== false).map((item) => item.id) : scopedOfferingIds, [academicGovernor, offerings, scopedOfferingIds]);
  useEffect(() => { if ((!form.offeringId || !offeringIds.includes(form.offeringId)) && offeringIds[0]) setForm((current) => ({ ...current, offeringId: offeringIds[0]! })); }, [form.offeringId, offeringIds]);
  const sorted = useMemo(() => events.filter((event) => event.status === "published").sort((a, b) => a.occursAt.toMillis() - b.occursAt.toMillis()), [events]);
  const examGroups = useMemo(() => timeGroups(sorted.filter((item) => ["midterm", "endterm"].includes(item.eventType))), [sorted]); const academicGroups = useMemo(() => timeGroups(sorted, true), [sorted]);

  function selectOffering(offeringId: string, eventType = form.eventType) { const suggestion = eventType === "pre_read" ? nextClass(slots, offerings.find((item) => item.id === offeringId), terms, exceptions) : undefined; setForm((current) => ({ ...current, offeringId, eventType, ...(suggestion ? { occursAt: localInput(suggestion) } : {}) })); }
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await callFunction(editingEventId ? "updateAcademicEvent" : "createAcademicEvent", { ...(editingEventId ? { eventId: editingEventId } : {}), offeringId: form.offeringId, eventType: form.eventType, title: form.title, details: form.details, occursAtIso: indiaIso(form.occursAt), endsAtIso: form.endsAt ? indiaIso(form.endsAt) : undefined, venue: form.venue, syllabus: form.syllabus, resourceUrl: form.resourceUrl || undefined }); setForm((current) => ({ ...current, title: "", details: "", endsAt: "", venue: "", syllabus: "", resourceUrl: "" })); setEditingEventId(""); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }
  async function cancel(item: AcademicEventRecord) { const reason = window.prompt("Reason for cancelling this academic item?"); if (!reason) return; setBusy(true); try { await callFunction("cancelAcademicEvent", { eventId: item.id, reason }); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }
  function edit(item: AcademicEventRecord) { setEditingEventId(item.id); setForm({ offeringId: item.offeringId, eventType: item.eventType, title: item.title, details: item.details ?? "", occursAt: localInput(item.occursAt.toDate()), endsAt: item.endsAt ? localInput(item.endsAt.toDate()) : "", venue: item.venue ?? "", syllabus: item.syllabus ?? "", resourceUrl: item.resourceUrl ?? "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const row = (item: AcademicEventRecord) => <article className="academic-row" key={item.id}><div><span className="category">{item.eventType.replaceAll("_", " ")}</span><h3>{item.title}</h3><p>{offerings.find((offering) => offering.id === item.offeringId)?.subjectName ?? item.offeringId} · {formatDeadline(item.occursAt)}{item.venue ? ` · ${item.venue}` : ""}</p>{item.details && <small>{item.details}</small>}{item.syllabus && <small>Syllabus: {item.syllabus}</small>}</div><div>{item.resourceUrl && <a className="resource-link" href={item.resourceUrl} target="_blank" rel="noreferrer">Open</a>}{offeringIds.includes(item.offeringId) && <><button className="text-button" onClick={() => edit(item)} disabled={busy}>Edit</button><button className="danger-link text-button" onClick={() => void cancel(item)} disabled={busy}>Cancel</button></>}</div></article>;

  return <div className="page-wrap"><header className="page-heading"><div><p className="eyebrow">ACADEMICS</p><h1>Classes, deadlines, and exams</h1><p>Formal exams are separated from everyday academic work.</p></div></header>{error && <p className="form-error">{error}</p>}
    {offeringIds.length > 0 && <form className="panel create-form academic-editor" onSubmit={save}><div className="panel-head"><div><p className="eyebrow">{academicGovernor ? "CR / ADMIN" : "SUBJECT POC"}</p><h2>{editingEventId ? "Edit academic item" : "Add academic item"}</h2></div></div><div className="form-row"><label>Subject<select value={form.offeringId} onChange={(event) => selectOffering(event.target.value)}>{offeringIds.map((id) => { const offering = offerings.find((item) => item.id === id); return <option key={id} value={id}>{offering ? `${offering.subjectName} · Section ${offering.sectionId}` : id}</option>; })}</select></label><label>Type<select value={form.eventType} onChange={(event) => selectOffering(form.offeringId, event.target.value as AcademicEventType)}><option value="assignment_deadline">Assignment deadline</option><option value="quiz">Quiz</option><option value="midterm">Midterm</option><option value="endterm">Endterm</option><option value="pre_read">Pre-read</option></select></label></div><label>Name<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label>Details<textarea value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} rows={3} /></label><div className="form-row"><label>Date and time · IST<input type="datetime-local" value={form.occursAt} onChange={(event) => setForm({ ...form, occursAt: event.target.value })} required /></label><label>Optional end time · IST<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label></div>{["midterm", "endterm"].includes(form.eventType) && <div className="form-row"><label>Venue<input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label><label>Syllabus<input value={form.syllabus} onChange={(event) => setForm({ ...form, syllabus: event.target.value })} /></label></div>}<label>Optional link<input type="url" value={form.resourceUrl} onChange={(event) => setForm({ ...form, resourceUrl: event.target.value })} /></label><div className="form-actions">{editingEventId && <button type="button" className="secondary-button" onClick={() => setEditingEventId("")}>Cancel edit</button>}<button className="primary-button" disabled={busy}>{editingEventId ? "Save changes" : "Publish item"}</button></div></form>}
    <section className="panel exam-panel"><div className="panel-head"><div><p className="eyebrow">UPCOMING EXAMS</p><h2>Midterms and endterms</h2></div><span className="count-badge">{Object.values(examGroups).flat().length}</span></div>{Object.entries(examGroups).map(([label, items]) => <div className="exam-group" key={label}><h3>{label}</h3>{!items.length && <p className="helper">No exams.</p>}{items.map(row)}</div>)}</section>
    <div className="calendar-groups">{Object.entries(academicGroups).map(([label, items]) => <section className="panel task-panel" key={label}><div className="panel-head"><div><p className="eyebrow">{label.toUpperCase()}</p><h2>{label}</h2></div><span className="count-badge">{items.length}</span></div>{!items.length && <p className="helper">No academic items.</p>}{items.map(row)}</section>)}</div>
  </div>;
}
