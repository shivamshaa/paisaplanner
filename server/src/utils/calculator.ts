// ─────────────────────────────────────────────
//  calculator.ts — Pure rule-based financial logic
//  NO AI here. All math lives in this file.
// ─────────────────────────────────────────────

import { FinancialInput, CalculationResult, GoalResult } from "../types";

const EMERGENCY_BUFFER_PERCENT = 0.2;
const MIN_EMERGENCY_BUFFER = 3000;

export function calculateFinancials(input: FinancialInput): CalculationResult {
  const { monthlyIncome, currentSavings, useSavingsForGoal, expenses, investments, goals } = input;

  // Step 1: Essential expenses
  const totalEssentialExpenses =
    expenses.rent + expenses.groceries + expenses.travel +
    expenses.bills + expenses.dailyNeeds + expenses.others;

  // Step 2: Monthly investments (SIP, RD, PPF etc.)
  // Treated as committed outflows — wealth-building, not wasteful spending
  const totalMonthlyInvestments = investments
    ? investments.sip + investments.rd + investments.ppf +
      investments.nps + investments.stocks + investments.others
    : 0;

  // Step 3: Disposable income
  // Investments are subtracted AFTER expenses — they are allocated before goal savings
  const disposableIncome = monthlyIncome - totalEssentialExpenses - totalMonthlyInvestments;
  const hasNegativeDisposable = disposableIncome <= 0;

  // Step 4: Emergency buffer
  let emergencyBufferMonthly = 0;
  if (!hasNegativeDisposable) {
    emergencyBufferMonthly = Math.max(
      MIN_EMERGENCY_BUFFER,
      disposableIncome * EMERGENCY_BUFFER_PERCENT
    );
    emergencyBufferMonthly = Math.min(emergencyBufferMonthly, disposableIncome);
  }

  // Step 5: Safe monthly savings for goals
  const safeMonthlysSavings = hasNegativeDisposable
    ? 0
    : Math.max(0, disposableIncome - emergencyBufferMonthly);

  // Step 6: Per-goal calculations
  const goalResults: GoalResult[] = goals.map((goal) =>
    calculateGoal(goal, currentSavings, useSavingsForGoal, safeMonthlysSavings)
  );

  return {
    monthlyIncome,
    totalEssentialExpenses,
    totalMonthlyInvestments,
    disposableIncome,
    emergencyBufferMonthly,
    safeMonthlysSavings,
    currentSavings,
    useSavingsForGoal,
    goalResults,
    hasNegativeDisposable,
  };
}

function calculateGoal(
  goal: { id: string; title: string; type: any; targetAmount: number; timelineMonths: number },
  currentSavings: number,
  useSavingsForGoal: boolean,
  safeMonthlysSavings: number
): GoalResult {
  const effectiveSavings = useSavingsForGoal ? currentSavings : 0;
  const amountCoveredBySavings = Math.min(effectiveSavings, goal.targetAmount);
  const amountNeededFromMonthlySavings = Math.max(0, goal.targetAmount - amountCoveredBySavings);

  if (amountNeededFromMonthlySavings <= 0) {
    return {
      goalId: goal.id, goalTitle: goal.title, goalType: goal.type,
      targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
      isAchievable: true, monthsNeeded: 0, shortfallMonthly: 0,
      amountCoveredBySavings, amountNeededFromMonthlySavings: 0, revisedTimelineMonths: 0,
    };
  }

  if (safeMonthlysSavings <= 0) {
    return {
      goalId: goal.id, goalTitle: goal.title, goalType: goal.type,
      targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
      isAchievable: false, monthsNeeded: -1,
      shortfallMonthly: goal.targetAmount / goal.timelineMonths,
      amountCoveredBySavings, amountNeededFromMonthlySavings, revisedTimelineMonths: -1,
    };
  }

  const monthsNeeded = Math.ceil(amountNeededFromMonthlySavings / safeMonthlysSavings);
  const isAchievable = monthsNeeded <= goal.timelineMonths;
  const shortfallMonthly = !isAchievable
    ? Math.max(0, amountNeededFromMonthlySavings / goal.timelineMonths - safeMonthlysSavings)
    : 0;

  return {
    goalId: goal.id, goalTitle: goal.title, goalType: goal.type,
    targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
    isAchievable, monthsNeeded, shortfallMonthly,
    amountCoveredBySavings, amountNeededFromMonthlySavings, revisedTimelineMonths: monthsNeeded,
  };
}