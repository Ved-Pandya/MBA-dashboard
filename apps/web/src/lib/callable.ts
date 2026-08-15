"use client";

import { getFirebase } from "./firebase";

export async function callFunction<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error("Sign in is required");
  const idToken = await user.getIdToken();
  const response = await fetch(`/api/call/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
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

export function readableError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/^Firebase:\s*/i, "");
  return "Something went wrong. Please try again.";
}
