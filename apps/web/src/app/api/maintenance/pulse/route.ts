import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  try {
    const { runSparkMaintenance, verifySparkMaintenanceUser } = await import("@mba/functions/spark-adapter");
    const schedulerAuthorized = Boolean(process.env.CRON_SECRET && idToken === process.env.CRON_SECRET);
    if (!schedulerAuthorized) await verifySparkMaintenanceUser(idToken, request.headers.get("x-firebase-appcheck") ?? undefined);
    return NextResponse.json(await runSparkMaintenance("pulse"));
  } catch (error) {
    console.error("Spark maintenance pulse failed", error);
    const message = error instanceof Error ? error.message : "Maintenance failed";
    const code = (error as { code?: string }).code;
    const status = code === "permission-denied" ? 403 : code?.includes("unauthenticated") || code?.includes("id-token") ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? "Maintenance could not complete. It will retry automatically." : message }, { status });
  }
}
