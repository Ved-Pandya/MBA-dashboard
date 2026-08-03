import { runSparkMaintenance, verifySparkIdToken } from "@mba/functions/spark-adapter";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  try {
    await verifySparkIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSparkMaintenance("pulse"));
  } catch (error) {
    console.error("Spark maintenance pulse failed", error);
    return NextResponse.json({ error: "Maintenance failed" }, { status: 500 });
  }
}
