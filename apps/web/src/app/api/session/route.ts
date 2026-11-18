import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const started = performance.now();
  const timings: string[] = [];
  const headers = () => ({ "Cache-Control": "private, no-store", "Server-Timing": [...timings, `total;dur=${(performance.now() - started).toFixed(1)}`].join(", ") });
  try {
    const { loadSparkSession } = await import("@mba/functions/session");
    timings.push(`startup;dur=${(performance.now() - started).toFixed(1)}`);
    const authorization = request.headers.get("authorization") ?? "";
    const data = await loadSparkSession(authorization.startsWith("Bearer ") ? authorization.slice(7) : "", request.headers.get("x-firebase-appcheck") ?? undefined,
      (stage, milliseconds) => timings.push(`${stage};dur=${milliseconds.toFixed(1)}`));
    return NextResponse.json({ data }, { headers: headers() });
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    const code = candidate.code ?? "internal";
    const status = code.includes("unauthenticated") || code.startsWith("auth/") ? 401 : code.includes("permission-denied") ? 403 : code.includes("resource-exhausted") ? 429 : 500;
    if (status === 500) console.error("Session startup failed", error);
    return NextResponse.json({ error: { code, message: status === 500 ? "Could not load your account. Try again shortly." : candidate.message } }, { status, headers: headers() });
  }
}
