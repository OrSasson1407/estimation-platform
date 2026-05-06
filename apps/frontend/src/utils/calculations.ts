// apps/frontend/src/utils/calculations.ts  ← NEW
export const calcConfidenceColor = (score: number): string => {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-500';
  return 'text-red-500';
};

export const calcConfidenceLabel = (score: number): string => {
  if (score >= 0.8) return 'High';
  if (score >= 0.6) return 'Medium';
  return 'Low';
};

export const calcVelocityTrend = (
  history: { completedPoints: number }[],
): 'up' | 'down' | 'stable' => {
  if (history.length < 2) return 'stable';
  const last = history[history.length - 1].completedPoints;
  const prev = history[history.length - 2].completedPoints;
  const delta = (last - prev) / Math.max(prev, 1);
  if (delta > 0.05) return 'up';
  if (delta < -0.05) return 'down';
  return 'stable';
};

export const calcBurnoutColor = (risk: string): string => {
  const map: Record<string, string> = {
    LOW: 'text-green-600',
    MODERATE: 'text-yellow-500',
    HIGH: 'text-orange-500',
    CRITICAL: 'text-red-600',
  };
  return map[risk] ?? 'text-gray-500';
};

export const calcSprintCompletionPct = (completed: number, planned: number): number =>
  planned > 0 ? Math.round((completed / planned) * 100) : 0;

export const calcThreePointEstimate = (
  optimistic: number,
  expected: number,
  pessimistic: number,
): number =>
  // PERT formula: (O + 4M + P) / 6
  parseFloat(((optimistic + 4 * expected + pessimistic) / 6).toFixed(2));
