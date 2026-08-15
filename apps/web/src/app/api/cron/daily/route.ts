import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { runSparkMaintenance } = await import("@mba/functions/spark-adapter");
    return NextResponse.json(await runSparkMaintenance("daily"));
  } catch (error) {
    console.error("Spark daily maintenance failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Maintenance failed" },
      { status: 500 },
    );
  }
}
