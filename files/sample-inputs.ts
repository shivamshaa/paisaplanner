// ─────────────────────────────────────────────
//  sample-inputs.ts
//
//  Sample test inputs you can use to manually test
//  the app, understand the calculation logic, or
//  seed the UI for a demo.
//
//  To use these as a quick API test:
//    curl -X POST http://localhost:3001/api/analyze \
//      -H "Content-Type: application/json" \
//      -d @sample-inputs.json
//
//  Or paste any scenario directly into the UI form.
// ─────────────────────────────────────────────

import { FinancialInput } from "../server/src/types";

// ── Scenario 1: Comfortable income, achievable goals ──
// Mid-level software developer in a metro city.
// A Goa trip is realistic; an international trip is not.
export const scenario1_ComfortableIncome: FinancialInput = {
  monthlyIncome: 75000,
  currentSavings: 50000,
  useSavingsForGoal: true,
  expenses: {
    rent: 18000,
    groceries: 6000,
    travel: 3000,
    bills: 4000,
    dailyNeeds: 3000,
    others: 2000,
  },
  goals: [
    {
      id: "g1",
      title: "Goa Trip",
      type: "domestic_trip",
      targetAmount: 30000,
      timelineMonths: 3,
    },
    {
      id: "g2",
      title: "International Trip to Thailand",
      type: "international_trip",
      targetAmount: 120000,
      timelineMonths: 4,
    },
    {
      id: "g3",
      title: "Emergency Fund",
      type: "emergency_fund",
      targetAmount: 100000,
      timelineMonths: 12,
    },
  ],
};

// Expected results for scenario 1:
// - Disposable income: ₹39,000
// - Emergency buffer: ₹7,800/month
// - Safe monthly savings: ₹31,200
// - Goa Trip: ✅ Already covered by savings (₹50k > ₹30k)
// - Thailand Trip: ❌ ₹70,000 still needed; takes ~3 months (vs 4 goal) = achievable
//   (Since savings covered ₹50k, remaining ₹70k / ₹31,200 ≈ 3 months)
// - Emergency Fund: ✅ ₹50k covered by savings + ₹50k from 2 months savings

// ── Scenario 2: Tight budget, negative disposable ──
// Fresher in a metro, high rent, low income.
// This tests the "expenses > income" warning path.
export const scenario2_TightBudget: FinancialInput = {
  monthlyIncome: 25000,
  currentSavings: 8000,
  useSavingsForGoal: false, // keeping savings untouched
  expenses: {
    rent: 12000,
    groceries: 5000,
    travel: 3000,
    bills: 3500,
    dailyNeeds: 2500,
    others: 1000,
  },
  goals: [
    {
      id: "g1",
      title: "Buy a new phone",
      type: "gadget",
      targetAmount: 18000,
      timelineMonths: 4,
    },
    {
      id: "g2",
      title: "Birthday gift for family",
      type: "gift",
      targetAmount: 5000,
      timelineMonths: 2,
    },
  ],
};

// Expected results for scenario 2:
// - Total expenses: ₹27,000 > income ₹25,000
// - Disposable income: -₹2,000 (NEGATIVE)
// - hasNegativeDisposable: true
// - Safe monthly savings: ₹0
// - Both goals: ❌ Not achievable at current rate
// - AI should address the expense-over-income situation compassionately

// ── Scenario 3: Decent income, savings NOT used ──
// User wants to keep savings as emergency fund and
// plan all goals purely from monthly savings.
export const scenario3_SavingsExcluded: FinancialInput = {
  monthlyIncome: 55000,
  currentSavings: 40000,
  useSavingsForGoal: false, // explicitly NOT using savings
  expenses: {
    rent: 14000,
    groceries: 5000,
    travel: 2500,
    bills: 3000,
    dailyNeeds: 2000,
    others: 1500,
  },
  goals: [
    {
      id: "g1",
      title: "Save for Diwali celebrations",
      type: "event",
      targetAmount: 20000,
      timelineMonths: 5,
    },
    {
      id: "g2",
      title: "Laptop upgrade",
      type: "gadget",
      targetAmount: 60000,
      timelineMonths: 6,
    },
  ],
};

// Expected results for scenario 3:
// - Disposable income: ₹27,000
// - Emergency buffer: ₹5,400
// - Safe monthly savings: ₹21,600
// - Savings not counted (useSavingsForGoal: false)
// - Diwali: ✅ ₹20,000 / ₹21,600 = 1 month needed (well within 5)
// - Laptop: ✅ ₹60,000 / ₹21,600 = 3 months needed (within 6)

// ── Scenario 4: Very low disposable, partial achievability ──
// After expenses, very little is left. Tests conservative buffer logic.
export const scenario4_LowDisposable: FinancialInput = {
  monthlyIncome: 35000,
  currentSavings: 5000,
  useSavingsForGoal: true,
  expenses: {
    rent: 15000,
    groceries: 6000,
    travel: 3000,
    bills: 4000,
    dailyNeeds: 3500,
    others: 2000,
  },
  goals: [
    {
      id: "g1",
      title: "Small General Savings",
      type: "savings",
      targetAmount: 12000,
      timelineMonths: 6,
    },
    {
      id: "g2",
      title: "Weekend trip to Lonavala",
      type: "domestic_trip",
      targetAmount: 8000,
      timelineMonths: 2,
    },
  ],
};

// Expected results for scenario 4:
// - Disposable income: ₹1,500
// - Emergency buffer: ₹3,000 (minimum kicks in — buffer > disposable!)
// - Safe monthly savings: ₹0 (buffer eats all disposable)
// - Savings of ₹5,000 available
// - General Savings ₹12,000: savings cover ₹5k; needs ₹7k more; impossible at 0/month
// - Lonavala ₹8,000: savings cover ₹5k; needs ₹3k more; impossible at 0/month
// - AI should give practical advice on reducing expenses first

// ─────────────────────────────────────────────
// JSON versions for curl/Postman testing
// ─────────────────────────────────────────────

// Save this as sample-scenario1.json and run:
// curl -X POST http://localhost:3001/api/analyze \
//   -H "Content-Type: application/json" \
//   -d '{"financialData": <paste scenario object here>}'

export const allScenarios = {
  scenario1_ComfortableIncome,
  scenario2_TightBudget,
  scenario3_SavingsExcluded,
  scenario4_LowDisposable,
};
