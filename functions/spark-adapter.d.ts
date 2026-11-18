export interface SparkMaintenanceResult {
  skipped?: boolean;
  processedJobs?: number;
  deliveries?: number;
  digests?: number;
  reconciledTasks?: number;
}

export declare function invokeSparkCallable(
  name: string,
  data: unknown,
  idToken: string,
  appCheckToken?: string,
  onTiming?: (stage: "auth" | "rate-limit" | "handler", milliseconds: number) => void,
): Promise<unknown>;

export declare function verifySparkAppCheck(token?: string): Promise<void>;
export declare function verifySparkMaintenanceUser(idToken: string, appCheckToken?: string): Promise<void>;

export declare function verifySparkIdToken(idToken: string): Promise<{ uid: string }>;

export declare function shouldFlushPushAfterCallable(name: string): boolean;

export declare function runImmediatePushDelivery(): Promise<{
  mirroredPushJobs: number;
  push: {
    processed: number;
    delivered: number;
    failed: number;
    configured: boolean;
  };
}>;

export declare function runSparkMaintenance(
  mode?: "pulse" | "daily",
): Promise<SparkMaintenanceResult>;
