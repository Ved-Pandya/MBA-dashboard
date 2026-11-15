import { spawnSync } from "node:child_process";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Run npm run test:emulators so checks cannot connect to live services.");
}
for (const [script, workspace] of [["test:rules", "@mba/functions"], ["test:integration", "@mba/functions"], ["test:e2e", "@mba/web"]]) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", script, "-w", workspace], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
