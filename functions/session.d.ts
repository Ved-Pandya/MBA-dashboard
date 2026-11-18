import type { UserProfile } from "@mba/domain";
export declare function loadSparkSession(
  idToken: string,
  appCheckToken?: string,
  onTiming?: (stage: "auth" | "rate-limit" | "profile", milliseconds: number) => void,
): Promise<{ profile: UserProfile }>;
