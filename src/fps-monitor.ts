export const FPS_SAMPLE_INTERVAL_MS = 250;

export type FpsLevel = "good" | "warning" | "poor";

export function getFpsLevel(fps: number): FpsLevel {
  if (fps >= 50) return "good";
  if (fps >= 30) return "warning";
  return "poor";
}

export function formatFps(fps: number): string {
  return Number.isFinite(fps) && fps >= 0 ? String(Math.round(fps)) : "--";
}
