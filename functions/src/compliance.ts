import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor } from "./helpers.js";

type ComplianceKind = "deadline" | "competition" | "internship" | "session" | "poll";
type ComplianceStatus = "non_responder" | "action_needed" | "responded" | "completed" | "exempt";

type ComplianceItem = {
  key: string;
  id: string;
  kind: ComplianceKind;
  title: string;
  dueAtIso: string;
  scopeLabel: string;
};

type ComplianceRow = {
  id: string;
  itemKey: string;
  itemId: string;
  kind: ComplianceKind;
  uid: string;
  displayName: string;
  rollNumber: string;
  sectionId: string;
  wingId: string;
  status: ComplianceStatus;
  responseLabel: string;
  completedLate?: boolean;
};

function iso(value: unknown) {
  if (!(value instanceof Timestamp)) throw new HttpsError("internal", "A compliance deadline is missing");
  return value.toDate().toISOString();
}

function person(data: FirebaseFirestore.DocumentData) {
  const snapshot = (data.studentSnapshot ?? {}) as Record<string, unknown>;
  return {
    uid: String(data.uid ?? ""),
    displayName: String(snapshot.displayName ?? "Unknown student"),
    rollNumber: String(snapshot.rollNumber ?? ""),
    sectionId: String(data.sectionId ?? snapshot.sectionId ?? ""),
    wingId: String(data.wingId ?? snapshot.wingId ?? ""),
  };
}

function itemKey(kind: ComplianceKind, id: string) {
  return `${kind}:${id}`;
}

export const getCurrentTaskCompliance = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    if (!actor.roles.cr && !actor.roles.systemAdmin) {
      throw new HttpsError("permission-denied", "CR or System Admin access required");
    }

    const [
      tasks, competitions, internships, sessions, polls,
      assignments, competitionResponses, internshipResponses, sessionResponses, pollResponses,
    ] = await Promise.all([
      db.collection("tasks").limit(500).get(),
      db.collection("competitions").limit(500).get(),
      db.collection("internships").limit(500).get(),
      db.collection("sessionIntimations").limit(500).get(),
      db.collection("generalPolls").limit(500).get(),
      db.collection("taskAssignments").limit(10_000).get(),
      db.collection("opportunityResponses").limit(10_000).get(),
      db.collection("internshipResponses").limit(10_000).get(),
      db.collection("sessionResponses").limit(10_000).get(),
      db.collection("pollResponses").limit(10_000).get(),
    ]);

    const items: ComplianceItem[] = [];
    const itemKeys = new Set<string>();
    const addItem = (item: ComplianceItem) => {
      items.push(item);
      itemKeys.add(item.key);
    };

    tasks.docs.filter((doc) => doc.get("status") === "published").forEach((doc) => addItem({
      key: itemKey("deadline", doc.id), id: doc.id, kind: "deadline",
      title: String(doc.get("title")), dueAtIso: iso(doc.get("dueAt")),
      scopeLabel: String(doc.get("target.scopeKey") ?? "Batch"),
    }));
    competitions.docs.filter((doc) => ["published", "in_progress", "needs_configuration"].includes(String(doc.get("status")))).forEach((doc) => addItem({
      key: itemKey("competition", doc.id), id: doc.id, kind: "competition",
      title: String(doc.get("title")), dueAtIso: iso(doc.get("registrationDeadline")), scopeLabel: "Batch",
    }));
    internships.docs.filter((doc) => doc.get("status") === "published").forEach((doc) => addItem({
      key: itemKey("internship", doc.id), id: doc.id, kind: "internship",
      title: String(doc.get("title")), dueAtIso: iso(doc.get("registrationDeadline")), scopeLabel: "Batch",
    }));
    sessions.docs.filter((doc) => doc.get("status") === "published").forEach((doc) => addItem({
      key: itemKey("session", doc.id), id: doc.id, kind: "session",
      title: String(doc.get("title")), dueAtIso: iso(doc.get("responseDeadline")), scopeLabel: "Batch",
    }));
    polls.docs.filter((doc) => doc.get("status") === "published").forEach((doc) => addItem({
      key: itemKey("poll", doc.id), id: doc.id, kind: "poll",
      title: String(doc.get("question")), dueAtIso: iso(doc.get("closesAt")), scopeLabel: "Batch",
    }));

    const rows: ComplianceRow[] = [];
    assignments.docs.forEach((doc) => {
      const data = doc.data();
      const key = itemKey("deadline", String(data.taskId));
      if (!itemKeys.has(key)) return;
      const student = person(data);
      const rawStatus = String(data.status);
      rows.push({
        id: doc.id, itemKey: key, itemId: String(data.taskId), kind: "deadline", ...student,
        status: rawStatus === "pending" ? "non_responder" : rawStatus === "completed" ? "completed" : "exempt",
        responseLabel: rawStatus === "pending" ? "No response" : rawStatus === "completed" ? "Completed" : "Exempt",
        completedLate: data.completedLate === true,
      });
    });
    competitionResponses.docs.forEach((doc) => {
      const data = doc.data();
      const id = String(data.opportunityId);
      const key = itemKey("competition", id);
      if (!itemKeys.has(key)) return;
      const student = person(data);
      const externalConfirmed = data.externalRegistration?.status === "confirmed";
      const internalConfirmed = data.internalForm?.status === "confirmed";
      const bothConfirmed = externalConfirmed && internalConfirmed;
      const anyConfirmed = externalConfirmed || internalConfirmed;
      rows.push({
        id: doc.id, itemKey: key, itemId: id, kind: "competition", ...student,
        status: bothConfirmed ? "responded" : anyConfirmed ? "action_needed" : "non_responder",
        responseLabel: bothConfirmed ? "Both forms confirmed" : anyConfirmed ? "One form pending" : "No confirmations",
        completedLate: data.registeredLate === true,
      });
    });
    internshipResponses.docs.forEach((doc) => {
      const data = doc.data();
      const id = String(data.internshipId);
      const key = itemKey("internship", id);
      if (!itemKeys.has(key)) return;
      const student = person(data);
      const rawStatus = String(data.status ?? "no_response");
      rows.push({
        id: doc.id, itemKey: key, itemId: id, kind: "internship", ...student,
        status: rawStatus === "no_response" ? "non_responder" : rawStatus === "not_applicable_placed" ? "exempt" : "responded",
        responseLabel: rawStatus === "no_response" ? "No response" : rawStatus.replaceAll("_", " "),
        completedLate: data.registeredLate === true,
      });
    });
    sessionResponses.docs.forEach((doc) => {
      const data = doc.data();
      const id = String(data.sessionId);
      const key = itemKey("session", id);
      if (!itemKeys.has(key)) return;
      const student = person(data);
      const rawStatus = String(data.status ?? "no_response");
      rows.push({
        id: doc.id, itemKey: key, itemId: id, kind: "session", ...student,
        status: rawStatus === "no_response" ? "non_responder" : "responded",
        responseLabel: rawStatus === "no_response" ? "No response" : rawStatus.replaceAll("_", " "),
      });
    });
    pollResponses.docs.forEach((doc) => {
      const data = doc.data();
      const id = String(data.pollId);
      const key = itemKey("poll", id);
      if (!itemKeys.has(key)) return;
      const student = person(data);
      const responded = String(data.status) === "responded";
      rows.push({
        id: doc.id, itemKey: key, itemId: id, kind: "poll", ...student,
        status: responded ? "responded" : "non_responder",
        responseLabel: responded ? "Responded" : "No response",
      });
    });

    items.sort((a, b) => new Date(a.dueAtIso).getTime() - new Date(b.dueAtIso).getTime());
    return { items, rows, generatedAtIso: new Date().toISOString() };
  } catch (error) { asHttpsError(error); }
});
