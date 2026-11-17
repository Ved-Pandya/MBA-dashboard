/** Progress comes from saved completions; reopening cannot farm XP. */
export function questProgress(completed: number) {
  const count = Math.max(0, Math.floor(completed));
  return { xp: count * 25, level: Math.floor(count / 5) + 1, steps: count % 5, remaining: 5 - count % 5 };
}
