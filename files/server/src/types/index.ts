export interface Expenses {
  rent: number;
  groceries: number;
  travel: number;
  bills: number;
  dailyNeeds: number;
  others: number;
}

export interface MonthlyInvestments {
  sip: number;
  rd: number;
  ppf: number;
  nps: number;
  stocks: number;
  others: number;
}

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

export interface AnalyzeRequest {
  financialData: FinancialInput;
}

// ─────────────────────────────────────────────
//  Phase 2/3 — Audit types (server)
// ─────────────────────────────────────────────

export type ExpenseCategory =
  | "rent_emi"
  | "groceries"
  | "food_dining"
  | "transport"
  | "utilities_bills"
  | "shopping"
  | "entertainment"
  | "health"
  | "education"
  | "savings_investment"
  | "others";

export interface RawTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

export interface CategorisedTransaction extends RawTransaction {
  category: ExpenseCategory;
}

export interface BudgetVarianceItem {
  category: ExpenseCategory;
  planned: number;
  actual: number;
  variance: number;
  isUnbudgeted: boolean; // true = no planned budget set for this category
}

export interface MonthlyBudget {
  monthKey: string;
  income: number;
  expenses: {
    rent: number; groceries: number; travel: number;
    bills: number; dailyNeeds: number; others: number;
  };
  investments: {
    sip: number; rd: number; ppf: number;
    nps: number; stocks: number; others: number;
  };
  safeMonthlysSavings: number;
  emergencyBufferMonthly: number;
}

export interface GoalForAudit {
  id: string;
  title: string;
  type: string;
  targetAmount: number;
  timelineMonths: number;
  totalSaved: number;
}

// Request body for POST /api/audit
export interface AuditRequest {
  monthKey: string;
  monthlyBudget: MonthlyBudget;
  goals: GoalForAudit[];
  fileType: "csv" | "pdf";
  transactions?: RawTransaction[];  // CSV path
  pdfBase64?: string;               // PDF path
}

// The structured JSON Gemini must return
export interface AuditAIResponse {
  transactions: CategorisedTransaction[];
  categoryTotals: Partial<Record<ExpenseCategory, number>>;
  totalSpent: number;
  totalIncome: number;
  netSavings: number;
  budgetVariance: BudgetVarianceItem[];
  insights: string;
  goalImpact: string;
  topRecommendations: string[];
}