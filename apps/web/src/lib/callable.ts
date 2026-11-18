"use client";

import { getFirebase } from "./firebase";

export async function authenticatedHeaders() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error("Sign in is required");
  const idToken = await user.getIdToken();
  let appCheckToken: string | undefined;
  if (process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY) {
    const { getToken } = await import("firebase/app-check");
    const appCheck = getFirebase().appCheck;
    if (appCheck) appCheckToken = (await getToken(appCheck)).token;
  }
  return {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}),
  };
}

export async function callFunction<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  const response = await fetch(`/api/call/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: await authenticatedHeaders(),
    body: JSON.stringify({ data: input }),
  });
  const responseText = await response.text();
  let payload: { data?: TOutput; error?: { message?: string } };
  try {
    payload = JSON.parse(responseText) as typeof payload;
  } catch {
    throw new Error(`Server request failed with HTTP ${response.status}. Check the Vercel Function logs.`);
  }
  if (!response.ok) throw new Error(payload.error?.message ?? "The server operation failed");
  return payload.data as TOutput;
}

const pendingReads = new Map<string, Promise<unknown>>();

/** Share identical concurrent report reads, including Strict Mode's repeated mount.
 * Results are not retained here or persisted across signed-in sessions. */
export function readReport<TInput, TOutput>(name: "getWingOpportunityReport" | "getCurrentTaskCompliance", input: TInput): Promise<TOutput> {
  const uid = getFirebase().auth.currentUser?.uid;
  if (!uid) return Promise.reject(new Error("Sign in is required"));
  const key = `${uid}:${name}:${JSON.stringify(input)}`;
  const pending = pendingReads.get(key);
  if (pending) return pending as Promise<TOutput>;
  const request = callFunction<TInput, TOutput>(name, input).finally(() => { pendingReads.delete(key); });
  pendingReads.set(key, request);
  return request;
}

export function readableError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/^Firebase:\s*/i, "");
  return "Something went wrong. Please try again.";
}
