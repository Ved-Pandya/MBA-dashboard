import { after, NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function errorStatus(code: string | undefined) {
  if (code?.includes("unauthenticated") || code?.includes("id-token")) return 401;
  if (code?.includes("permission-denied")) return 403;
  if (code?.includes("not-found")) return 404;
  if (code?.includes("aborted")) return 409;
  if (code?.includes("already-exists")) return 409;
  if (code?.includes("resource-exhausted")) return 429;
  if (code?.includes("deadline-exceeded")) return 408;
  if (code?.includes("invalid-argument") || code?.includes("failed-precondition")) return 400;
  return 500;
}

export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const started = performance.now();
  const timings: string[] = [];
  try {
    const { invokeSparkCallable, runImmediatePushDelivery, shouldFlushPushAfterCallable } = await import("@mba/functions/spark-adapter");
    timings.push(`startup;dur=${(performance.now() - started).toFixed(1)}`);
    const { name } = await context.params;
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) return NextResponse.json({ error: { message: "Request is too large" } }, { status: 413 });
    let body: { data?: unknown };
    try { body = JSON.parse(rawBody); }
    catch { return NextResponse.json({ error: { message: "Request must contain valid JSON" } }, { status: 400 }); }
    const data = await invokeSparkCallable(name, body?.data, bearerToken(request), request.headers.get("x-firebase-appcheck") ?? undefined,
      (stage, milliseconds) => timings.push(`${stage};dur=${milliseconds.toFixed(1)}`));
    if (shouldFlushPushAfterCallable(name)) {
      after(async () => {
        try {
          await runImmediatePushDelivery();
        } catch (error) {
          // The Cloudflare maintenance pulse remains the durable retry path.
          console.error("Immediate push delivery failed; queued jobs remain available for scheduled retry", error);
        }
      });
    }
    timings.push(`total;dur=${(performance.now() - started).toFixed(1)}`);
    return NextResponse.json({ data }, { headers: { "Server-Timing": timings.join(", "), "Cache-Control": "private, no-store" } });
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    if (errorStatus(candidate.code) === 500) console.error("Callable operation failed", error);
    return NextResponse.json(
      { error: { code: candidate.code ?? "internal", message: errorStatus(candidate.code) === 500 ? "The server could not complete this request. Try again shortly." : candidate.message ?? "Unexpected server error" } },
      { status: errorStatus(candidate.code) },
    );
  }
}
