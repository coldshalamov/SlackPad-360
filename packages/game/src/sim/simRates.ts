/** Defensive normalization shared by world stepping, CCD, and collider events. */
export function positiveSubstepCount(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
