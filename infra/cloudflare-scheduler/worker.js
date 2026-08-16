export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(wakeDeadlineOs(env));
  },
  async fetch() {
    return Response.json({ ok: true, service: "DeadlineOS scheduler", note: "Maintenance runs only from the Cron Trigger." });
  },
};

async function wakeDeadlineOs(env) {
  if (!env.DEADLINEOS_URL || !env.CRON_SECRET) throw new Error("DEADLINEOS_URL and CRON_SECRET secrets are required");
  const endpoint = new URL("/api/maintenance/pulse", env.DEADLINEOS_URL);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!response.ok) throw new Error(`DeadlineOS maintenance returned HTTP ${response.status}`);
  return response.status;
}
