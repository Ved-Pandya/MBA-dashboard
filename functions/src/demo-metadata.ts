/** Carry provenance from the source when replacing a derived statistics document. */
export function demoMetadata(source: unknown) {
  const data = source as { isTestData?: unknown; demoSeedId?: unknown } | undefined;
  return data?.isTestData === true && typeof data.demoSeedId === "string"
    ? { isTestData: true, demoSeedId: data.demoSeedId }
    : {};
}

export const DEMO_STATS_SOURCES: Record<string, string> = {
  taskStats: "tasks", competitionStats: "competitions", internshipStats: "internships",
  competitionRoundStats: "competitionRounds", sessionStats: "sessionIntimations", pollStats: "generalPolls",
};
