import type { RollEntry } from "./types";

// One round of initiative for a full table adds a line per combatant.
const MAX_ROLLS = 80;
/** Most rolls accepted from one shared message. */
export const MAX_BATCH = 40;
const key = (roomId: string) => `tirada/rolls/${roomId}`;

/** Validates a roll that arrived from another client. */
export function parseRoll(raw: unknown): RollEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.playerId !== "string") return null;
  if (typeof r.playerName !== "string" || typeof r.notation !== "string") return null;
  if (typeof r.total !== "number" || typeof r.modifier !== "number" || typeof r.time !== "number") return null;
  if (!Array.isArray(r.dice) || r.dice.length > 64) return null;
  const dice = [];
  for (const d of r.dice as unknown[]) {
    if (typeof d !== "object" || d === null) return null;
    const die = d as Record<string, unknown>;
    if (typeof die.sides !== "number" || typeof die.value !== "number") return null;
    dice.push({ sides: die.sides, value: die.value, ...(die.dropped === true ? { dropped: true } : {}) });
  }
  return {
    id: r.id.slice(0, 64),
    playerId: r.playerId.slice(0, 64),
    playerName: r.playerName.slice(0, 60),
    color: typeof r.color === "string" ? r.color.slice(0, 32) : "#888888",
    ...(typeof r.label === "string" && r.label ? { label: r.label.slice(0, 80) } : {}),
    ...(r.kind === "initiative" ? { kind: "initiative" as const } : {}),
    notation: r.notation.slice(0, 80),
    dice,
    modifier: r.modifier,
    total: r.total,
    hidden: r.hidden === true,
    time: r.time,
  };
}

/** Validates a shared message: one roll, or a list of rolls made together. */
export function parseRolls(raw: unknown): RollEntry[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_BATCH) : [raw];
  return list.flatMap((item) => parseRoll(item) ?? []);
}

/** Newest first, without duplicates, limited to the last rolls. */
export function mergeRolls(current: readonly RollEntry[], incoming: readonly RollEntry[]): RollEntry[] {
  const byId = new Map<string, RollEntry>();
  for (const roll of [...incoming, ...current]) if (!byId.has(roll.id)) byId.set(roll.id, roll);
  return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, MAX_ROLLS);
}

export function loadHistory(roomId: string): RollEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(roomId)) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => parseRoll(r) ?? []);
  } catch {
    return [];
  }
}

export function appendHistory(roomId: string, rolls: readonly RollEntry[]): void {
  if (rolls.length === 0) return;
  try {
    localStorage.setItem(key(roomId), JSON.stringify(mergeRolls(loadHistory(roomId), rolls)));
  } catch {
    // Storage can be blocked inside an embedded page. The log then lives in memory only.
  }
}

export function isHistoryKey(roomId: string, storageKey: string | null): boolean {
  return storageKey === key(roomId);
}
