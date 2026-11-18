import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CallableFunction } from "firebase-functions/v2/https";

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const suite = enabled ? describe : describe.skip;
let firebase: typeof import("./firebase.js");
let tasks: typeof import("./tasks.js");
let academics: typeof import("./academics.js");
let completion: typeof import("./completion.js");
let roster: typeof import("./roster.js");
let opportunities: typeof import("./opportunities.js");
let placements: typeof import("./placements.js");
let compliance: typeof import("./compliance.js");
let demo: typeof import("./test-data.js");
let demoCredentials: Array<{ role: string; rollNumber: string; password: string }> = [];
const uid = `integration_${Date.now()}`;
const ids = { admin: `${uid}_admin`, otherAdmin: `${uid}_other_admin`, student: `${uid}_student`, wing: `${uid}_wing`, cr: `${uid}_cr` };
const password = "Synthetic-test-123!";
const profile = (rollNumber: string, role: keyof typeof ids) => ({
  authEmail: `${rollNumber.toLowerCase()}@users.deadlineos.app`, displayName: `Integration ${role}`, rollNumber, status: "active", sectionId: "A", wingId: "J",
  roles: { student: true, cr: role === "cr", systemAdmin: role === "admin" || role === "otherAdmin" },
  scopes: { crSections: {}, wingPocWings: role === "wing" ? { J: true } : {}, subjectPocOfferings: {}, batchPocRoles: {} },
});
async function call(handler: CallableFunction<any, any>, role: keyof typeof ids, data: unknown) {
  return handler.run({ data, auth: { uid: ids[role], token: { email: profile("26M2800", role).authEmail } }, rawRequest: {}, acceptsStreaming: false } as never);
}

suite("privileged workflows against real emulators", () => {
  beforeAll(async () => {
    // A distinct demo project isolates these tests from browser fixtures and real data.
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-deadlineos-integration";
    process.env.GCLOUD_PROJECT = "demo-deadlineos-integration";
    firebase = await import("./firebase.js");
    [tasks, academics, completion, roster, opportunities, placements, compliance, demo] = await Promise.all([
      import("./tasks.js"), import("./academics.js"), import("./completion.js"), import("./roster.js"), import("./opportunities.js"), import("./placements.js"), import("./compliance.js"), import("./test-data.js"),
    ]);
    for (const [index, role] of (Object.keys(ids) as Array<keyof typeof ids>).entries()) {
      const data = profile(`26M28${String(index).padStart(2, "0")}`, role);
      await firebase.adminAuth.createUser({ uid: ids[role], email: data.authEmail, password });
      await firebase.db.doc(`users/${ids[role]}`).set(data);
    }
    await firebase.db.doc("wings/J").set({ active: true });
  }, 30_000);

  it("publishes once under concurrent requests and supports completion, reopening and closure", async () => {
    const { taskId } = await call(tasks.createTask, "wing", { title: "Integration wing form", description: "Fill the form", taskType: "administrative_form", target: { kind: "wing", wingId: "J", scopeKey: "wing:J" }, dueAtIso: new Date(Date.now() + 48 * 3_600_000).toISOString() });
    await Promise.all([call(tasks.publishTask, "wing", { taskId }), call(tasks.publishTask, "wing", { taskId })]);
    const assignments = await firebase.db.collection("taskAssignments").where("taskId", "==", taskId).get();
    expect(assignments.size).toBe(5);
    expect((await firebase.db.doc(`taskStats/${taskId}`).get()).get("pendingCount")).toBe(5);
    expect((await firebase.db.collection("reminderJobs").where("taskId", "==", taskId).get()).size).toBe(3);
    await call(completion.setMyCompletion, "student", { taskId });
    await call(completion.setMyCompletion, "student", { taskId });
    expect((await firebase.db.doc(`taskStats/${taskId}`).get()).get("completedCount")).toBe(1);
    await call(completion.reopenMyCompletion, "student", { taskId });
    await call(tasks.closeTask, "wing", { taskId });
    expect((await firebase.db.doc(`taskAssignments/${taskId}_${ids.student}`).get()).get("taskSnapshot.taskStatus")).toBe("closed");
    await expect(call(completion.setMyCompletion, "student", { taskId })).rejects.toThrow("not open");
    await expect(call(tasks.createTask, "student", { title: "Forbidden form", description: "No grant", taskType: "administrative_form", target: { kind: "wing", wingId: "J", scopeKey: "wing:J" }, dueAtIso: new Date().toISOString() })).rejects.toThrow();
  }, 30_000);

  it("replaces a timetable, supports reverting an import, and isolates offerings across terms", async () => {
    const row = { subjectCode: "IT101", subjectName: "Integration subject", sectionId: "A", weekday: 1, startTime: "09:00", endTime: "10:00", room: "101" };
    const input = { termId: "INTEGRATION-1", termStartIso: "2026-01-01", termEndIso: "2026-12-31", rows: [row] };
    await call(academics.commitTimetableImport, "admin", input);
    await call(academics.commitTimetableImport, "admin", { ...input, rows: [{ ...row, startTime: "11:00", endTime: "12:00" }] });
    let slots = await firebase.db.collection("timetableSlots").where("termId", "==", input.termId).where("active", "==", true).get();
    expect(slots.size).toBe(1); expect(slots.docs[0]!.get("startTime")).toBe("11:00");
    await call(academics.commitTimetableImport, "admin", input);
    slots = await firebase.db.collection("timetableSlots").where("termId", "==", input.termId).where("active", "==", true).get();
    expect(slots.size).toBe(1); expect(slots.docs[0]!.get("startTime")).toBe("09:00");
    await call(academics.commitTimetableImport, "admin", { ...input, termId: "INTEGRATION-2" });
    const offerings = await firebase.db.collection("subjectOfferings").where("subjectCode", "==", "IT101").get();
    expect(offerings.size).toBe(2);
    await expect(call(academics.commitTimetableImport, "admin", { ...input, rows: [row, row] })).rejects.toThrow("Duplicate class");
  }, 30_000);

  it("preserves another administrator during roster re-import", async () => {
    await call(roster.commitRosterImport, "admin", { rows: [{ rollNumber: "26M2801", password, displayName: "Still administrator", sectionId: "A", wingId: "J", cr: false }] });
    expect((await firebase.db.doc(`users/${ids.otherAdmin}`).get()).get("roles.systemAdmin")).toBe(true);
    const operations = await firebase.db.collection("operations").where("type", "==", "roster_import").get();
    expect(operations.docs.some((doc) => doc.get("status") === "complete" && doc.get("processed") === 1)).toBe(true);
    expect(JSON.stringify(operations.docs.map((doc) => doc.data()))).not.toContain(password);
  }, 30_000);

  it("archives placement responses and restores eligibility without revealing private state", async () => {
    const { internshipId } = await call(opportunities.createInternship, "admin", { company: "Integration company", role: "Analyst", description: "Test opportunity", registrationDeadlineIso: new Date(Date.now() + 86_400_000).toISOString() });
    await call(opportunities.publishInternship, "admin", { internshipId });
    await call(opportunities.setInternshipResponse, "student", { internshipId, status: "registered" });
    await call(placements.setPlacementStatus, "cr", { uid: ids.student, status: "placed", reason: "Integration placement" });
    expect((await firebase.db.doc(`internshipResponses/${internshipId}_${ids.student}`).get()).exists).toBe(false);
    expect((await firebase.db.doc(`placementResponseHistory/${internshipId}_${ids.student}`).get()).exists).toBe(true);
    await expect(call(opportunities.setInternshipResponse, "student", { internshipId, status: "registered" })).rejects.toThrow();
    await call(placements.setPlacementStatus, "cr", { uid: ids.student, status: "seeking", reason: "Integration restoration" });
    expect((await firebase.db.doc(`internshipResponses/${internshipId}_${ids.student}`).get()).get("status")).toBe("registered");
  }, 30_000);

  it("paginates current-item responses and excludes historical work", async () => {
    const taskId = `${uid}_report`; const dueAt = firebase.Timestamp.now();
    await firebase.db.doc(`tasks/${taskId}`).set({ title: "Paged report", status: "published", dueAt, target: { scopeKey: "wing:J" } });
    await firebase.db.doc(`tasks/${uid}_history`).set({ title: "Old task", status: "closed", dueAt });
    const writer = firebase.db.bulkWriter();
    for (let i = 0; i < 135; i++) writer.set(firebase.db.doc(`taskAssignments/${taskId}_${String(i).padStart(3, "0")}`), { taskId, uid: `report_${i}`, status: "pending", wingId: "J", sectionId: "A", studentSnapshot: { displayName: `Student ${i}`, rollNumber: `26M2${String(i).padStart(3, "0")}` } });
    await writer.close();
    const first = await call(compliance.getCurrentTaskCompliance, "cr", { itemKey: `deadline:${taskId}` });
    expect(first.rows).toHaveLength(100); expect(first.nextCursor).toBeTruthy();
    expect(first.items.some((item: { id: string }) => item.id === `${uid}_history`)).toBe(false);
    const second = await call(compliance.getCurrentTaskCompliance, "cr", { itemKey: `deadline:${taskId}`, rowsOnly: true, cursor: first.nextCursor });
    expect(second.rows).toHaveLength(35); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.rows, ...second.rows].map((row: { id: string }) => row.id)).size).toBe(135);
    await expect(call(compliance.getCurrentTaskCompliance, "student", {})).rejects.toThrow();
  }, 30_000);

  it("publishes to 114 recipients and delivers each scheduled reminder once", async () => {
    await firebase.db.doc("wings/I").set({ active: true });
    const writer = firebase.db.bulkWriter();
    for (let i = 0; i < 114; i++) writer.set(firebase.db.doc(`users/${uid}_load_${i}`), { ...profile(`26M2${String(500 + i).padStart(3, "0")}`, "student"), wingId: "I" });
    await writer.close();
    const { taskId } = await call(tasks.createTask, "admin", { title: "114-student load rehearsal", description: "Synthetic load", taskType: "administrative_form", target: { kind: "wing", wingId: "I", scopeKey: "wing:I" }, dueAtIso: new Date(Date.now() + 48 * 3_600_000).toISOString() });
    const started = Date.now();
    await call(tasks.publishTask, "admin", { taskId });
    expect((await firebase.db.collection("taskAssignments").where("taskId", "==", taskId).get()).size).toBe(114);
    const jobId = `${taskId}_v1_minus24h`;
    await firebase.db.doc(`reminderJobs/${jobId}`).update({ fireAt: firebase.Timestamp.fromMillis(Date.now() - 1000) });
    const { runSparkMaintenance } = await import("./spark-adapter.js");
    await runSparkMaintenance("pulse");
    const deliveries = await firebase.db.collection("reminderDeliveries").where("jobId", "==", jobId).get();
    expect(deliveries.size).toBe(114);
    await firebase.db.doc("systemHealth/sparkRuntime").set({ nextPulseAt: firebase.Timestamp.fromMillis(0) }, { merge: true });
    await runSparkMaintenance("pulse");
    expect((await firebase.db.collection("reminderDeliveries").where("jobId", "==", jobId).get()).size).toBe(114);
    expect(deliveries.docs.every((doc) => doc.get("attempts") === 1 && doc.get("status") === "sent")).toBe(true);
    console.info(`114-recipient publication and reminder rehearsal: ${Date.now() - started}ms on local emulators`);
  }, 45_000);

  it("enforces App Check at the custom adapter boundary when enabled", async () => {
    const { verifySparkAppCheck } = await import("./spark-adapter.js");
    const previous = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const previousEnforcement = process.env.ENFORCE_APP_CHECK;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.ENFORCE_APP_CHECK = "true";
    const verify = vi.spyOn(firebase.adminAppCheck, "verifyToken");
    try {
      await expect(verifySparkAppCheck()).rejects.toThrow("App verification is required");
      verify.mockRejectedValueOnce(new Error("Invalid token"));
      await expect(verifySparkAppCheck("invalid")).rejects.toThrow("App verification expired");
      verify.mockResolvedValueOnce({ appId: "demo-app", token: {} } as never);
      await expect(verifySparkAppCheck("valid")).resolves.toBeUndefined();
    } finally {
      verify.mockRestore();
      process.env.FIREBASE_AUTH_EMULATOR_HOST = previous;
      if (previousEnforcement === undefined) delete process.env.ENFORCE_APP_CHECK; else process.env.ENFORCE_APP_CHECK = previousEnforcement;
    }
  });

  it("rejects unauthenticated calls and throttles repeated calls across the adapter", async () => {
    const { invokeSparkCallable } = await import("./spark-adapter.js");
    await expect(invokeSparkCallable("activateMyAccount", {}, "")).rejects.toThrow("Sign in is required");
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify({ targetProjectId: "demo-deadlineos-integration", email: profile("26M2800", "admin").authEmail, password, returnSecureToken: true }),
    });
    const result = await response.json() as { idToken: string; error?: { message: string } };
    expect(result.error?.message).toBeUndefined();
    const token = result.idToken;
    expect(token).toBeTruthy();
    await invokeSparkCallable("activateMyAccount", {}, token);
    await firebase.db.doc(`apiRateLimits/${ids.admin}`).set({ minute: Math.floor(Date.now() / 60_000), count: 60 });
    await expect(invokeSparkCallable("activateMyAccount", {}, token)).rejects.toThrow("Too many requests");
  }, 30_000);

  it("recovers a partially failed roster import and resets a student's password", async () => {
    const replacementPassword = "Recovered-test-456!";
    const rows = [
      { rollNumber: "26M2802", password: replacementPassword, displayName: "Recovered student", sectionId: "A", wingId: "J", cr: false },
      { rollNumber: "26M2801", password: replacementPassword, displayName: "Recovered administrator", sectionId: "A", wingId: "J", cr: false },
    ];
    const original = firebase.adminAuth.updateUser.bind(firebase.adminAuth);
    const update = vi.spyOn(firebase.adminAuth, "updateUser").mockImplementation(async (targetUid, data) => {
      if (targetUid === ids.otherAdmin) throw new Error("Synthetic mid-import interruption");
      return original(targetUid, data);
    });
    try { await expect(call(roster.commitRosterImport, "admin", { rows })).rejects.toThrow("Synthetic mid-import interruption"); }
    finally { update.mockRestore(); }
    const operations = await firebase.db.collection("operations").where("type", "==", "roster_import").get();
    expect(operations.docs.some((doc) => doc.get("status") === "failed" && doc.get("processed") === 1)).toBe(true);
    await expect(call(roster.commitRosterImport, "admin", { rows })).resolves.toMatchObject({ total: 2, updated: 2 });
    expect((await firebase.db.doc(`users/${ids.otherAdmin}`).get()).get("roles.systemAdmin")).toBe(true);
    const signIn = (candidate: string) => fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
      body: JSON.stringify({ targetProjectId: "demo-deadlineos-integration", email: profile("26M2802", "student").authEmail, password: candidate, returnSecureToken: true }),
    });
    expect((await signIn(password)).ok).toBe(false);
    const recovered = await signIn(replacementPassword);
    expect(recovered.ok).toBe(true);
    expect((await recovered.json() as { localId: string }).localId).toBe(ids.student);
    const records = await firebase.db.collection("operations").where("type", "==", "roster_import").get();
    expect(JSON.stringify(records.docs.map((doc) => doc.data()))).not.toContain(replacementPassword);
  }, 30_000);
  it("prepares coherent demo roles, placement history and a fully paginated report", async () => {
    await expect(call(demo.prepareDemoData, "student", {})).rejects.toThrow("administrator");
    await firebase.db.doc('users/'+ids.otherAdmin).update({ 'scopes.batchPocRoles.grooming': true, 'scopes.subjectPocOfferings.DEMO-FIN-A': true });
    await firebase.db.doc('pocAssignments/attendance_batch').set({kind:'attendance',scopeId:'batch',uid:ids.otherAdmin,active:true});
    await firebase.db.doc('academicEvents/real_event_to_keep').set({ title:'Real event to keep',status:'published' });
    const result = await call(demo.prepareDemoData, "admin", { origin:'http://127.0.0.1:3100' });
    demoCredentials=result.credentials; expect(demoCredentials).toHaveLength(6);
    expect(result.counts.reportRecipients).toBe(114); expect(result.counts.wingForms).toBe(9);
    const wingUser=await firebase.adminAuth.getUserByEmail('24m2904@users.deadlineos.app');
    expect((await firebase.db.doc('users/'+wingUser.uid).get()).get('scopes.wingPocWings.A')).toBe(true);
    const first=await call(compliance.getCurrentTaskCompliance,'cr',{itemKey:'deadline:demo_directory_audit',rowsOnly:true});
    expect(first.rows).toHaveLength(100); expect(first.nextCursor).toBeTruthy();
    const last=await call(compliance.getCurrentTaskCompliance,'cr',{itemKey:'deadline:demo_directory_audit',rowsOnly:true,cursor:first.nextCursor});
    expect(last.rows).toHaveLength(14); expect(last.nextCursor).toBeNull();
    const catalog = await call(compliance.getCurrentTaskCompliance, 'cr', { itemKey: 'deadline:demo_directory_audit', catalogOnly: true });
    expect(catalog.rows).toEqual([]); expect(catalog.nextCursor).toBeNull();
    expect(catalog.items.some((item: { key: string }) => item.key === 'deadline:demo_directory_audit')).toBe(true);
    const wingReport = await call(opportunities.getWingOpportunityReport, 'admin', { wingId: 'A', opportunityKind: 'competition', opportunityId: 'demo_case_open' });
    expect(wingReport.competitionResponses).toHaveLength(4); expect(wingReport.internshipResponses).toEqual([]); expect(wingReport.internships).toEqual([]);
    expect(wingReport.competitionResponses.every((row: { opportunityId: string }) => row.opportunityId === 'demo_case_open')).toBe(true);
    const rows=await firebase.db.collection('taskAssignments').where('taskId','==','demo_directory_audit').get();
    const stats=await firebase.db.doc('taskStats/demo_directory_audit').get();
    for(const [state,key] of [['pending','pendingCount'],['completed','completedCount'],['exempt','exemptCount']])expect(stats.get(key!)).toBe(rows.docs.filter(r=>r.get('status')===state).length);
    const placed=await firebase.adminAuth.getUserByEmail('24m2905@users.deadlineos.app');
    await call(placements.setPlacementStatus,'cr',{uid:placed.uid,status:'seeking',reason:'Demo eligibility restoration'});
    expect((await firebase.db.doc('internshipResponses/demo_internship_'+placed.uid).get()).get('status')).toBe('registered');
    expect((await firebase.db.doc('reminderJobs/demo_reminder_check_v1_minus2h').get()).get('fireAt').toMillis()).toBeGreaterThan(Date.now());
    expect((await firebase.db.doc('academicEvents/real_event_to_keep').get()).get('title')).toBe('Real event to keep');
    const operation=await firebase.db.doc('operations/demo_seed').get(); expect(JSON.stringify(operation.data())).not.toContain(demoCredentials[0]!.password);
  },60_000);

  it("refreshes demo responses while preserving passwords and supports an explicit password reset",async()=>{
    const student=await firebase.adminAuth.getUserByEmail('24m2901@users.deadlineos.app');
    await firebase.db.doc('taskAssignments/demo_wing_form_'+student.uid).update({status:'completed'});
    const result=await call(demo.prepareDemoData,'admin',{origin:'http://127.0.0.1:3100'});
    expect(result.credentials).toEqual([]);
    expect((await firebase.db.doc('taskAssignments/demo_wing_form_'+student.uid).get()).get('status')).toBe('pending');
    const login=async(password:string)=>fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({targetProjectId:'demo-deadlineos-integration',email:'24m2901@users.deadlineos.app',password,returnSecureToken:true})});
    const governance=await import('./governance.js');
    const wing=await firebase.adminAuth.getUserByEmail('24m2904@users.deadlineos.app');
    await call(governance.assignPoc,'admin',{kind:'subject',scopeId:'DEMO-FIN-A',seat:2,uid:wing.uid});
    expect((await firebase.db.doc('pocAssignments/subject_DEMO-FIN-A_2').get()).get('demoSeedId')).toBe('mock_v1');
    const oldPassword=demoCredentials.find(c=>c.rollNumber==='24M2901')!.password;
    expect((await login(oldPassword)).ok).toBe(true);
    const reset=await call(demo.prepareDemoData,'admin',{origin:'http://127.0.0.1:3100',resetPasswords:true});
    expect(reset.credentials).toHaveLength(6);
    expect((await login(oldPassword)).ok).toBe(false);
    expect((await login(reset.credentials.find((c:{rollNumber:string})=>c.rollNumber==='24M2901').password)).ok).toBe(true);
  },60_000);

  it("clears fixtures and derived delivery records without touching unrelated users or grants",async()=>{
    const student=await firebase.adminAuth.getUserByEmail('24m2901@users.deadlineos.app');
    await firebase.db.doc('users/'+student.uid+'/notifications/derived_demo_notice').set({taskId:'demo_wing_form',title:'Derived notice'});
    await firebase.db.doc('pushJobs/derived_demo_job').set({uid:student.uid,notificationPath:'users/'+student.uid+'/notifications/derived_demo_notice'});
    await firebase.db.doc('pushDeliveries/derived_demo_delivery').set({jobId:'derived_demo_job'});
    await firebase.db.doc('reminderDeliveries/demo_session_delivery').set({jobId:'demo_placement_session_v1_minus2h'});
    const result=await call(demo.clearTestData,'admin',{});expect(result.deleted).toBeGreaterThan(300);
    expect((await firebase.db.collection('users').where('isDemoRoster','==',true).get()).size).toBe(0);
    expect((await firebase.db.doc('users/'+student.uid).get()).exists).toBe(true);
    expect((await firebase.db.doc('users/'+ids.otherAdmin).get()).get('scopes.batchPocRoles.grooming')).toBe(true);
    expect((await firebase.db.doc('users/'+ids.otherAdmin).get()).get('scopes.subjectPocOfferings.DEMO-FIN-A')).toBe(true);
    expect((await firebase.db.doc('academicEvents/real_event_to_keep').get()).exists).toBe(true);
    expect((await firebase.db.doc('pocAssignments/attendance_batch').get()).get('uid')).toBe(ids.otherAdmin);
    for(const path of ['pushJobs/derived_demo_job','pushDeliveries/derived_demo_delivery','reminderDeliveries/demo_session_delivery','tasks/demo_wing_form'])expect((await firebase.db.doc(path).get()).exists).toBe(false);
  },60_000);

  it("refuses occupied sample IDs, protected account collisions and overlapping setup",async()=>{
    await firebase.db.doc('tasks/demo_wing_form').set({title:'Unrelated reserved record'});
    await expect(call(demo.prepareDemoData,'admin',{})).rejects.toThrow('occupied by non-demo');
    expect((await firebase.db.doc('tasks/demo_wing_form').get()).get('title')).toBe('Unrelated reserved record');
    await firebase.db.doc('tasks/demo_wing_form').delete();
    const protectedUser=await firebase.adminAuth.getUserByEmail('24m2906@users.deadlineos.app');
    await firebase.db.doc('users/'+protectedUser.uid).update({isTestAccount:false});
    await expect(call(demo.prepareDemoData,'admin',{})).rejects.toThrow('non-test identity');
    expect((await firebase.db.doc('users/'+protectedUser.uid).get()).get('isTestAccount')).toBe(false);
    await firebase.db.doc('users/'+protectedUser.uid).update({isTestAccount:true});
    await firebase.db.doc('users/'+protectedUser.uid).delete();
    const recovered=await call(demo.prepareDemoData,'admin',{});
    expect(recovered.credentials.map((c:{rollNumber:string})=>c.rollNumber)).toEqual(['24M2906']);
    await firebase.db.doc('operations/demo_seed').set({leaseUntil:firebase.Timestamp.fromMillis(Date.now()+60_000)});
    await expect(call(demo.prepareDemoData,'admin',{})).rejects.toThrow('Another sample-data operation');
    await firebase.db.doc('operations/demo_seed').delete();
  },60_000);

});
