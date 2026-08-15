import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-south1", maxInstances: 20, memory: "512MiB" });

export { activateMyAccount } from "./account.js";
export { createTestAccounts } from "./test-accounts.js";
export { initializeAppConfig, saveSubjectOffering } from "./catalog.js";
export { validateRosterImport, commitRosterImport, updateRoleAssignments } from "./roster.js";
export { previewTaskRecipients, createTask, updateTask, publishTask, syncTaskRecipients, closeTask, cancelTask } from "./tasks.js";
export { setMyCompletion, reopenMyCompletion, setTaskExemption, markNotificationsRead, getComplianceExport } from "./completion.js";
export { scanDueReminderJobs, fanOutReminder, deliverInAppNotification, dailyOverdueDigest, reconcileTaskStats } from "./alerts.js";
export { getPocSetup, searchRoleCandidates, assignPoc, revokePoc, migrateWingIds } from "./governance.js";
export { commitTimetableImport, createAcademicEvent, updateAcademicEvent, cancelAcademicEvent } from "./academics.js";
export {
  createCompetition, publishCompetition, updateCompetition, cancelCompetition, setCompetitionResponse,
  createTeam, updateTeam, reportTeamMembership, deleteDraftTeam, registerTeam,
  createNextRound, markRoundSubmitted, correctRoundSubmission, finalizeRound,
  createInternship, publishInternship, updateInternship, cancelInternship, setInternshipResponse,
  getWingOpportunityReport, getCompetitionExport,
} from "./opportunities.js";
