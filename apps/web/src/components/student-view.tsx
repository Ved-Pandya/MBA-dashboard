"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { AcademicEventRecord, AssignmentRecord, GeneralPollRecord, PollResponseRecord, SessionIntimationRecord, SessionResponseRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { asDate, formatDeadline, relativeDeadline, urgency, indiaDayStart, isOpenAssignment } from "@/lib/date";
import { useClock } from "@/lib/use-clock";
import { callFunction, readableError } from "@/lib/callable";
import { AppIcon } from "./app-icon";

const labels = {
  subject_assignment: "Assignment",
  pre_read: "Pre-read",
  case_competition: "Case comp",
  administrative_form: "Form",
};

export function StudentView({ onNavigate }: { onNavigate: (view: "forms" | "academics" | "opportunities" | "sessions" | "polls" | "compliance") => void }) {
  const now = useClock();
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [sessions, setSessions] = useState<SessionIntimationRecord[]>([]);
  const [sessionResponses, setSessionResponses] = useState<SessionResponseRecord[]>([]);
  const [polls, setPolls] = useState<GeneralPollRecord[]>([]);
  const [pollResponses, setPollResponses] = useState<PollResponseRecord[]>([]);
  const [competitionResponses, setCompetitionResponses] = useState<Array<{ opportunityId: string; status: string; externalRegistration?: { status: string }; internalForm?: { status: string } }>>([]);
  const [activeCompetitions, setActiveCompetitions] = useState<Array<{ id: string; registrationDeadline: { toMillis(): number } }>>([]);
  const [academicEvents, setAcademicEvents] = useState<AcademicEventRecord[]>([]);
  const [search, setSearch] = useState("");
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(getFirebase().db, "taskAssignments"), where("uid", "==", user.uid)),
      (snap) => { setAssignments(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AssignmentRecord)); setAssignmentsLoading(false); },
      (snapshotError) => { setError(readableError(snapshotError)); setAssignmentsLoading(false); },
    );
  }, [user]);

  useEffect(() => {
    if (!user || !profile) return; const db = getFirebase().db;
    const unsubs = [
      onSnapshot(query(collection(db, "sessionIntimations"), where("status", "==", "published")), (snap) => setSessions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SessionIntimationRecord))),
      onSnapshot(query(collection(db, "sessionResponses"), where("uid", "==", user.uid)), (snap) => setSessionResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SessionResponseRecord))),
      onSnapshot(query(collection(db, "generalPolls"), where("status", "==", "published")), (snap) => setPolls(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as GeneralPollRecord))),
      onSnapshot(query(collection(db, "pollResponses"), where("uid", "==", user.uid)), (snap) => setPollResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PollResponseRecord))),
      onSnapshot(query(collection(db, "competitions"), where("status", "==", "published")), (snap) => setActiveCompetitions(snap.docs.map((doc) => ({ id: doc.id, registrationDeadline: doc.get("registrationDeadline") }))), (err) => setError(readableError(err))),
      onSnapshot(query(collection(db, "opportunityResponses"), where("uid", "==", user.uid)), (snap) => setCompetitionResponses(snap.docs.map((doc) => doc.data() as { opportunityId: string; status: string; externalRegistration?: { status: string }; internalForm?: { status: string } }))),
      onSnapshot(query(collection(db, "academicEvents"), where("sectionId", "==", profile.sectionId)), (snap) => setAcademicEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AcademicEventRecord))),
    ]; return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, profile]);

  const sorted = useMemo(() => assignments
    .filter((item) => filter === "all" || (filter === "active" ? isOpenAssignment(item) : item.status === "completed"))
    .sort((a, b) => {
      const ranks = { overdue: 0, urgent: 1, upcoming: 2, done: 3 };
      const delta = ranks[urgency(a.taskSnapshot.dueAt, a.status, now)] - ranks[urgency(b.taskSnapshot.dueAt, b.status, now)];
      return delta || asDate(a.taskSnapshot.dueAt).getTime() - asDate(b.taskSnapshot.dueAt).getTime();
    }), [assignments, filter, now]);

  const stats = useMemo(() => {
    const endToday = indiaDayStart(now).getTime() + 86_400_000;
    return {
      overdue: assignments.filter((a) => isOpenAssignment(a) && urgency(a.taskSnapshot.dueAt, a.status, now) === "overdue").length,
      today: assignments.filter((a) => isOpenAssignment(a) && asDate(a.taskSnapshot.dueAt).getTime() >= now && asDate(a.taskSnapshot.dueAt).getTime() < endToday).length,
      upcoming: assignments.filter((a) => isOpenAssignment(a) && urgency(a.taskSnapshot.dueAt, a.status, now) === "upcoming").length,
      complete: assignments.filter((a) => a.status === "completed").length,
    };
  }, [assignments, now]);

  const actionSummary = useMemo(() => {
    const sessionIds = new Set(sessions.filter((item) => item.responseDeadline.toMillis() > now).map((item) => item.id)); const pollIds = new Set(polls.filter((item) => item.closesAt.toMillis() > now).map((item) => item.id));
    const activeCompetitionIds = new Set(activeCompetitions.filter((item) => item.registrationDeadline.toMillis() > now).map((item) => item.id)); const unansweredSessions = sessionResponses.filter((item) => sessionIds.has(item.sessionId) && item.status === "no_response").length; const unansweredPolls = pollResponses.filter((item) => pollIds.has(item.pollId) && item.status === "no_response").length; const missingCompetitionConfirmations = competitionResponses.filter((item) => activeCompetitionIds.has(item.opportunityId) && (item.externalRegistration?.status !== "confirmed" || item.internalForm?.status !== "confirmed")).length;
    const nextExam = academicEvents.filter((item) => item.status === "published" && ["midterm", "endterm"].includes(item.eventType) && item.occursAt.toMillis() >= now).sort((a, b) => a.occursAt.toMillis() - b.occursAt.toMillis())[0]; return { unansweredSessions, unansweredPolls, missingCompetitionConfirmations, nextExam };
  }, [sessions, sessionResponses, polls, pollResponses, competitionResponses, activeCompetitions, academicEvents, now]);

  const sessionResponseById = useMemo(
    () => new Map(sessionResponses.map((response) => [response.sessionId, response])),
    [sessionResponses],
  );
  const pollResponseById = useMemo(
    () => new Map(pollResponses.map((response) => [response.pollId, response])),
    [pollResponses],
  );
  const openSessions = useMemo(() => {
    return sessions
      .filter((session) => session.status === "published" && session.responseDeadline.toMillis() > now)
      .sort((a, b) => {
        const aAnswered = Boolean(sessionResponseById.get(a.id) && sessionResponseById.get(a.id)?.status !== "no_response");
        const bAnswered = Boolean(sessionResponseById.get(b.id) && sessionResponseById.get(b.id)?.status !== "no_response");
        return Number(aAnswered) - Number(bAnswered) || a.responseDeadline.toMillis() - b.responseDeadline.toMillis();
      });
  }, [sessions, sessionResponseById, now]);
  const openPolls = useMemo(() => {
    return polls
      .filter((poll) => poll.status === "published" && poll.closesAt.toMillis() > now)
      .sort((a, b) => {
        const aAnswered = pollResponseById.get(a.id)?.status === "responded";
        const bAnswered = pollResponseById.get(b.id)?.status === "responded";
        return Number(aAnswered) - Number(bAnswered) || a.closesAt.toMillis() - b.closesAt.toMillis();
      });
  }, [polls, pollResponseById, now]);

  async function toggle(item: AssignmentRecord) {
    setBusy(`task:${item.id}`); setError(null);
    try {
      await callFunction(item.status === "completed" ? "reopenMyCompletion" : "setMyCompletion", { taskId: item.taskId, idempotencyKey: crypto.randomUUID() });
    } catch (toggleError) { setError(readableError(toggleError)); }
    finally { setBusy(null); }
  }

  async function setSessionAnswer(sessionId: string, status: "attending" | "not_attending") {
    setBusy(`session:${sessionId}`); setError(null);
    try {
      await callFunction("setSessionResponse", { sessionId, status });
    } catch (responseError) { setError(readableError(responseError)); }
    finally { setBusy(null); }
  }

  async function setPollAnswer(pollId: string, optionId: string) {
    setBusy(`poll:${pollId}`); setError(null);
    try {
      await callFunction("setPollResponse", { pollId, optionId });
    } catch (responseError) { setError(readableError(responseError)); }
    finally { setBusy(null); }
  }

  const pendingCount = assignments.filter(isOpenAssignment).length;
  const academicDates = academicEvents.filter((item) => item.status === "published" && item.occursAt.toMillis() >= now).sort((a, b) => a.occursAt.toMillis() - b.occursAt.toMillis()).slice(0, 4);
  const unansweredSessions = openSessions.filter((item) => sessionResponseById.get(item.id)?.status === "no_response" || !sessionResponseById.has(item.id));
  const answeredSessions = openSessions.filter((item) => { const response = sessionResponseById.get(item.id); return response && response.status !== "no_response"; });
  const unansweredPolls = openPolls.filter((item) => pollResponseById.get(item.id)?.status !== "responded");
  const answeredPolls = openPolls.filter((item) => pollResponseById.get(item.id)?.status === "responded");
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);
  const dateLabel = (value: AssignmentRecord["taskSnapshot"]["dueAt"]) => {
    const day = indiaDayStart(value.toMillis()).getTime(), today = indiaDayStart(now).getTime();
    return day < today ? "Past deadline" : day === today ? "Today" : day === today + 86_400_000 ? "Tomorrow" : new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(value.toDate());
  };
  const groups = new Map<string, AssignmentRecord[]>();
  sorted.filter((item) => !search || item.taskSnapshot.title.toLowerCase().includes(search.toLowerCase())).forEach((item) => {
    const label = item.taskSnapshot.taskStatus !== "published" ? "Closed & cancelled" : item.status === "completed" ? "Completed" : item.status === "exempt" ? "Exempt" : dateLabel(item.taskSnapshot.dueAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  });
  const sessionRow = (session: SessionIntimationRecord) => {
    const response = sessionResponseById.get(session.id), key = `session:${session.id}`;
    return <article className="reply-row" key={session.id}><div className="reply-meta"><AppIcon name="people" /><span>Placement session</span><time>{formatDeadline(session.responseDeadline)}</time></div><h3>{session.title}</h3><p>{formatDeadline(session.sessionStartsAt)}{session.venue ? ` · ${session.venue}` : ""}</p>{session.details && <p>{session.details}</p>}{response ? <div className="response-options" aria-label={`Attendance response for ${session.title}`}><button aria-pressed={response.status === "attending"} onClick={() => void setSessionAnswer(session.id, "attending")} disabled={busy === key}><AppIcon name="check" />Attending</button><button aria-pressed={response.status === "not_attending"} onClick={() => void setSessionAnswer(session.id, "not_attending")} disabled={busy === key}>Not attending</button></div> : <p role="status">Your response is being prepared. Refresh shortly.</p>}</article>;
  };
  const pollRow = (poll: GeneralPollRecord) => {
    const response = pollResponseById.get(poll.id), key = `poll:${poll.id}`;
    return <article className="reply-row" key={poll.id}><div className="reply-meta"><AppIcon name="poll" /><span>Batch poll</span><time>{formatDeadline(poll.closesAt)}</time></div><h3>{poll.question}</h3>{poll.details && <p>{poll.details}</p>}{response ? <div className="response-options" aria-label={`Answer ${poll.question}`}>{poll.options.map((option) => <button key={option.id} aria-pressed={response.optionId === option.id} onClick={() => void setPollAnswer(poll.id, option.id)} disabled={busy === key}>{response.optionId === option.id && <AppIcon name="check" />}{option.label}</button>)}</div> : <p role="status">Your response is being prepared. Refresh shortly.</p>}</article>;
  };
  const showManagement = Boolean(profile?.roles.cr || profile?.roles.systemAdmin || Object.keys(profile?.scopes.wingPocWings ?? {}).length || Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length);
  return <div className="page-wrap today-page">
    <header className="day-heading"><div><h1>Today<span className="heading-dot">.</span></h1><p>{date}</p></div><div className="day-note"><span>Hello, {profile?.displayName.split(" ")[0]}.</span><strong>{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "deadline" : "deadlines"} to keep in view.` : "Your deadlines are clear."}</strong></div></header>
    {showManagement && <nav className="responsibility-bar" aria-label="Your responsibilities"><span>Your workspace</span>{Boolean(Object.keys(profile?.scopes.wingPocWings ?? {}).length) && <button onClick={() => onNavigate("forms")}><AppIcon name="form" />Manage wing forms<AppIcon name="arrow" /></button>}{Boolean(Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length) && <button onClick={() => onNavigate("academics")}><AppIcon name="book" />Manage academic dates<AppIcon name="arrow" /></button>}<button onClick={() => onNavigate("compliance")}><AppIcon name="report" />Check responses<AppIcon name="arrow" /></button></nav>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="daybook-layout">
      <section className="deadline-desk" aria-label="Your deadlines"><div className="section-heading"><h2>Deadlines</h2><span>{stats.overdue > 0 ? <b className="overdue-text">{stats.overdue} overdue</b> : "Keep one step ahead"}</span></div>
        <div className="deadline-toolbar"><div className="segmented" aria-label="Deadline view">{([{ id: "active", label: "To do", count: pendingCount }, { id: "completed", label: "Completed", count: stats.complete }, { id: "all", label: "All activity" }] as const).map((item) => <button key={item.id} aria-label={item.label} aria-pressed={filter === item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}{"count" in item && <span>{item.count}</span>}</button>)}</div><label className="search-control"><AppIcon name="search" /><span className="sr-only">Find a deadline</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a deadline" /></label></div>
        {assignmentsLoading ? <p className="list-message" role="status">Loading your deadlines…</p> : !groups.size ? <div className="list-empty"><AppIcon name="check" /><h3>{search ? "No matching deadlines" : filter === "active" ? "Nothing left to do here." : "No activity yet."}</h3><p>{search ? "Try another title or clear your search." : "Academic dates, registrations and batch replies are in their own sections."}</p><button className="text-link" onClick={() => onNavigate("academics")}>Check academic dates<AppIcon name="arrow" /></button></div> : [...groups].map(([label, items]) => <div className="deadline-group" key={label}><h3 className="group-heading">{label}<span>{items.length}</span></h3><div className="task-list">{items.map((item) => {
          const open = item.taskSnapshot.taskStatus === "published", level = open ? urgency(item.taskSnapshot.dueAt, item.status, now) : "done";
          return <article className={`task-row ${level}`} key={item.id}><button className={`check ${item.status === "completed" ? "checked" : ""}`} onClick={() => void toggle(item)} disabled={!open || busy === `task:${item.id}` || item.status === "exempt"} aria-pressed={item.status === "completed"} aria-label={`${item.status === "completed" ? "Reopen" : "Mark complete:"} ${item.taskSnapshot.title}`}>{item.status === "completed" && <AppIcon name="check" />}</button><div className="task-main"><h3>{item.taskSnapshot.title}</h3><p>{labels[item.taskType]}<span>·</span>{item.scopeKey.startsWith("wing:") ? `Wing ${item.wingId}` : item.scopeKey.replace("subject:", "")}{item.status === "exempt" && <span>Exempt</span>}</p></div><div className="task-due"><strong className={level === "overdue" ? "overdue-text" : ""}>{open && item.status === "pending" ? relativeDeadline(item.taskSnapshot.dueAt, now) : !open ? item.taskSnapshot.taskStatus : item.status}</strong><time>{formatDeadline(item.taskSnapshot.dueAt)}</time></div>{item.taskSnapshot.resourceUrl && <a className="resource-link" href={item.taskSnapshot.resourceUrl} target="_blank" rel="noreferrer">Open form<AppIcon name="arrow" /></a>}</article>;
        })}</div></div>)}
        <p className="completion-note"><AppIcon name="check" />Tick a deadline after submitting it. You can reopen it if needed.</p>
      </section>
      <aside className="daybook-aside">
        <section className="reply-desk"><div className="section-heading"><h2>Needs your reply</h2><span>{unansweredSessions.length + unansweredPolls.length + actionSummary.missingCompetitionConfirmations}</span></div>{actionSummary.missingCompetitionConfirmations > 0 && <button className="registration-notice" onClick={() => onNavigate("opportunities")}><AppIcon name="briefcase" /><span><strong>Competition registrations</strong><small>{actionSummary.missingCompetitionConfirmations} need your confirmation</small></span><AppIcon name="arrow" /></button>}{unansweredSessions.map(sessionRow)}{unansweredPolls.map(pollRow)}{!unansweredSessions.length && !unansweredPolls.length && !actionSummary.missingCompetitionConfirmations && <p className="quiet-note">No replies needed right now.</p>}{Boolean(answeredSessions.length + answeredPolls.length) && <details className="recorded-replies"><summary>{answeredSessions.length + answeredPolls.length} replies recorded</summary>{answeredSessions.map(sessionRow)}{answeredPolls.map(pollRow)}</details>}<div className="section-footer"><button className="text-link" onClick={() => onNavigate("sessions")}>Sessions</button><button className="text-link" onClick={() => onNavigate("polls")}>All polls<AppIcon name="arrow" /></button></div></section>
        <section className="academic-desk"><div className="section-heading"><h2>Academic dates</h2><AppIcon name="book" /></div>{academicDates.length ? academicDates.map((item) => <button className="agenda-row" key={item.id} onClick={() => onNavigate("academics")}><div className="agenda-date"><strong>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }).format(item.occursAt.toDate())}</strong><span>{new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(item.occursAt.toDate())}</span></div><div><strong>{item.title}</strong><small>{item.eventType.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(item.occursAt.toDate())}</small></div></button>) : <p className="quiet-note">No upcoming dates in your section.</p>}<div className="section-footer"><button className="text-link" onClick={() => onNavigate("academics")}>Open academics<AppIcon name="arrow" /></button></div></section>
      </aside>
    </div>
  </div>;
}
