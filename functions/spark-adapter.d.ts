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
): Promise<unknown>;

export declare function verifySparkIdToken(idToken: string): Promise<{ uid: string }>;

export declare function runSparkMaintenance(
  mode?: "pulse" | "daily",
): Promise<SparkMaintenanceResult>;
