export interface RankingEntry {
  rank: number;
  name: string;
  score: number;
  stage: number;
  durationMs: number | null;
}

export interface SubmitRankingResult {
  ranked: boolean;
  rank: number | null;
  score: number;
  stage: number;
  durationMs: number;
  message?: string;
}

const DEFAULT_RANKING_URL = "../breakoutranking/ranking.php";
const REQUEST_TIMEOUT_MS = 5000;
const rankingUrl = (import.meta.env.VITE_RANKING_URL || DEFAULT_RANKING_URL).trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRankingEntry(value: unknown, index: number): RankingEntry | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name : "";
  const score = Number(value.score);
  const stage = Number(value.stage ?? 1);
  const durationMs = value.durationMs === null || value.durationMs === undefined ? null : Number(value.durationMs);
  if (!name || !Number.isFinite(score) || !Number.isFinite(stage)) return null;
  if (durationMs !== null && (!Number.isFinite(durationMs) || durationMs < 0)) return null;
  return {
    rank: Number(value.rank) || index + 1,
    name,
    score: Math.max(0, Math.floor(score)),
    stage: Math.max(1, Math.floor(stage)),
    durationMs: durationMs === null ? null : Math.floor(durationMs),
  };
}

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${rankingUrl}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isRecord(body) && body.ok === true ? body : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 20);
}

export function estimateRankingPosition(entries: RankingEntry[], score: number): number {
  return entries.filter((entry) => entry.score > score).length + 1;
}

export async function fetchTopRanking(limit = 10): Promise<RankingEntry[] | null> {
  const body = await request(`?action=list&limit=${Math.min(30, Math.max(1, Math.floor(limit)))}`);
  if (!body || !Array.isArray(body.ranking)) return null;
  return body.ranking
    .map((entry, index) => toRankingEntry(entry, index))
    .filter((entry): entry is RankingEntry => entry !== null);
}

export async function submitRanking(options: {
  name: string;
  score: number;
  stage: number;
  durationMs: number;
}): Promise<SubmitRankingResult | null> {
  const name = normalizePlayerName(options.name);
  const score = Math.floor(options.score);
  const stage = Math.floor(options.stage);
  const durationMs = Math.floor(options.durationMs);
  if (!name || score < 1 || stage < 1 || !Number.isFinite(durationMs) || durationMs < 0) return null;

  const body = await request("?action=submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, score, stage, durationMs }),
  });
  if (!body || typeof body.ranked !== "boolean") return null;
  return {
    ranked: body.ranked,
    rank: body.rank === null || body.rank === undefined ? null : Number(body.rank),
    score: Number(body.score ?? score),
    stage: Number(body.stage ?? stage),
    durationMs: Number(body.durationMs ?? durationMs),
    message: typeof body.message === "string" ? body.message : undefined,
  };
}
