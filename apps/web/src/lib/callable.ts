"use client";

import { getFirebaseAuth } from "./firebase-auth";

export async function authenticatedHeaders() {
  const user = getFirebaseAuth().auth.currentUser;
  if (!user) throw new Error("Sign in is required");
  const appCheckTokenRequest = async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY) return undefined;
    const { getToken } = await import("firebase/app-check");
    const appCheck = getFirebaseAuth().appCheck;
    return appCheck ? (await getToken(appCheck)).token : undefined;
  };
  const [idToken, appCheckToken] = await Promise.all([user.getIdToken(), appCheckTokenRequest()]);
  return {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}),
  };
}

export async function callFunction<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  return requestData<TOutput>(`/api/call/${encodeURIComponent(name)}`, input);
}

export async function loadSession(): Promise<{ profile: import("./models").Profile }> {
  return requestData("/api/session", {});
}

async function requestData<TOutput>(url: string, input: unknown): Promise<TOutput> {
  const response = await fetch(url, {
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
  const uid = getFirebaseAuth().auth.currentUser?.uid;
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
