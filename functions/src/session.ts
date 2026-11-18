import { loadActivatedProfile } from "./account.js";
import { enforceSparkRateLimit, verifySparkIdToken, verifySparkAppCheck } from "./spark-auth.js";

export async function loadSparkSession(idToken: string, appCheckToken?: string, onTiming?: (stage: "auth" | "rate-limit" | "profile", milliseconds: number) => void) {
  const authStarted = performance.now();
  const [token] = await Promise.all([verifySparkIdToken(idToken), verifySparkAppCheck(appCheckToken)]);
  onTiming?.("auth", performance.now() - authStarted);
  const rateStarted = performance.now();
  await enforceSparkRateLimit(token.uid);
  onTiming?.("rate-limit", performance.now() - rateStarted);
  const profileStarted = performance.now();
  const profile = await loadActivatedProfile({ uid: token.uid, token, rawToken: idToken });
  onTiming?.("profile", performance.now() - profileStarted);
  return { profile };
}
