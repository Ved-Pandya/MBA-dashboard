import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-south1", maxInstances: 20, memory: "512MiB" });

export { activateMyAccount } from "./account.js";
export { initializeAppConfig, saveSubjectOffering } from "./catalog.js";
export { validateRosterImport, commitRosterImport, updateRoleAssignments } from "./roster.js";
export { previewTaskRecipients, createTask, updateTask, publishTask, syncTaskRecipients, closeTask, cancelTask } from "./tasks.js";
export { setMyCompletion, reopenMyCompletion, setTaskExemption, markNotificationsRead, getComplianceExport } from "./completion.js";
export { scanDueReminderJobs, fanOutReminder, deliverInAppNotification, dailyOverdueDigest, reconcileTaskStats } from "./alerts.js";
