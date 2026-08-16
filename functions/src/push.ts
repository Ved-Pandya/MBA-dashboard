import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import webpush from "web-push";
import { z, ZodError } from "zod";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor } from "./helpers.js";

const deviceIdSchema = z.string().uuid();
const base64UrlKey = z.string().regex(/^[A-Za-z0-9_-]+$/, "Push keys must use base64url encoding");
const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(4_096),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: base64UrlKey.refine((value) => Buffer.from(value, "base64url").byteLength === 65, "Invalid P-256 public key length"),
    auth: base64UrlKey.refine((value) => Buffer.from(value, "base64url").byteLength === 16, "Invalid push authentication key length"),
  }),
});
const registerSchema = z.object({
  deviceId: deviceIdSchema,
  subscription: subscriptionSchema,
  userAgent: z.string().max(1_000).optional().default(""),
});
const removeSchema = z.object({ deviceId: deviceIdSchema });

function pushError(error: unknown): never {
  if (error instanceof ZodError) throw new HttpsError("invalid-argument", error.issues[0]?.message ?? "Invalid push subscription");
  asHttpsError(error);
}

function endpointHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function pushJobId(notificationPath: string) {
  return createHash("sha256").update(notificationPath).digest("hex");
}

function safePushPayload(type: string, jobId: string) {
  let title = "DeadlineOS update";
  let view = "today";
  if (type.includes("academic") || type.includes("pre_read")) { title = "Academic update"; view = "academics"; }
  else if (type.includes("cr_task")) { title = "CR Board update"; view = "crBoard"; }
  else if (type.includes("team") || type.includes("round") || type.includes("membership")) { title = "Team update"; view = "teams"; }
  else if (type.includes("competition") || type.includes("internship") || type.includes("opportunity")) { title = "Opportunity update"; view = "opportunities"; }
  else if (type.includes("poc")) { title = "POC responsibility update"; view = "poc"; }
  else if (type.includes("deadline") || type.includes("overdue") || type.includes("reminder")) title = "Deadline alert";
  return {
    title,
    body: "Open DeadlineOS to view the details.",
    url: `/?view=${view}&notifications=1`,
    tag: jobId,
  };
}

export const registerPushSubscription = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = registerSchema.parse(request.data);
    const subscriptionId = `${actor.uid}_${input.deviceId}`;
    const subscriptionRef = db.doc(`pushSubscriptions/${subscriptionId}`);
    const ownerRef = db.doc(`pushEndpointOwners/${endpointHash(input.subscription.endpoint)}`);
    const mirrorRef = db.doc("systemHealth/pushMirror");
    await db.runTransaction(async (tx) => {
      const [subscription, owner, mirror] = await Promise.all([
        tx.get(subscriptionRef),
        tx.get(ownerRef),
        tx.get(mirrorRef),
      ]);
      if (owner.exists) {
        const oldSubscriptionId = String(owner.get("subscriptionId") ?? "");
        if (oldSubscriptionId && oldSubscriptionId !== subscriptionId) {
          tx.set(db.doc(`pushSubscriptions/${oldSubscriptionId}`), {
            status: "revoked",
            revokedReason: "endpoint_moved_to_another_user",
            revokedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
      tx.set(subscriptionRef, {
        uid: actor.uid,
        deviceId: input.deviceId,
        endpoint: input.subscription.endpoint,
        endpointHash: ownerRef.id,
        expirationTime: input.subscription.expirationTime ?? null,
        keys: input.subscription.keys,
        userAgent: input.userAgent,
        status: "active",
        failureCount: 0,
        ...(subscription.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(ownerRef, { uid: actor.uid, deviceId: input.deviceId, subscriptionId, updatedAt: FieldValue.serverTimestamp() });
      if (!mirror.exists) {
        tx.set(mirrorRef, {
          initializedAt: FieldValue.serverTimestamp(),
          cursorAt: Timestamp.now(),
          cursorPath: "",
          mirroredCount: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return { enabled: true, deviceId: input.deviceId };
  } catch (error) { pushError(error); }
});

export const removePushSubscription = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const { deviceId } = removeSchema.parse(request.data);
    const subscriptionId = `${actor.uid}_${deviceId}`;
    const subscriptionRef = db.doc(`pushSubscriptions/${subscriptionId}`);
    await db.runTransaction(async (tx) => {
      const subscription = await tx.get(subscriptionRef);
      if (!subscription.exists || subscription.get("uid") !== actor.uid) return;
      const ownerRef = db.doc(`pushEndpointOwners/${String(subscription.get("endpointHash"))}`);
      const owner = await tx.get(ownerRef);
      tx.set(subscriptionRef, {
        status: "revoked",
        revokedReason: "user_disabled",
        revokedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (owner.exists && owner.get("subscriptionId") === subscriptionId) tx.delete(ownerRef);
    });
    return { enabled: false, deviceId };
  } catch (error) { pushError(error); }
});

export async function mirrorNotificationPushJobs() {
  const mirrorRef = db.doc("systemHealth/pushMirror");
  const mirror = await mirrorRef.get();
  if (!mirror.exists) {
    await mirrorRef.set({ initializedAt: FieldValue.serverTimestamp(), cursorAt: Timestamp.now(), cursorPath: "", mirroredCount: 0, updatedAt: FieldValue.serverTimestamp() });
    return 0;
  }
  const cursorAt = mirror.get("cursorAt") as Timestamp;
  const cursorPath = String(mirror.get("cursorPath") ?? "");
  let notificationsQuery = db.collectionGroup("notifications")
    .where("createdAt", ">=", cursorAt)
    .orderBy("createdAt", "asc")
    .orderBy(FieldPath.documentId(), "asc")
    .limit(250);
  if (cursorPath) notificationsQuery = notificationsQuery.startAfter(cursorAt, cursorPath);
  const notifications = await notificationsQuery.get();
  if (notifications.empty) return 0;

  let created = 0;
  for (const notification of notifications.docs) {
    const uid = notification.ref.parent.parent?.id;
    if (!uid) continue;
    const jobId = pushJobId(notification.ref.path);
    const jobRef = db.doc(`pushJobs/${jobId}`);
    const demoMetadata = notification.get("demoSeedId")
      ? { isTestData: true, demoSeedId: notification.get("demoSeedId") }
      : {};
    try {
      await jobRef.create({
        uid,
        notificationId: notification.id,
        notificationPath: notification.ref.path,
        notificationType: String(notification.get("type") ?? "general"),
        payload: safePushPayload(String(notification.get("type") ?? "general"), jobId),
        status: "queued",
        attempts: 0,
        nextAttemptAt: Timestamp.now(),
        ...demoMetadata,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    } catch (error) {
      if ((error as { code?: number | string }).code !== 6 && (error as { code?: number | string }).code !== "already-exists") throw error;
    }
  }
  const last = notifications.docs.at(-1)!;
  await mirrorRef.set({
    cursorAt: last.get("createdAt"),
    cursorPath: last.ref.path,
    mirroredCount: FieldValue.increment(created),
    lastSuccessAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return created;
}

type PushJob = {
  uid: string;
  payload: { title: string; body: string; url: string; tag: string };
  attempts: number;
  isTestData?: boolean;
  demoSeedId?: string;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function claimPushJob(jobRef: FirebaseFirestore.DocumentReference) {
  return db.runTransaction(async (tx) => {
    const job = await tx.get(jobRef);
    if (!job.exists || !["queued", "retry"].includes(String(job.get("status")))) return false;
    tx.update(jobRef, { status: "processing", leaseUntil: Timestamp.fromMillis(Date.now() + 4 * 60_000), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

async function deliverPushJob(jobId: string, jobRef: FirebaseFirestore.DocumentReference, job: PushJob) {
  const [user, subscriptions] = await Promise.all([
    db.doc(`users/${job.uid}`).get(),
    db.collection("pushSubscriptions").where("uid", "==", job.uid).where("status", "==", "active").get(),
  ]);
  if (!user.exists || user.get("status") !== "active" || subscriptions.empty) {
    await jobRef.set({ status: "skipped", skipReason: !user.exists || user.get("status") !== "active" ? "user_inactive" : "no_active_subscription", completedAt: FieldValue.serverTimestamp(), leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { delivered: 0, failed: 0 };
  }

  let delivered = 0;
  let transientFailures = 0;
  for (const subscription of subscriptions.docs) {
    const deliveryRef = db.doc(`pushDeliveries/${jobId}_${subscription.get("deviceId")}`);
    const reserved = await db.runTransaction(async (tx) => {
      const previous = await tx.get(deliveryRef);
      if (previous.exists && ["sending", "sent", "skipped"].includes(String(previous.get("status")))) return false;
      tx.set(deliveryRef, { jobId, uid: job.uid, subscriptionId: subscription.id, deviceId: subscription.get("deviceId"), status: "sending", attempts: FieldValue.increment(1), ...(job.isTestData ? { isTestData: true, demoSeedId: job.demoSeedId } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (!reserved) continue;
    try {
      await webpush.sendNotification({
        endpoint: String(subscription.get("endpoint")),
        expirationTime: subscription.get("expirationTime") as number | null,
        keys: subscription.get("keys") as { p256dh: string; auth: string },
      }, JSON.stringify(job.payload), { TTL: 60 * 60 * 24, urgency: "high" });
      await deliveryRef.set({ status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await subscription.ref.set({ failureCount: 0, lastSuccessAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      delivered += 1;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await Promise.all([
          deliveryRef.set({ status: "skipped", skipReason: "subscription_expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
          subscription.ref.set({ status: "revoked", revokedReason: "push_service_expired", revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
        ]);
      } else {
        transientFailures += 1;
        await deliveryRef.set({ status: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Push delivery failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  const attempts = job.attempts + 1;
  if (transientFailures && attempts < 5) {
    await jobRef.set({ status: "retry", attempts, nextAttemptAt: Timestamp.fromMillis(Date.now() + Math.min(30, 2 ** attempts) * 60_000), leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } else {
    await jobRef.set({ status: transientFailures ? "failed" : delivered ? "sent" : "skipped", attempts, deliveredCount: delivered, failedCount: transientFailures, completedAt: FieldValue.serverTimestamp(), leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { delivered, failed: transientFailures };
}

export async function processPushJobs() {
  if (!configureWebPush()) {
    await db.doc("systemHealth/push").set({ configured: false, lastCheckedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { processed: 0, delivered: 0, failed: 0, configured: false };
  }
  const now = Timestamp.now();
  const abandoned = await db.collection("pushJobs")
    .where("status", "==", "processing")
    .where("leaseUntil", "<=", now)
    .orderBy("leaseUntil", "asc")
    .limit(25)
    .get();
  if (!abandoned.empty) {
    const writer = db.bulkWriter();
    abandoned.docs.forEach((job) => writer.set(job.ref, { status: "retry", nextAttemptAt: now, leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await writer.close();
  }
  const jobs = await db.collection("pushJobs")
    .where("status", "in", ["queued", "retry"])
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt", "asc")
    .limit(25)
    .get();
  let processed = 0;
  let delivered = 0;
  let failed = 0;
  for (const snapshot of jobs.docs) {
    if (!(await claimPushJob(snapshot.ref))) continue;
    const result = await deliverPushJob(snapshot.id, snapshot.ref, snapshot.data() as PushJob);
    processed += 1;
    delivered += result.delivered;
    failed += result.failed;
  }
  await db.doc("systemHealth/push").set({ configured: true, lastSuccessAt: FieldValue.serverTimestamp(), processed, delivered, failed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { processed, delivered, failed, configured: true };
}
