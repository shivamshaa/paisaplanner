// ─────────────────────────────────────────────
//  utils/storage.ts
//  All localStorage read/write operations.
//  Single source of truth for persisted data.
//
//  Keys used:
//    mm_profile   → SavedProfile
//    mm_goals     → GoalWithProgress[]
//    mm_audits    → AuditResult[]
// ─────────────────────────────────────────────

import {
  SavedProfile,
  GoalWithProgress,
  AuditResult,
  GoalContribution,
  Goal,
  CalculationResult,
  Expenses,
  MonthlyInvestments,
} from "../types";

const KEYS = {
  PROFILE: "mm_profile",
  GOALS:   "mm_goals",
  AUDITS:  "mm_audits",
} as const;

// ── Helpers ────────────────────────────────────

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Storage write failed for key "${key}":`, e);
  }
}

// ── Month key utilities ─────────────────────────
// Month keys are "YYYY-MM" strings, e.g. "2025-07"

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthKey(key: string): string {
  // "2025-07" → "July 2025"
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function getPreviousMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 2, 1); // month-2 because month is 1-indexed
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Profile ────────────────────────────────────

export function getProfile(): SavedProfile | null {
  return readJSON<SavedProfile>(KEYS.PROFILE);
}

export function saveProfile(
  input: {
    monthlyIncome: number;
    currentSavings: number;
    useSavingsForGoal: boolean;
    expenses: Expenses;
    investments: MonthlyInvestments;
  },
  calculationResult: CalculationResult
): void {
  const profile: SavedProfile = {
    ...input,
    calculationResult,
    savedAt: new Date().toISOString(),
  };
  writeJSON(KEYS.PROFILE, profile);
}

export function hasProfile(): boolean {
  return getProfile() !== null;
}

export function clearProfile(): void {
  localStorage.removeItem(KEYS.PROFILE);
}

// ── Goals ──────────────────────────────────────

export function getGoals(): GoalWithProgress[] {
  return readJSON<GoalWithProgress[]>(KEYS.GOALS) ?? [];
}

export function saveGoals(goals: GoalWithProgress[]): void {
  writeJSON(KEYS.GOALS, goals);
}

// Convert plain Goal[] (from setup flow) into GoalWithProgress[]
// and merge with any existing contribution history
export function initGoalsFromSetup(goals: Goal[]): void {
  const existing = getGoals();
  const existingMap = new Map(existing.map((g) => [g.id, g]));

  const merged: GoalWithProgress[] = goals.map((g) => {
    const prev = existingMap.get(g.id);
    return {
      ...g,
      contributions: prev?.contributions ?? [],
      totalSaved: prev?.totalSaved ?? 0,
    };
  });

  saveGoals(merged);
}

export function addGoalContribution(
  goalId: string,
  contribution: Omit<GoalContribution, "id">
): void {
  const goals = getGoals();
  const updated = goals.map((g) => {
    if (g.id !== goalId) return g;
    const newContribution: GoalContribution = {
      ...contribution,
      id: `contrib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    const totalSaved = g.totalSaved + contribution.amount;
    return {
      ...g,
      contributions: [...g.contributions, newContribution],
      totalSaved,
    };
  });
  saveGoals(updated);
}

export function removeGoalContribution(goalId: string, contributionId: string): void {
  const goals = getGoals();
  const updated = goals.map((g) => {
    if (g.id !== goalId) return g;
    const removed = g.contributions.find((c) => c.id === contributionId);
    return {
      ...g,
      contributions: g.contributions.filter((c) => c.id !== contributionId),
      totalSaved: Math.max(0, g.totalSaved - (removed?.amount ?? 0)),
    };
  });
  saveGoals(updated);
}

// ── Audits ─────────────────────────────────────

export function getAudits(): AuditResult[] {
  return readJSON<AuditResult[]>(KEYS.AUDITS) ?? [];
}

export function saveAudit(audit: AuditResult): void {
  const audits = getAudits();
  // Replace if one already exists for this month, otherwise prepend
  const idx = audits.findIndex((a) => a.monthKey === audit.monthKey);
  if (idx >= 0) {
    audits[idx] = audit;
  } else {
    audits.unshift(audit); // newest first
  }
  writeJSON(KEYS.AUDITS, audits);
}

export function getAuditForMonth(monthKey: string): AuditResult | null {
  const audits = getAudits();
  return audits.find((a) => a.monthKey === monthKey) ?? null;
}

export function deleteAudit(auditId: string): void {
  const audits = getAudits().filter((a) => a.id !== auditId);
  writeJSON(KEYS.AUDITS, audits);
}

// ── Full reset ─────────────────────────────────

export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}