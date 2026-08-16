# DeadlineOS free scheduler

This Worker wakes the Spark-compatible Vercel maintenance route every five minutes.

Prerequisites: a free Cloudflare account and a deployed HTTPS Vercel production URL.

```powershell
cd infra/cloudflare-scheduler
npx wrangler login
npx wrangler secret put DEADLINEOS_URL
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

When Wrangler prompts for `DEADLINEOS_URL`, enter only the production origin, for example `https://mba-dashboard.example.com`, with no path. For `CRON_SECRET`, use exactly the same long random value configured in Vercel. Never commit either value.

After deployment, open Cloudflare Dashboard > Workers & Pages > deadlineos-scheduler > Triggers and confirm the `*/5 * * * *` Cron Trigger is present. The Worker's public URL is only a status response; it cannot manually invoke privileged maintenance.
