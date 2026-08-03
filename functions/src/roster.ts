import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { rollNumberToAuthEmail, rosterRowSchema } from "@mba/domain";
import { adminAuth, db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit } from "./helpers.js";

const rosterInputSchema = z.object({ rows: z.array(rosterRowSchema).min(1).max(1_000) });

function validateUniqueRows(rows: z.infer<typeof rosterRowSchema>[]) {
  const rolls = new Set<string>();
  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (rolls.has(row.rollNumber)) errors.push(`Row ${index + 1}: duplicate roll number ${row.rollNumber}`);
    rolls.add(row.rollNumber);
  });
  return errors;
}

export const validateRosterImport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request, true);
    requireAdmin(actor);
    const parsed = rosterInputSchema.parse(request.data);
    const errors = validateUniqueRows(parsed.rows);
    return {
      valid: errors.length === 0,
      errors,
      summary: {
        total: parsed.rows.length,
        sectionA: parsed.rows.filter((row) => row.sectionId === "A").length,
        sectionB: parsed.rows.filter((row) => row.sectionId === "B").length,
        crs: parsed.rows.filter((row) => row.cr).length,
        pocs: parsed.rows.filter((row) => row.wingPocWings.length || row.subjectPocOfferings.length).length,
      },
    };
  } catch (error) {
    asHttpsError(error);
  }
});

export const commitRosterImport = onCall({ ...callableOptions, timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  try {
    const actor = await requireActor(request, true);
    requireAdmin(actor);
    const { rows } = rosterInputSchema.parse(request.data);
    const errors = validateUniqueRows(rows);
    if (errors.length) throw new HttpsError("invalid-argument", errors.join("; "));

    const writer = db.bulkWriter();
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const authEmail = rollNumberToAuthEmail(row.rollNumber);
      let user = null;
      try {
        user = await adminAuth.getUserByEmail(authEmail);
      } catch (lookupError) {
        if ((lookupError as { code?: string }).code !== "auth/user-not-found") throw lookupError;
      }
      if (user) {
        user = await adminAuth.updateUser(user.uid, { password: row.password, displayName: row.displayName });
        updated += 1;
      } else {
        user = await adminAuth.createUser({ email: authEmail, password: row.password, displayName: row.displayName, emailVerified: true });
        created += 1;
      }
      const profileRef = db.doc(`users/${user.uid}`);
      const existingProfile = await profileRef.get();
      writer.set(
        profileRef,
        {
          authEmail,
          displayName: row.displayName,
          rollNumber: row.rollNumber,
          status: existingProfile.exists ? existingProfile.get("status") : "invited",
          sectionId: row.sectionId,
          wingId: row.wingId,
          roles: { student: true, cr: row.cr, systemAdmin: row.rollNumber === actor.rollNumber },
          scopes: {
            crSections: row.cr ? { [row.sectionId]: true } : {},
            wingPocWings: Object.fromEntries(row.wingPocWings.map((id) => [id, true])),
            subjectPocOfferings: Object.fromEntries(row.subjectPocOfferings.map((id) => [id, true])),
          },
          updatedAt: FieldValue.serverTimestamp(),
          ...(existingProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
    }
    await writer.close();
    await db.doc("appConfig/current").set(
      { rosterVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await writeAudit({ actorUid: actor.uid, action: "roster.imported", resourceType: "roster", resourceId: "current", after: { created, updated, total: rows.length } });
    return { created, updated, total: rows.length };
  } catch (error) {
    asHttpsError(error);
  }
});

const roleUpdateSchema = z.object({
  uid: z.string().min(1),
  cr: z.boolean(),
  systemAdmin: z.boolean().default(false),
  crSections: z.record(z.literal(true)),
  wingPocWings: z.record(z.literal(true)),
  subjectPocOfferings: z.record(z.literal(true)),
});

export const updateRoleAssignments = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireAdmin(actor);
    const input = roleUpdateSchema.parse(request.data);
    const ref = db.doc(`users/${input.uid}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "User not found");
    const roles = { student: true, cr: input.cr, systemAdmin: input.systemAdmin };
    const scopes = {
      crSections: input.crSections,
      wingPocWings: input.wingPocWings,
      subjectPocOfferings: input.subjectPocOfferings,
    };
    await ref.update({ roles, scopes, updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "roles.updated", resourceType: "user", resourceId: input.uid, before: before.data(), after: { roles, scopes } });
    return { ok: true };
  } catch (error) {
    asHttpsError(error);
  }
});
