// ─────────────────────────────────────────────
//  calculator.test.ts
//  Manual unit tests for the calculation logic.
//
//  Run with: npx ts-node calculator.test.ts
//  (from the server/ directory)
//
//  No test framework needed — just Node.js + TypeScript.
//  Output shows PASS / FAIL for each assertion.
// ─────────────────────────────────────────────

// We duplicate a minimal version of the types and logic here
// so this file can be run standalone without importing from src/

// ── Mini assertion helper ──────────────────────
let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n📋 ${name}`);
  fn();
}

// ── Inline calculator logic (copy from calculator.ts) ──
// We inline it here so this file is self-contained
const EMERGENCY_BUFFER_PERCENT = 0.2;
const MIN_EMERGENCY_BUFFER = 3000;

function calculateFinancials(input: any): any {
  const { monthlyIncome, currentSavings, useSavingsForGoal, expenses, goals } = input;

  const totalEssentialExpenses =
    expenses.rent + expenses.groceries + expenses.travel +
    expenses.bills + expenses.dailyNeeds + expenses.others;

  const disposableIncome = monthlyIncome - totalEssentialExpenses;
  const hasNegativeDisposable = disposableIncome <= 0;

  let emergencyBufferMonthly = 0;
  if (!hasNegativeDisposable) {
    emergencyBufferMonthly = Math.max(
      MIN_EMERGENCY_BUFFER,
      disposableIncome * EMERGENCY_BUFFER_PERCENT
    );
    emergencyBufferMonthly = Math.min(emergencyBufferMonthly, disposableIncome);
  }

  const safeMonthlysSavings = hasNegativeDisposable
    ? 0
    : Math.max(0, disposableIncome - emergencyBufferMonthly);

  const goalResults = goals.map((goal: any) => {
    const effectiveSavings = useSavingsForGoal ? currentSavings : 0;
    const amountCoveredBySavings = Math.min(effectiveSavings, goal.targetAmount);
    const amountNeededFromMonthlySavings = Math.max(0, goal.targetAmount - amountCoveredBySavings);

    if (amountNeededFromMonthlySavings <= 0) {
      return {
        goalId: goal.id, goalTitle: goal.title,
        targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
        isAchievable: true, monthsNeeded: 0, shortfallMonthly: 0,
        amountCoveredBySavings, amountNeededFromMonthlySavings: 0, revisedTimelineMonths: 0,
      };
    }

    if (safeMonthlysSavings <= 0) {
      return {
        goalId: goal.id, goalTitle: goal.title,
        targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
        isAchievable: false, monthsNeeded: -1,
        shortfallMonthly: goal.targetAmount / goal.timelineMonths,
        amountCoveredBySavings, amountNeededFromMonthlySavings, revisedTimelineMonths: -1,
      };
    }

    const monthsNeeded = Math.ceil(amountNeededFromMonthlySavings / safeMonthlysSavings);
    const isAchievable = monthsNeeded <= goal.timelineMonths;
    const shortfallMonthly = !isAchievable
      ? Math.max(0, (amountNeededFromMonthlySavings / goal.timelineMonths) - safeMonthlysSavings)
      : 0;

    return {
      goalId: goal.id, goalTitle: goal.title,
      targetAmount: goal.targetAmount, timelineMonths: goal.timelineMonths,
      isAchievable, monthsNeeded, shortfallMonthly,
      amountCoveredBySavings, amountNeededFromMonthlySavings, revisedTimelineMonths: monthsNeeded,
    };
  });

  return {
    monthlyIncome, totalEssentialExpenses, disposableIncome,
    emergencyBufferMonthly, safeMonthlysSavings, currentSavings,
    useSavingsForGoal, goalResults, hasNegativeDisposable,
  };
}

// ── Tests ──────────────────────────────────────

describe("Disposable Income Calculation", () => {
  const result = calculateFinancials({
    monthlyIncome: 50000,
    currentSavings: 0,
    useSavingsForGoal: false,
    expenses: {
      rent: 10000, groceries: 5000, travel: 2000,
      bills: 3000, dailyNeeds: 2000, others: 1000,
    },
    goals: [],
  });

  assert("Total expenses = sum of all expense fields", result.totalEssentialExpenses === 23000);
  assert("Disposable income = income - expenses", result.disposableIncome === 27000);
  assert("hasNegativeDisposable is false when income > expenses", !result.hasNegativeDisposable);
});

describe("Emergency Buffer Logic", () => {
  // 20% of 27000 = 5400, which is > 3000 min
  const result1 = calculateFinancials({
    monthlyIncome: 50000, currentSavings: 0, useSavingsForGoal: false,
    expenses: { rent: 10000, groceries: 5000, travel: 2000, bills: 3000, dailyNeeds: 2000, others: 1000 },
    goals: [],
  });
  assert("Buffer = 20% of disposable when > ₹3,000 minimum", result1.emergencyBufferMonthly === 5400);
  assert("Safe savings = disposable - buffer (27000 - 5400 = 21600)", result1.safeMonthlysSavings === 21600);

  // Test minimum buffer kicks in (very small disposable)
  const result2 = calculateFinancials({
    monthlyIncome: 25000, currentSavings: 0, useSavingsForGoal: false,
    expenses: { rent: 20000, groceries: 2000, travel: 500, bills: 500, dailyNeeds: 500, others: 500 },
    goals: [],
  });
  // Disposable = 1000; 20% = 200; min buffer = 3000; but buffer can't exceed disposable
  assert("Buffer capped at disposable when minimum > disposable", result2.emergencyBufferMonthly === 1000);
  assert("Safe savings = 0 when buffer consumes all disposable", result2.safeMonthlysSavings === 0);
});

describe("Negative Disposable Income", () => {
  const result = calculateFinancials({
    monthlyIncome: 20000, currentSavings: 5000, useSavingsForGoal: true,
    expenses: { rent: 12000, groceries: 5000, travel: 2000, bills: 2000, dailyNeeds: 1500, others: 500 },
    goals: [{ id: "g1", title: "Test Goal", type: "savings", targetAmount: 10000, timelineMonths: 3 }],
  });

  assert("hasNegativeDisposable = true when expenses > income", result.hasNegativeDisposable);
  assert("Safe monthly savings = 0 when income is negative", result.safeMonthlysSavings === 0);
  assert("Goal is not achievable", !result.goalResults[0].isAchievable);
  assert("monthsNeeded = -1 when saving is impossible", result.goalResults[0].monthsNeeded === -1);
});

describe("Goal Already Covered by Savings", () => {
  const result = calculateFinancials({
    monthlyIncome: 60000, currentSavings: 50000, useSavingsForGoal: true,
    expenses: { rent: 15000, groceries: 5000, travel: 2000, bills: 3000, dailyNeeds: 2000, others: 1000 },
    goals: [{ id: "g1", title: "Goa Trip", type: "domestic_trip", targetAmount: 30000, timelineMonths: 4 }],
  });

  assert("Goal is achievable (savings > target)", result.goalResults[0].isAchievable);
  assert("monthsNeeded = 0 when savings cover the goal", result.goalResults[0].monthsNeeded === 0);
  assert("amountCoveredBySavings = targetAmount", result.goalResults[0].amountCoveredBySavings === 30000);
  assert("amountNeededFromMonthlySavings = 0", result.goalResults[0].amountNeededFromMonthlySavings === 0);
});

describe("Savings Excluded from Goal (useSavingsForGoal = false)", () => {
  const result = calculateFinancials({
    monthlyIncome: 60000, currentSavings: 50000, useSavingsForGoal: false, // key test
    expenses: { rent: 15000, groceries: 5000, travel: 2000, bills: 3000, dailyNeeds: 2000, others: 1000 },
    goals: [{ id: "g1", title: "Goa Trip", type: "domestic_trip", targetAmount: 30000, timelineMonths: 4 }],
  });
  // Disposable = 32000, buffer = 6400, savings capacity = 25600
  // amountCoveredBySavings = 0 (excluded), needs 30000 from monthly
  // monthsNeeded = ceil(30000 / 25600) = 2

  assert("amountCoveredBySavings = 0 when savings excluded", result.goalResults[0].amountCoveredBySavings === 0);
  assert("Full target amount needed from monthly savings", result.goalResults[0].amountNeededFromMonthlySavings === 30000);
  assert("Goal still achievable (2 months ≤ 4 month target)", result.goalResults[0].isAchievable);
});

describe("Goal Not Achievable in Timeline", () => {
  const result = calculateFinancials({
    monthlyIncome: 40000, currentSavings: 0, useSavingsForGoal: false,
    expenses: { rent: 15000, groceries: 5000, travel: 2000, bills: 3000, dailyNeeds: 2000, others: 1000 },
    goals: [{ id: "g1", title: "International Trip", type: "international_trip", targetAmount: 150000, timelineMonths: 4 }],
  });
  // Disposable = 12000, buffer = 3000 (min; 20% of 12000 = 2400 < 3000), savings = 9000
  // monthsNeeded = ceil(150000 / 9000) = 17

  assert("Goal is not achievable in 4 months", !result.goalResults[0].isAchievable);
  assert("monthsNeeded = 17 (realistic timeline)", result.goalResults[0].monthsNeeded === 17);
  assert("revisedTimelineMonths = 17", result.goalResults[0].revisedTimelineMonths === 17);
  assert("shortfallMonthly > 0", result.goalResults[0].shortfallMonthly > 0);
});

describe("Multiple Goals", () => {
  const result = calculateFinancials({
    monthlyIncome: 55000, currentSavings: 20000, useSavingsForGoal: true,
    expenses: { rent: 12000, groceries: 5000, travel: 2500, bills: 3000, dailyNeeds: 2000, others: 1000 },
    goals: [
      { id: "g1", title: "Phone", type: "gadget", targetAmount: 15000, timelineMonths: 3 },
      { id: "g2", title: "Vacation", type: "domestic_trip", targetAmount: 40000, timelineMonths: 6 },
    ],
  });

  assert("Correct number of goal results returned", result.goalResults.length === 2);
  // Phone: savings cover ₹15,000 fully → achievable (monthsNeeded = 0)
  assert("Phone goal: covered by savings", result.goalResults[0].monthsNeeded === 0);
  // Vacation: savings covered ₹15k, remaining ₹5k from savings covered phone, 
  // savings left = 20000 - 15000 = 5000 for vacation; wait — savings is shared vs per goal
  // Actually savings is applied per-goal independently (each goal sees full savings)
  // Vacation: savings cover ₹20k of ₹40k; needs ₹20k more
  // Disposable = 29500, buffer = 5900, savings capacity = 23600
  // monthsNeeded = ceil(20000 / 23600) = 1
  assert("Vacation goal: achievable within 6 months", result.goalResults[1].isAchievable);
});

// ── Results summary ─────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 All tests passed!\n");
} else {
  console.log("⚠️  Some tests failed. Check the output above.\n");
  process.exit(1);
}
