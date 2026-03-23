// ─────────────────────────────────────────────
//  client/src/types/index.ts
//  Phase 1 types (original) + Phase 2/3 types
// ─────────────────────────────────────────────

// ── Phase 1 — Original types ──────────────────

export interface Expenses {
  rent: number;
  groceries: number;
  travel: number;
  bills: number;
  dailyNeeds: number;
  others: number;
}

export interface MonthlyInvestments {
  sip: number;        // Systematic Investment Plan (mutual funds)
  rd: number;         // Recurring Deposit
  ppf: number;        // Public Provident Fund
  nps: number;        // National Pension System
  stocks: number;     // Direct equity/stocks
  others: number;     // Any other investment
}

export const defaultInvestments: MonthlyInvestments = {
  sip: 0, rd: 0, ppf: 0, nps: 0, stocks: 0, others: 0,
};

export type GoalType =
  | "savings"
  | "domestic_trip"
  | "international_trip"
  | "gift"
  | "gadget"
  | "event"
  | "emergency_fund"
  | "custom";

export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  targetAmount: number;
  timelineMonths: number;
}

export interface FinancialInput {
  monthlyIncome: number;
  currentSavings: number;
  useSavingsForGoal: boolean;
  expenses: Expenses;
  investments: MonthlyInvestments;
  goals: Goal[];
}

export interface GoalResult {
  goalId: string;
  goalTitle: string;
  goalType: GoalType;
  targetAmount: number;
  timelineMonths: number;
  isAchievable: boolean;
  monthsNeeded: number;
  shortfallMonthly: number;
  amountCoveredBySavings: number;
  amountNeededFromMonthlySavings: number;
  revisedTimelineMonths: number;
}

export interface CalculationResult {
  monthlyIncome: number;
  totalEssentialExpenses: number;
  totalMonthlyInvestments: number;
  disposableIncome: number;
  emergencyBufferMonthly: number;
  safeMonthlysSavings: number;
  currentSavings: number;
  useSavingsForGoal: boolean;
  goalResults: GoalResult[];
  hasNegativeDisposable: boolean;
}

export interface AnalysisResponse {
  calculation: CalculationResult;
  aiExplanation: string;
  disclaimer: string;
}

export type AppStep = "financial" | "goals" | "results";

export const defaultExpenses: Expenses = {
  rent: 0, groceries: 0, travel: 0, bills: 0, dailyNeeds: 0, others: 0,
};

// ── Phase 2/3 — New types ─────────────────────

// Expanded expense categories for transaction classification
export type ExpenseCategory =
  | "rent_emi"
  | "groceries"
  | "food_dining"        // restaurants, Swiggy, Zomato
  | "transport"          // Ola, Uber, fuel, metro, bus
  | "utilities_bills"    // electricity, internet, phone, OTT
  | "shopping"           // Amazon, Flipkart, clothes, gadgets
  | "entertainment"      // movies, events, games
  | "health"             // pharmacy, doctor, gym
  | "education"          // courses, books, fees
  | "savings_investment" // SIP, FD, transfers to savings
  | "others";

// Human-readable labels for categories
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent_emi:           "Rent / EMI",
  groceries:          "Groceries",
  food_dining:        "Food & Dining",
  transport:          "Transport",
  utilities_bills:    "Bills & Utilities",
  shopping:           "Shopping",
  entertainment:      "Entertainment",
  health:             "Health",
  education:          "Education",
  savings_investment: "Savings / Investment",
  others:             "Others",
};

// Maps the old Expenses fields to the new category system
// Used when comparing audit actuals vs saved budget
export const EXPENSES_TO_CATEGORY: Record<keyof Expenses, ExpenseCategory> = {
  rent:       "rent_emi",
  groceries:  "groceries",
  travel:     "transport",
  bills:      "utilities_bills",
  dailyNeeds: "others",
  others:     "others",
};

// A single transaction from CSV parsing
export interface RawTransaction {
  date: string;        // raw date string from CSV
  description: string;
  amount: number;      // always positive
  type: "debit" | "credit";
}

// Transaction after AI categorisation
export interface CategorisedTransaction extends RawTransaction {
  category: ExpenseCategory;
}

// Per-category budget vs actual comparison
export interface BudgetVarianceItem {
  category: ExpenseCategory;
  planned: number;       // from saved profile (0 if not budgeted)
  actual: number;        // from audit
  variance: number;      // actual - planned (positive = overspent)
  isUnbudgeted: boolean; // true = user never set a budget for this category
}

// Full result of one monthly audit (stored in localStorage)
export interface AuditResult {
  id: string;            // unique ID
  monthKey: string;      // "YYYY-MM" e.g. "2025-07"
  createdAt: string;     // ISO timestamp
  fileType: "csv" | "pdf";
  transactions: CategorisedTransaction[];
  categoryTotals: Partial<Record<ExpenseCategory, number>>;
  totalSpent: number;
  totalIncome: number;
  netSavings: number;
  budgetVariance: BudgetVarianceItem[];
  insights: string;      // AI narrative
  goalImpact: string;    // AI commentary on goals
  topRecommendations: string[];
}

// Saved monthly budget snapshot (the "plan" for a month)
export interface MonthlyBudget {
  monthKey: string;
  income: number;
  expenses: Expenses;
  investments: MonthlyInvestments;  // ← added so audit knows planned SIP/RD/PPF
  safeMonthlysSavings: number;
  emergencyBufferMonthly: number;
}

// Goal with contribution history
export interface GoalWithProgress extends Goal {
  contributions: GoalContribution[];
  totalSaved: number;
}

// A single goal contribution recorded after an audit
export interface GoalContribution {
  id: string;
  monthKey: string;
  amount: number;
  note: string; // e.g. "From July audit savings"
}

// The user's saved financial profile
export interface SavedProfile {
  monthlyIncome: number;
  currentSavings: number;
  useSavingsForGoal: boolean;
  expenses: Expenses;
  investments: MonthlyInvestments;
  calculationResult: CalculationResult;
  savedAt: string; // ISO timestamp
}

// Navigation views in the sidebar app
export type AppView = "dashboard" | "goals" | "audit" | "settings";

// Result of client-side CSV parsing (before sending to server)
export interface CSVParseResult {
  transactions: RawTransaction[];
  bankDetected: string;  // e.g. "HDFC", "SBI", "Unknown"
  warnings: string[];
  totalRows: number;
}

// Request body for POST /api/audit
export interface AuditRequest {
  monthKey: string;
  monthlyBudget: MonthlyBudget;
  goals: GoalWithProgress[];
  fileType: "csv" | "pdf";
  transactions?: RawTransaction[];  // for CSV path
  pdfBase64?: string;               // for PDF path (base64, no data: prefix)
}

// Response from POST /api/audit
export interface AuditResponse {
  result: Omit<AuditResult, "id" | "createdAt" | "fileType">;
  disclaimer: string;
}