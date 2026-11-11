/** The `query` tool's limits (ADR 0014). */
export const queryLimits = {
  maxRows: 1000,
  maxCharacters: 40_000,
  timeLimitSeconds: 30,
} as const;

/** Formats a count for text the agent reads, with thousands separators. */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}
