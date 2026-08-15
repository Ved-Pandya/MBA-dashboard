import { NextResponse, type NextRequest } from "next/server";

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
  if (code?.includes("invalid-argument") || code?.includes("failed-precondition")) return 400;
  return 500;
}

export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  try {
    const { invokeSparkCallable } = await import("@mba/functions/spark-adapter");
    const { name } = await context.params;
    const body = await request.json() as { data?: unknown };
    const data = await invokeSparkCallable(name, body.data, bearerToken(request));
    return NextResponse.json({ data });
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    return NextResponse.json(
      { error: { code: candidate.code ?? "internal", message: candidate.message ?? "Unexpected server error" } },
      { status: errorStatus(candidate.code) },
    );
  }
}
