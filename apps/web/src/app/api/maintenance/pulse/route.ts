import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  try {
    const { runSparkMaintenance, verifySparkIdToken } = await import("@mba/functions/spark-adapter");
    await verifySparkIdToken(idToken);
    return NextResponse.json(await runSparkMaintenance("pulse"));
  } catch (error) {
    console.error("Spark maintenance pulse failed", error);
    const message = error instanceof Error ? error.message : "Maintenance failed";
    const status = message.includes("token") || message.includes("Authentication") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
