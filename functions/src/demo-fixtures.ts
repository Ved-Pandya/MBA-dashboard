import { DEMO_SEED_ID, buildReminderSchedule, type DemoAccountKey } from "@mba/domain";
import { Timestamp } from "firebase-admin/firestore";

export type DemoIdentity = { uid: string; key: DemoAccountKey; role: string; displayName: string; rollNumber: string; sectionId: string; wingId: string };
export type DemoRecord = { path: string; data: Record<string, unknown> };
export const DEMO_OFFERING_IDS = ["DEMO-FIN-A", "DEMO-MKT-A", "DEMO-OPS-A", "DEMO-STR-A", "DEMO-FIN-B", "DEMO-OPS-B"];
export const DEMO_REPORT_STUDENTS = 110;

/** All fixture values are relative to injection time; no credentials enter the plan. */
export function buildDemoFixtures(users: DemoIdentity[], ownerUid: string, origin: string, now: number) {
  const records: DemoRecord[] = [];
  const stamp = Timestamp.fromMillis(now), at = (hours: number) => Timestamp.fromMillis(now + hours * 3_600_000);
  const poc = users.find((u) => u.key === "poc")!, cr = users.find((u) => u.key === "cr")!, wing = users.find((u) => u.key === "wing")!;
  const put = (path: string, data: Record<string, unknown>) => records.push({ path, data: { ...data, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: stamp, updatedAt: stamp } });
  const form = (kind: string, title: string, status = "published") => `${origin}/demo/sample-form.html?${new URLSearchParams({ kind, title, status })}`;
  const snapshot = (u: DemoIdentity) => ({ displayName: u.displayName, rollNumber: u.rollNumber, sectionId: u.sectionId, wingId: u.wingId });
  const counts: Record<string, number> = { signInAccounts: users.length, reportOnlyStudents: DEMO_REPORT_STUDENTS, subjects: 6, timetableSlots: 6, academicEvents: 9, wingForms: 8, competitions: 4, internships: 4, sessions: 3, polls: 4, crTasks: 3 };
  const reminder = (id: string, title: string, hours: number, extra: Record<string, unknown> = {}) => {
    for (const item of buildReminderSchedule(at(hours).toDate(), new Date(now))) {
      if (extra.kind === "session_response" && item.stage === "overdue15m") continue;
      put(`reminderJobs/${id}_v1_${item.stage}`, { ...extra, ...(!extra.kind ? { taskId: id } : {}), title, scheduleVersion: 1, stage: item.stage, fireAt: Timestamp.fromDate(item.fireAt), status: "scheduled", attempts: 0 });
    }
  };

  put("academicTerms/DEMO-TERM", { name: "Demo MBA Term", active: true, startDate: at(-168).toDate().toISOString().slice(0, 10), endDate: at(2160).toDate().toISOString().slice(0, 10) });
  const subjectNames = ["Financial Management", "Marketing Management", "Operations Management", "Business Strategy", "Financial Management", "Operations Management"];
  DEMO_OFFERING_IDS.forEach((id, i) => {
    put(`subjectOfferings/${id}`, { subjectCode: id.split("-")[1], subjectName: subjectNames[i], sectionId: id.endsWith("B") ? "B" : "A", termId: "DEMO-TERM", active: true });
    put(`timetableSlots/demo_slot_${i}`, { offeringId: id, termId: "DEMO-TERM", sectionId: id.endsWith("B") ? "B" : "A", weekday: i % 5 + 1, startTime: `${String(9 + i % 3).padStart(2, "0")}:00`, endTime: `${String(10 + i % 3).padStart(2, "0")}:00`, room: `Demo room ${101 + i}`, active: true, source: "demo_seed" });
    put(`pocAssignments/subject_${id}`, { kind: "subject", scopeId: id, uid: poc.uid, seat: 1, active: true, assignedBy: ownerUid, assignedAt: stamp });
  });
  put("pocAssignments/subject_DEMO-FIN-A_2", { kind: "subject", scopeId: "DEMO-FIN-A", uid: wing.uid, seat: 2, active: true, assignedBy: ownerUid, assignedAt: stamp });

  const events: Array<[string, string, string, string, number, string]> = [
    ["demo_preread_fin", "DEMO-FIN-A", "pre_read", "Demo time value of money pre-read", 18, "Read the fictional handout before class."],
    ["demo_assignment_mkt", "DEMO-MKT-A", "assignment_deadline", "Demo brand positioning memo", 30, "Prepare a two-page positioning memo for the sample brand."],
    ["demo_quiz_ops", "DEMO-OPS-A", "quiz", "Demo process analysis quiz", 54, "Capacity, bottlenecks and cycle time."],
    ["demo_midterm_strategy", "DEMO-STR-A", "midterm", "Demo strategy midterm", 168, "Modules 1 to 4. Closed book."],
    ["demo_endterm_fin", "DEMO-FIN-A", "endterm", "Demo finance endterm", 336, "All units, calculator permitted."],
    ["demo_preread_b", "DEMO-FIN-B", "pre_read", "Demo Section B finance pre-read", 20, "A separate section's calendar item."],
    ["demo_quiz_b", "DEMO-OPS-B", "quiz", "Demo Section B operations quiz", 72, "Demonstrates section-scoped academic dates."],
    ["demo_previous_class", "DEMO-OPS-A", "assignment_deadline", "Demo previous operations brief", -24, "A historical date for the past-events view."],
    ["demo_cancelled_exam", "DEMO-STR-A", "midterm", "Demo cancelled strategy quiz", 96, "Cancelled demonstration item."],
  ];
  events.forEach(([id, offeringId, eventType, title, hours, details]) => put(`academicEvents/${id}`, { offeringId, sectionId: offeringId.endsWith("B") ? "B" : "A", termId: "DEMO-TERM", eventType, title, details, occursAt: at(hours), endsAt: at(hours + 2), resourceUrl: form(id, title, id === "demo_cancelled_exam" ? "cancelled" : "published"), venue: "Demo classroom 101", syllabus: "Illustrative course units only", status: id === "demo_cancelled_exam" ? "cancelled" : "published", version: 1, ownerUid: poc.uid }));

  const observers: DemoIdentity[] = Array.from({ length: DEMO_REPORT_STUDENTS }, (_, i) => ({ uid: `demo_report_student_${String(i + 1).padStart(3, "0")}`, key: "student", role: "Report-only sample", rollNumber: `DEMO${String(i + 1).padStart(3, "0")}`, displayName: `Sample report student ${String(i + 1).padStart(3, "0")}`, sectionId: "A", wingId: "A" }));
  observers.forEach((u) => put(`users/${u.uid}`, { ...snapshot(u), authEmail: `report-${u.uid}@example.invalid`, status: "invited", roles: { student: true, cr: false, systemAdmin: false }, scopes: { crSections: {}, wingPocWings: {}, subjectPocOfferings: {}, batchPocRoles: {} }, isDemoRoster: true, isTestAccount: true }));
  const taskSpecs: Array<[string, string, number, string, string]> = [
    ["demo_wing_form", "Demo placement preference form", 6, "published", "A"],
    ["demo_overdue_form", "Demo overdue library access form", -3, "published", "A"],
    ["demo_completed_form", "Demo completed student directory form", 24, "published", "A"],
    ["demo_closed_form", "Demo closed hostel confirmation", -24, "closed", "A"],
    ["demo_cancelled_form", "Demo cancelled travel survey", 30, "cancelled", "A"],
    ["demo_draft_form", "Demo workshop interest draft", 48, "draft", "A"],
    ["demo_directory_audit", "Demo directory audit", 50, "published", "A"],
    ["demo_reminder_check", "Demo reminder check", 2 + 2 / 60, "published", "A"],
    ["demo_section_b_form", "Demo Section B transport form", 32, "published", "B"],
  ];
  counts.wingForms = taskSpecs.length;
  taskSpecs.forEach(([id, title, hours, status, targetWing]) => {
    put(`tasks/${id}`, { title, description: id === "demo_reminder_check" ? "Keep this item pending. Its two-hour reminder becomes due about two minutes after sample injection; actual arrival depends on maintenance and device setup." : "Fictional sample form. Use the linked practice page, then record completion in DeadlineOS.", taskType: "administrative_form", status, target: { kind: "wing", wingId: targetWing, scopeKey: `wing:${targetWing}` }, dueAt: at(hours), dueTimezone: "Asia/Kolkata", resourceUrl: form(id, title, status), ownerUid: targetWing === "A" ? wing.uid : ownerUid, version: 1, audienceVersion: status === "draft" ? 0 : 1, scheduleVersion: 1, audienceSyncStatus: status === "draft" ? "not_started" : "ready", publishedAt: status === "draft" ? null : stamp });
    if (status === "draft") return;
    const recipients = [...users.filter((u) => u.wingId === targetWing), ...(id === "demo_directory_audit" ? observers : [])];
    const totals = { pending: 0, completed: 0, exempt: 0 };
    recipients.forEach((u, i) => {
      const state = id === "demo_completed_form" && u.key === "student" ? "completed" : id === "demo_directory_audit" ? (i % 5 === 0 ? "completed" : i % 11 === 0 ? "exempt" : "pending") : id === "demo_wing_form" && u.key === "poc" ? "completed" : id === "demo_wing_form" && u.key === "cr" || id === "demo_section_b_form" && u.key === "studentB" ? "exempt" : "pending";
      totals[state]++;
      put(`taskAssignments/${id}_${u.uid}`, { taskId: id, uid: u.uid, taskType: "administrative_form", scopeKey: `wing:${targetWing}`, sectionId: u.sectionId, wingId: targetWing, subjectOfferingId: null, status: state, ...(state === "completed" ? { completedAt: at(-1), completedBy: u.uid, completionMethod: "self", completedLate: hours < -1 } : {}), ...(state === "exempt" ? { exemptionReason: "Demo accessibility exemption" } : {}), taskSnapshot: { title, dueAt: at(hours), resourceUrl: form(id, title, status), taskStatus: status }, studentSnapshot: snapshot(u), taskVersion: 1, audienceVersion: 1 });
    });
    put(`taskStats/${id}`, { eligibleCount: recipients.length, pendingCount: totals.pending, completedCount: totals.completed, exemptCount: totals.exempt, reconciledAt: stamp });
    if (status === "published") reminder(id, title, hours);
  });

  const competitions: Array<[string, string, string, number]> = [
    ["demo_case_open", "Demo Product Innovation Sprint", "published", 26],
    ["demo_case_partial", "Demo Social Impact Challenge", "published", 48],
    ["demo_case_registered", "Demo National Strategy Challenge", "published", 72],
    ["demo_case_draft", "Demo Market Entry Challenge draft", "draft", 96],
  ];
  competitions.forEach(([id, title, status, hours]) => {
    put(`competitions/${id}`, { title, organizer: "Demo Consulting Club", description: "Fictional opportunity for demonstrating individual external and internal form confirmations.", externalRegistrationUrl: form(`${id}_external`, `${title} external registration`, status), internalFormUrl: form(`${id}_internal`, `${title} internal confirmation`, status), registrationDeadline: at(hours), minTeamSize: 1, maxTeamSize: 1, status, ownerUid: ownerUid, version: 1, scheduleVersion: 1, publishedAt: status === "draft" ? null : stamp });
    if (status === "draft") return;
    const stats = { no_response: 0, team_draft: 0, registered: 0, not_participating: 0 };
    users.forEach((u, i) => {
      const done = id === "demo_case_registered" || i === 1;
      const partial = id === "demo_case_partial" && u.key === "student";
      const responseStatus = done ? "registered" : "no_response";
      stats[responseStatus]++;
      put(`opportunityResponses/${id}_${u.uid}`, { opportunityId: id, uid: u.uid, sectionId: u.sectionId, wingId: u.wingId, status: responseStatus, participationStatus: responseStatus, confirmationStatus: done ? "completed" : partial ? "partial" : "not_started", externalRegistration: { status: done || partial ? "confirmed" : "pending" }, internalForm: { status: done ? "confirmed" : "pending" }, confirmationsLocked: false, registeredLate: false, studentSnapshot: snapshot(u) });
    });
    put(`competitionStats/${id}`, { ...stats, responseCount: users.length, draftTeamCount: 0, registeredTeamCount: 0, reconciledAt: stamp });
    reminder(id, title, hours, { kind: "competition_registration", opportunityId: id });
  });

  const internships: Array<[string, string, string, number]> = [["demo_internship", "DemoCorp", "published", 27], ["demo_internship_analytics", "Sample Analytics", "published", 53], ["demo_internship_draft", "Practice Labs", "draft", 80], ["demo_internship_cancelled", "Fictional Ventures", "cancelled", 15]];
  internships.forEach(([id, company, status, hours]) => {
    put(`internships/${id}`, { title: `${company} ${id.includes("analytics") ? "Business Analyst Intern" : "Strategy Intern"}`, company, role: id.includes("analytics") ? "Business analyst intern" : "Strategy intern", description: "Fictional registration used for the presentation. The practice form never sends data.", registrationUrl: form(id, `${company} internship`, status), registrationDeadline: at(hours), status, ownerUid, version: 1, scheduleVersion: 1, publishedAt: status === "draft" ? null : stamp });
    if (status !== "published") return;
    const states = { no_response: 0, registered: 0, not_participating: 0 };
    users.forEach((u) => {
      const response = { internshipId: id, uid: u.uid, sectionId: u.sectionId, wingId: u.wingId, status: u.key === "poc" ? "registered" : u.key === "cr" ? "not_participating" : "no_response", registeredLate: false, studentSnapshot: snapshot(u) };
      if (u.key === "placed") { put(`placementResponseHistory/${id}_${u.uid}`, { uid: u.uid, internshipId: id, responseData: { ...response, status: "registered", isTestData: true, demoSeedId: DEMO_SEED_ID }, archivedAt: stamp, archivedBy: ownerUid, archivedReason: "Demo placement eligibility" }); return; }
      states[response.status as keyof typeof states]++;
      put(`internshipResponses/${id}_${u.uid}`, response);
    });
    put(`internshipStats/${id}`, { ...states, eligibleCount: users.length - 1, responseCount: users.length - 1, notApplicablePlaced: 0, lateRegistered: 0, reconciledAt: stamp });
    reminder(id, company, hours, { kind: "internship_registration", opportunityId: id });
  });
  users.forEach((u) => put(`placementStatuses/${u.uid}`, { uid: u.uid, status: u.key === "placed" ? "placed" : "seeking", company: u.key === "placed" ? "Fictional Consulting" : null, reason: "Seeded demonstration state", updatedBy: ownerUid }));

  ([['demo_placement_session','Demo consulting interview clinic','published',5,8],['demo_session_closed','Demo previous resume workshop','closed',-24,-20],['demo_session_draft','Demo alumni panel draft','draft',48,50]] as const).forEach(([id,title,status,deadline,start])=>{
    put(`sessionIntimations/${id}`, { title, details:"Bring a fictional resume. This sample session is linked to the open preference poll.", venue:"Demo auditorium", responseDeadline:at(deadline), sessionStartsAt:at(start), status, audience:{kind:"batch"}, ownerUid:cr.uid, version:1, scheduleVersion:1, publishedAt:status==='draft'?null:stamp });
    if(status==='draft')return;
    const totals={noResponseCount:0,attendingCount:0,notAttendingCount:0};
    users.forEach((u)=>{const state=u.key==='poc'||u.key==='wing'?'attending':u.key==='cr'?'not_attending':'no_response';totals[state==='attending'?'attendingCount':state==='not_attending'?'notAttendingCount':'noResponseCount']++;put(`sessionResponses/${id}_${u.uid}`,{sessionId:id,uid:u.uid,status:state,studentSnapshot:snapshot(u),...(state!=='no_response'?{respondedAt:stamp}:{})});});
    put(`sessionStats/${id}`,{eligibleCount:users.length,...totals});if(status==='published')reminder(id,title,deadline,{kind:'session_response',sessionId:id});
  });
  ([['demo_poll_open','Demo which clinic slot works best','published',5],['demo_poll_answered','Demo choose a workshop topic','published',28],['demo_poll_closed','Demo previous campus lunch poll','closed',-4],['demo_poll_draft','Demo alumni questions draft','draft',52]] as const).forEach(([id,question,status,hours])=>{
    const options = {
      demo_poll_open: [{id:'after_class',label:'After class'},{id:'evening',label:'Evening'},{id:'weekend',label:'Weekend'}],
      demo_poll_answered: [{id:'case_practice',label:'Case interview practice'},{id:'financial_modelling',label:'Financial modelling'},{id:'data_storytelling',label:'Data storytelling'}],
      demo_poll_closed: [{id:'vegetarian',label:'Vegetarian thali'},{id:'non_vegetarian',label:'Chicken rice bowl'},{id:'light_lunch',label:'Salad and sandwich'}],
      demo_poll_draft: [{id:'career_transition',label:'Changing career tracks'},{id:'recruitment',label:'Preparing for recruitment'},{id:'first_year',label:'The first year after an MBA'}],
    }[id];
    put(`generalPolls/${id}`,{question,details:'Fictional choices for the demo. You can change an open response.',options,closesAt:at(hours),linkedSessionId:id==='demo_poll_open'?'demo_placement_session':null,status,ownerUid:poc.uid,version:1,publishedAt:status==='draft'?null:stamp});if(status==='draft')return;
    const optionCounts:Record<string,number>={};let responseCount=0;
    users.forEach((u,i)=>{const answered=id!=='demo_poll_open'||u.key==='poc'||u.key==='cr';const optionId=answered?options[i%3]!.id:null;if(optionId){responseCount++;optionCounts[optionId]=(optionCounts[optionId]??0)+1;}put(`pollResponses/${id}_${u.uid}`,{pollId:id,uid:u.uid,status:answered?'responded':'no_response',optionId,studentSnapshot:snapshot(u),...(answered?{respondedAt:stamp}:{})});});
    put(`pollStats/${id}`,{eligibleCount:users.length,responseCount,noResponseCount:users.length-responseCount,optionCounts});
  });
  ([['demo_cr_assigned','Demo confirm guest speaker logistics','assigned',28],['demo_cr_progress','Demo compile batch feedback','in_progress',-2],['demo_cr_completed','Demo share the orientation notes','completed',-24]] as const).forEach(([id,title,status,hours])=>{
    put(`crTasks/${id}`,{title,notes:'Fictional coordination task. Demonstrate editing and status transitions without changing real work.',status,dueAt:at(hours),version:1,scheduleVersion:1,createdBy:cr.uid,updatedBy:cr.uid,creatorSnapshot:snapshot(cr),...(status==='completed'?{completedBy:cr.uid,completedAt:at(-25)}:{})});if(status!=='completed')reminder(id,title,hours,{kind:'cr_task',crTaskId:id});
  });
  users.forEach((u)=>{
    for(const [id,type,title,body] of [['demo_welcome','demo_notice','Sample workspace ready','Your fictional records cover the full presentation.'],['demo_academic_notice','academic_event_created','Demo academic calendar updated','Check the upcoming sample dates.'],['demo_unread_notice','task_published','Demo placement preference form','A fictional form is ready for your response.']] as const)put(`users/${u.uid}/notifications/${id}`,{type,title,body,taskId:'demo_wing_form',readAt:id==='demo_welcome'?stamp:null});
  });
  counts.assignments=records.filter((r)=>r.path.startsWith('taskAssignments/')).length;
  counts.reportRecipients=records.filter((r)=>r.path.startsWith('taskAssignments/demo_directory_audit_')).length;
  counts.reminderJobs=records.filter((r)=>r.path.startsWith('reminderJobs/')).length;
  counts.notifications=users.length*3;
  return { records, counts, reminderAt:new Date(now+120_000).toISOString(), generatedAt:new Date(now).toISOString(), subjectPocUid:poc.uid, wingPocUid:wing.uid };
}
