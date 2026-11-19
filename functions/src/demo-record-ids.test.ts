import { expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { remapDemoSource } from "./demo-record-ids.js";

it("remaps compound keys and nested references without touching a similar source ID or Firestore values", () => {
  const stamp = Timestamp.fromMillis(1000);
  const records = [
    { path: "internships/demo_internship", data: { createdAt: stamp, title: "Demo internship" } },
    { path: "internshipStats/demo_internship", data: { responseCount: 2 } },
    { path: "internshipResponses/demo_internship_user1", data: { internshipId: "demo_internship", createdAt: stamp } },
    { path: "placementResponseHistory/demo_internship_user2", data: { internshipId: "demo_internship", responseData: { internshipId: "demo_internship", createdAt: stamp } } },
    { path: "internships/demo_internship_analytics", data: { title: "Analytics" } },
    { path: "internshipResponses/demo_internship_analytics_user1", data: { internshipId: "demo_internship_analytics" } },
  ];
  const moved = remapDemoSource(records, "internships/demo_internship", "demo_internship_seed_new");
  expect(moved.map(record => record.path)).toEqual([
    "internships/demo_internship_seed_new", "internshipStats/demo_internship_seed_new",
    "internshipResponses/demo_internship_seed_new_user1", "placementResponseHistory/demo_internship_seed_new_user2",
    "internships/demo_internship_analytics", "internshipResponses/demo_internship_analytics_user1",
  ]);
  expect(moved[2]!.data).toMatchObject({ internshipId: "demo_internship_seed_new", createdAt: stamp });
  expect(moved[0]!.data.createdAt).toBe(stamp);
  expect((moved[3]!.data.responseData as { internshipId: string; createdAt: Timestamp }).internshipId).toBe("demo_internship_seed_new");
  expect((moved[3]!.data.responseData as { createdAt: Timestamp }).createdAt).toBe(stamp);
  expect(records[2]!.path).toBe("internshipResponses/demo_internship_user1");
  expect(records[2]!.data.internshipId).toBe("demo_internship");
});

it("updates linked session IDs and source references inside arrays without renaming independent notification IDs", () => {
  const records = [
    { path: "sessionIntimations/demo_session", data: { title: "Demo session" } },
    { path: "generalPolls/demo_poll", data: { linkedSessionId: "demo_session" } },
    { path: "users/student/notifications/demo_notice", data: { sessionId: "demo_session", refs: ["demo_session"] } },
  ];
  const moved = remapDemoSource(records, "sessionIntimations/demo_session", "demo_session_seed_new");
  expect(moved[1]!.data.linkedSessionId).toBe("demo_session_seed_new");
  expect(moved[2]!.path).toBe("users/student/notifications/demo_notice");
  expect(moved[2]!.data.refs).toEqual(["demo_session_seed_new"]);
});
