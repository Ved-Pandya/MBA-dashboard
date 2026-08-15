"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { CompetitionRecord, CompetitionTeamRecord, InternshipRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { useAuth } from "./auth-provider";

type ResponseRecord = { id: string; opportunityId?: string; internshipId?: string; status: string; registeredLate?: boolean };
type RoundRecord = { id: string; competitionId: string; name: string; status: string; submissionDeadline: { toDate(): Date } };
type RoundEntry = { id: string; roundId: string; teamId: string; submissionStatus: string; status: string };
const indiaIso = (value: string) => new Date(`${value}:00+05:30`).toISOString();
const indiaLocalInput = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);

export function OpportunitiesView({ mode = "all" }: { mode?: "all" | "teams" }) {
  const { user, profile } = useAuth();
  const manager = Boolean(profile?.roles.systemAdmin || profile?.roles.cr);
  const teamsOnly = mode === "teams";
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [internships, setInternships] = useState<InternshipRecord[]>([]);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [internshipResponses, setInternshipResponses] = useState<ResponseRecord[]>([]);
  const [teams, setTeams] = useState<CompetitionTeamRecord[]>([]);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [entries, setEntries] = useState<RoundEntry[]>([]);
  const [competition, setCompetition] = useState({ title: "", organizer: "", description: "", registrationUrl: "", registrationDeadline: "", minTeamSize: 2, maxTeamSize: 4 });
  const [internship, setInternship] = useState({ company: "", role: "", description: "", registrationUrl: "", registrationDeadline: "" });
  const [editingCompetitionId, setEditingCompetitionId] = useState("");
  const [editingInternshipId, setEditingInternshipId] = useState("");
  const [team, setTeam] = useState({ competitionId: "", name: "", memberRollNumbers: "" });
  const [round, setRound] = useState({ competitionId: "", name: "", instructions: "", submissionDeadline: "", eligibleTeamIds: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !profile) return;
    const db = getFirebase().db;
    const competitionQuery = manager ? collection(db, "competitions") : query(collection(db, "competitions"), where("status", "in", ["published", "in_progress", "completed"]));
    const internshipQuery = manager ? collection(db, "internships") : query(collection(db, "internships"), where("status", "in", ["published", "completed"]));
    const teamQuery = manager ? collection(db, "competitionTeams") : query(collection(db, "competitionTeams"), where("memberUids", "array-contains", user.uid));
    const entryQuery = manager ? collection(db, "competitionRoundEntries") : query(collection(db, "competitionRoundEntries"), where("memberUids", "array-contains", user.uid));
    const unsubscribers = [
      onSnapshot(competitionQuery, (snap) => setCompetitions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CompetitionRecord)), (err) => setError(readableError(err))),
      onSnapshot(internshipQuery, (snap) => setInternships(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as InternshipRecord)), (err) => setError(readableError(err))),
      onSnapshot(query(collection(db, "opportunityResponses"), where("uid", "==", user.uid)), (snap) => setResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ResponseRecord))),
      onSnapshot(query(collection(db, "internshipResponses"), where("uid", "==", user.uid)), (snap) => setInternshipResponses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ResponseRecord))),
      onSnapshot(teamQuery, (snap) => setTeams(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CompetitionTeamRecord))),
      onSnapshot(query(collection(db, "competitionRounds"), where("status", "in", ["open", "finalized"])), (snap) => setRounds(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RoundRecord))),
      onSnapshot(entryQuery, (snap) => setEntries(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RoundEntry))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, profile, manager]);

  const responseByCompetition = useMemo(() => new Map(responses.map((item) => [item.opportunityId, item])), [responses]);
  const responseByInternship = useMemo(() => new Map(internshipResponses.map((item) => [item.internshipId, item])), [internshipResponses]);

  async function run(name: string, payload: unknown, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await callFunction(name, payload); setMessage(success); }
    catch (actionError) { setError(readableError(actionError)); }
    finally { setBusy(false); }
  }

  async function createCompetition(event: FormEvent) {
    event.preventDefault();
    await run(editingCompetitionId ? "updateCompetition" : "createCompetition", { ...competition, ...(editingCompetitionId ? { competitionId: editingCompetitionId } : {}), registrationDeadlineIso: indiaIso(competition.registrationDeadline) }, editingCompetitionId ? "Competition updated and affected students notified." : "Competition draft created. Publish it from the list when ready.");
    setCompetition((current) => ({ ...current, title: "", organizer: "", description: "", registrationUrl: "" }));
    setEditingCompetitionId("");
  }
  async function createInternship(event: FormEvent) {
    event.preventDefault();
    await run(editingInternshipId ? "updateInternship" : "createInternship", { ...internship, ...(editingInternshipId ? { internshipId: editingInternshipId } : {}), registrationDeadlineIso: indiaIso(internship.registrationDeadline) }, editingInternshipId ? "Internship updated and affected students notified." : "Internship draft created.");
    setInternship((current) => ({ ...current, company: "", role: "", description: "", registrationUrl: "" }));
    setEditingInternshipId("");
  }

  function editCompetition(item: CompetitionRecord) {
    setEditingCompetitionId(item.id);
    setCompetition({ title: item.title, organizer: item.organizer, description: item.description, registrationUrl: item.registrationUrl ?? "", registrationDeadline: indiaLocalInput(item.registrationDeadline.toDate()), minTeamSize: item.minTeamSize, maxTeamSize: item.maxTeamSize });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editInternship(item: InternshipRecord) {
    setEditingInternshipId(item.id);
    setInternship({ company: item.company, role: item.role, description: item.description, registrationUrl: item.registrationUrl ?? "", registrationDeadline: indiaLocalInput(item.registrationDeadline.toDate()) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function createTeam(event: FormEvent) {
    event.preventDefault();
    const rolls = team.memberRollNumbers.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean);
    if (profile && !rolls.includes(profile.rollNumber)) rolls.unshift(profile.rollNumber);
    await run("createTeam", { competitionId: team.competitionId, name: team.name, memberRollNumbers: rolls }, "Team draft created and all members reserved.");
    setTeam((current) => ({ ...current, name: "", memberRollNumbers: "" }));
  }
  async function createRound(event: FormEvent) {
    event.preventDefault();
    await run("createNextRound", { competitionId: round.competitionId, name: round.name, instructions: round.instructions, submissionDeadlineIso: indiaIso(round.submissionDeadline), eligibleTeamIds: round.eligibleTeamIds.split(/[\s,;]+/).filter(Boolean) }, "Round opened and eligible teams notified.");
  }

  return <div className="page-wrap">
    <header className="page-heading"><div><p className="eyebrow">OPPORTUNITIES</p><h1>Registrations, teams, and rounds</h1><p>Every opportunity has an explicit response and every team submission has one authoritative status.</p></div></header>
    {message && <div className="success-banner">{message}</div>}{error && <p className="form-error">{error}</p>}

    {manager && !teamsOnly && <div className="admin-grid">
      <form className="panel create-form" onSubmit={createCompetition}><div className="panel-head"><div><p className="eyebrow">CASE COMPETITION</p><h2>Create opportunity</h2></div></div>
        <label>Edit existing<select value={editingCompetitionId} onChange={(event) => { const item = competitions.find((candidate) => candidate.id === event.target.value); if (item) editCompetition(item); else setEditingCompetitionId(""); }}><option value="">Create a new competition</option>{competitions.filter((item) => ["draft", "published"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Title<input value={competition.title} onChange={(event) => setCompetition({ ...competition, title: event.target.value })} required /></label><label>Organizer<input value={competition.organizer} onChange={(event) => setCompetition({ ...competition, organizer: event.target.value })} required /></label><label>Details<textarea value={competition.description} onChange={(event) => setCompetition({ ...competition, description: event.target.value })} required /></label>
        <div className="form-row"><label>Min team size<input type="number" min="1" value={competition.minTeamSize} onChange={(event) => setCompetition({ ...competition, minTeamSize: Number(event.target.value) })} /></label><label>Max team size<input type="number" min="1" value={competition.maxTeamSize} onChange={(event) => setCompetition({ ...competition, maxTeamSize: Number(event.target.value) })} /></label></div>
        <label>Registration deadline · IST<input type="datetime-local" value={competition.registrationDeadline} onChange={(event) => setCompetition({ ...competition, registrationDeadline: event.target.value })} required /></label><label>Registration link<input type="url" value={competition.registrationUrl} onChange={(event) => setCompetition({ ...competition, registrationUrl: event.target.value })} /></label><button className="primary-button" disabled={busy}>{editingCompetitionId ? "Save competition changes" : "Create draft"}</button>
      </form>
      <form className="panel create-form" onSubmit={createInternship}><div className="panel-head"><div><p className="eyebrow">INTERNSHIP</p><h2>Create opportunity</h2></div></div>
        <label>Edit existing<select value={editingInternshipId} onChange={(event) => { const item = internships.find((candidate) => candidate.id === event.target.value); if (item) editInternship(item); else setEditingInternshipId(""); }}><option value="">Create a new internship</option>{internships.filter((item) => ["draft", "published"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.company} · {item.role}</option>)}</select></label>
        <div className="form-row"><label>Company<input value={internship.company} onChange={(event) => setInternship({ ...internship, company: event.target.value })} required /></label><label>Role<input value={internship.role} onChange={(event) => setInternship({ ...internship, role: event.target.value })} required /></label></div><label>Details<textarea value={internship.description} onChange={(event) => setInternship({ ...internship, description: event.target.value })} required /></label><label>Registration deadline · IST<input type="datetime-local" value={internship.registrationDeadline} onChange={(event) => setInternship({ ...internship, registrationDeadline: event.target.value })} required /></label><label>Registration link<input type="url" value={internship.registrationUrl} onChange={(event) => setInternship({ ...internship, registrationUrl: event.target.value })} /></label><button className="primary-button" disabled={busy}>{editingInternshipId ? "Save internship changes" : "Create draft"}</button>
      </form>
    </div>}

    {!teamsOnly && <div className="opportunity-grid">
      <section className="panel managed-list"><div className="panel-head"><div><p className="eyebrow">CASE COMPETITIONS</p><h2>Registration tracker</h2></div><span className="count-badge">{competitions.length}</span></div>
        {competitions.map((item) => { const response = responseByCompetition.get(item.id); return <article className="opportunity-card" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{item.organizer} · Registration {formatDeadline(item.registrationDeadline)}</p><small>Teams: {item.minTeamSize}–{item.maxTeamSize} members</small></div><div className="opportunity-actions">{item.registrationUrl && <a className="resource-link" href={item.registrationUrl} target="_blank" rel="noreferrer">Registration site</a>}{item.status === "published" && response?.status === "no_response" && <button className="secondary-button" onClick={() => run("setCompetitionResponse", { opportunityId: item.id, status: "not_participating" }, "Response recorded.")} disabled={busy}>Not participating</button>}{manager && item.status === "draft" && <button className="primary-button" onClick={() => run("publishCompetition", { competitionId: item.id }, "Competition published to the batch.")} disabled={busy}>Publish</button>}{manager && ["draft", "published"].includes(item.status) && <button className="danger-link text-button" onClick={() => { const reason = window.prompt("Reason for cancelling this competition"); if (reason) void run("cancelCompetition", { competitionId: item.id, reason }, "Competition cancelled and students notified."); }} disabled={busy}>Cancel</button>}<span className="helper">My status: {response?.status?.replaceAll("_", " ") ?? "manager"}</span></div></article>; })}
      </section>
      <section className="panel managed-list"><div className="panel-head"><div><p className="eyebrow">INTERNSHIPS</p><h2>Registration tracker</h2></div><span className="count-badge">{internships.length}</span></div>
        {internships.map((item) => { const response = responseByInternship.get(item.id); return <article className="opportunity-card" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.company} · {item.role}</h3><p>Registration {formatDeadline(item.registrationDeadline)}</p></div><div className="opportunity-actions">{item.registrationUrl && <a className="resource-link" href={item.registrationUrl} target="_blank" rel="noreferrer">Open form</a>}{item.status === "published" && <><button className="primary-button" onClick={() => run("setInternshipResponse", { internshipId: item.id, status: "registered", confirmationReference: "self-attested" }, "Registration recorded.")} disabled={busy}>I registered</button><button className="secondary-button" onClick={() => run("setInternshipResponse", { internshipId: item.id, status: "not_participating" }, "Response recorded.")} disabled={busy}>Not participating</button></>}{manager && item.status === "draft" && <button className="primary-button" onClick={() => run("publishInternship", { internshipId: item.id }, "Internship published to the batch.")} disabled={busy}>Publish</button>}{manager && ["draft", "published"].includes(item.status) && <button className="danger-link text-button" onClick={() => { const reason = window.prompt("Reason for cancelling this internship"); if (reason) void run("cancelInternship", { internshipId: item.id, reason }, "Internship cancelled and students notified."); }} disabled={busy}>Cancel</button>}<span className="helper">My status: {response?.status?.replaceAll("_", " ") ?? "manager"}{response?.registeredLate ? " · late" : ""}</span></div></article>; })}
      </section>
    </div>}

    <div className="two-column opportunities-lower">
      <form className="panel create-form" onSubmit={createTeam}><div className="panel-head"><div><p className="eyebrow">MY TEAMS</p><h2>Create team draft</h2></div></div><label>Competition<select value={team.competitionId} onChange={(event) => setTeam({ ...team, competitionId: event.target.value })}><option value="">Choose competition</option>{competitions.filter((item) => item.status === "published").map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Team name<input value={team.name} onChange={(event) => setTeam({ ...team, name: event.target.value })} required /></label><label>Member roll numbers<textarea value={team.memberRollNumbers} onChange={(event) => setTeam({ ...team, memberRollNumbers: event.target.value })} placeholder="24M2002, 24M2003" rows={3} /></label><small>You are added automatically. Draft membership immediately reserves every member for this competition.</small><button className="primary-button" disabled={busy || !team.competitionId}>Create team</button></form>
      <section className="panel managed-list"><div className="panel-head"><div><p className="eyebrow">TEAM STATUS</p><h2>{manager ? "Batch competition teams" : "My competition teams"}</h2></div><span className="count-badge">{teams.length}</span></div>{teams.map((item) => <article className="managed-task" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.name}</h3><p>{item.members.map((member) => member.rollNumber).join(", ")}</p><small>Team ID: {item.id}</small></div><div className="managed-actions">{item.captainUid === user?.uid && item.status === "draft" && <><button onClick={() => run("registerTeam", { teamId: item.id }, "Team registered and membership locked.")} disabled={busy}>Register team</button><button className="danger-link" onClick={() => run("deleteDraftTeam", { teamId: item.id }, "Draft team deleted.")} disabled={busy}>Delete draft</button></>}{item.captainUid !== user?.uid && item.memberUids.includes(user?.uid ?? "") && <button className="danger-link" onClick={() => { const reason = window.prompt("Describe why this membership is incorrect"); if (reason) void run("reportTeamMembership", { teamId: item.id, reason }, "Membership issue reported to the CRs and admin."); }} disabled={busy}>Report incorrect membership</button>}{entries.filter((entry) => entry.teamId === item.id && entry.submissionStatus === "pending").map((entry) => { const activeRound = rounds.find((roundItem) => roundItem.id === entry.roundId); return item.captainUid === user?.uid && activeRound ? <button key={entry.id} onClick={() => run("markRoundSubmitted", { roundId: entry.roundId, teamId: item.id, confirmationReference: "self-attested" }, "Team submission recorded.")} disabled={busy}>Mark {activeRound.name} submitted</button> : null; })}</div></article>)}</section>
    </div>

    {manager && <form className="panel create-form round-editor" onSubmit={createRound}><div className="panel-head"><div><p className="eyebrow">ADVANCEMENT</p><h2>Open next competition round</h2></div></div><div className="form-row"><label>Competition<select value={round.competitionId} onChange={(event) => setRound({ ...round, competitionId: event.target.value })}><option value="">Choose competition</option>{competitions.filter((item) => item.status === "published" || item.status === "in_progress").map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Round name<input value={round.name} onChange={(event) => setRound({ ...round, name: event.target.value })} placeholder="Round 1 / National Final" /></label></div><label>Instructions<textarea value={round.instructions} onChange={(event) => setRound({ ...round, instructions: event.target.value })} /></label><div className="form-row"><label>Submission deadline · IST<input type="datetime-local" value={round.submissionDeadline} onChange={(event) => setRound({ ...round, submissionDeadline: event.target.value })} /></label><label>Eligible team IDs<input value={round.eligibleTeamIds} onChange={(event) => setRound({ ...round, eligibleTeamIds: event.target.value })} placeholder="teamId1, teamId2" /></label></div><p className="helper">Registered teams: {teams.filter((item) => item.competitionId === round.competitionId && item.status === "registered").map((item) => `${item.name} (${item.id})`).join(" · ") || "Select a competition"}</p><small>Opening the next round finalizes the current round: selected teams advance and all others are eliminated.</small><div className="form-actions"><button className="primary-button" disabled={busy || !round.competitionId}>Open round</button></div><div className="managed-list">{rounds.filter((item) => item.competitionId === round.competitionId && item.status === "open").map((item) => <article className="managed-task" key={item.id}><div><h3>{item.name}</h3><p>Current open round</p></div><button type="button" className="secondary-button" onClick={() => { const ids = window.prompt("Final round: enter advancing/winning team IDs separated by commas"); if (ids !== null) void run("finalizeRound", { roundId: item.id, advancingTeamIds: ids.split(/[\s,;]+/).filter(Boolean), reason: "Finalized from competition dashboard" }, "Round finalized."); }}>Finalize round</button></article>)}</div></form>}
  </div>;
}
