export const DEMO_SEED_ID = "mock_v1";

export const DEMO_ACCOUNTS = [
  { key: "student", role: "Student", rollNumber: "24M2901", displayName: "Demo Student Aarav Shah", sectionId: "A", wingId: "A", cr: false },
  { key: "poc", role: "Subject and batch POC", rollNumber: "24M2902", displayName: "Demo Subject POC Meera Iyer", sectionId: "A", wingId: "A", cr: false },
  { key: "cr", role: "Class representative", rollNumber: "24M2903", displayName: "Demo CR Rohan Mehta", sectionId: "A", wingId: "A", cr: true },
  { key: "wing", role: "Wing A POC", rollNumber: "24M2904", displayName: "Demo Wing POC Ananya Rao", sectionId: "A", wingId: "A", cr: false },
  { key: "placed", role: "Placed student", rollNumber: "24M2905", displayName: "Demo Placed Student Ishaan Kapoor", sectionId: "B", wingId: "B", cr: false },
  { key: "studentB", role: "Section B student", rollNumber: "24M2906", displayName: "Demo Student Zoya Khan", sectionId: "B", wingId: "B", cr: false },
] as const;

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]["key"];
export type DemoCredential = { role: string; rollNumber: string; password: string };
export type DemoSummary = {
  seedId: string;
  generatedAt: string;
  reminderAt: string;
  counts: Record<string, number>;
  accounts: Array<{ role: string; rollNumber: string }>;
  credentials: DemoCredential[];
};

export const DEMO_PRESENTATION_STEPS = [
  { minutes: 2, title: "Start with the student day", role: "Student", view: "Today", detail: "Search deadlines, compare To do and Completed, complete a form and reopen it." },
  { minutes: 1, title: "Show academics in context", role: "Student then Subject POC", view: "Academics", detail: "Browse pre-reads, assignments, quizzes and exams; edit a demo date and show the change." },
  { minutes: 2, title: "Publish work to a wing", role: "Wing A POC", view: "Wing forms", detail: "Edit the demo draft, preview its audience, publish, then complete it as the student." },
  { minutes: 1, title: "Collect attendance and opinions", role: "Student then CR", view: "Placement sessions and Batch polls", detail: "Answer and change a response, inspect results, and compare open and closed items." },
  { minutes: 1, title: "Explain competition confirmations", role: "Student then batch POC", view: "Opportunities", detail: "Show pending, partial and completed external and internal confirmations." },
  { minutes: 1, title: "Connect internships and eligibility", role: "Student then CR", view: "Internships and Placement status", detail: "Register or decline; use the placed student's private record to explain eligibility." },
  { minutes: 1, title: "Coordinate the representatives", role: "CR", view: "CR Board", detail: "Open a task, edit its deadline, move it to In progress, then complete it." },
  { minutes: 1, title: "Assign responsibility", role: "CR or System admin", view: "POC setup", detail: "Use a DEMO subject offering to demonstrate the two subject seats and revocation." },
  { minutes: 2, title: "Follow up with complete reports", role: "CR then Wing A POC", view: "Task compliance and Reports", detail: "Choose Demo directory audit, filter responses, load every page and export the CSV." },
  { minutes: 2, title: "Close with administration and delivery", role: "System admin and Student", view: "System admin and App setup", detail: "Explain imports, health, inbox versus push, the demo reminder and safe sample-data cleanup." },
] as const;
