// ─────────────────────────────────────────────
//  utils/auditPrompt.ts  — 2-Call Audit Design
//
//  WHY 2 CALLS INSTEAD OF AN AGENT LOOP:
//  Free tier RPM limit is 5/min. A multi-step
//  agent loop needs 5-6 calls and reliably hits
//  the limit mid-run regardless of delay tuning.
//
//  Better split of responsibilities:
//  - Gemini is good at: reading merchant names,
//    understanding context, writing plain English
//  - Code is good at: arithmetic, comparisons,
//    goal timeline math — and never hallucinates
//
//  CALL 1 — Classify transactions
//    Input:  raw transactions + category guide
//    Output: JSON array of { index, category }
//
//  CODE  — Compute everything numerical
//    category totals, variance vs budget,
//    goal impact — all deterministic
//
//  CALL 2 — Write insights
//    Input:  computed variance + goal impact + top merchants
//    Output: narrative insights + recommendations
//
//  Total: 2 API calls, always under RPM limit.
// ─────────────────────────────────────────────

import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import {
  AuditRequest,
  AuditAIResponse,
  MonthlyBudget,
  GoalForAudit,
  RawTransaction,
  CategorisedTransaction,
  BudgetVarianceItem,
  ExpenseCategory,
} from "../types";

// ── Config ──────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
];

// Delay between the two calls — 15s keeps us safely at 4/min
const INTER_CALL_DELAY_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ── Valid categories ────────────────────────────
const VALID_CATEGORIES: ExpenseCategory[] = [
  "rent_emi", "groceries", "food_dining", "transport",
  "utilities_bills", "shopping", "entertainment", "health",
  "education", "savings_investment", "others",
];

const CATEGORY_GUIDE = `
Categories (use exactly these keys):
- rent_emi:           rent, house payment, mortgage, EMI, loan repayment
- groceries:          supermarket, kirana, BigBasket, Zepto, Blinkit, grocery stores
- food_dining:        Swiggy, Zomato, restaurants, cafes, Dominos, food delivery
- transport:          Ola, Uber, Rapido, fuel, metro, bus, auto, train, IRCTC
- utilities_bills:    electricity, water, internet, Airtel, Jio, DTH, gas, OTT (Netflix, Prime)
- shopping:           Amazon, Flipkart, Myntra, Nykaa, clothes, gadgets, electronics
- entertainment:      movies, PVR, BookMyShow, games, events, concerts
- health:             pharmacy, Apollo, Medplus, doctor, hospital, gym, Cult.fit
- education:          courses, Udemy, books, college fees, school fees, tuition
- savings_investment: mutual fund, SIP, FD, PPF, stocks, Zerodha, Groww, transfer to savings
- others:             ATM withdrawals, unrecognised transactions, anything else
`.trim();

// ──────────────────────────────────────────────────────────────────
//  CALL 1 — CLASSIFY TRANSACTIONS
//  Gemini reads merchant names and assigns a category to each.
//  Returns a minimal JSON array to keep token usage low.
// ──────────────────────────────────────────────────────────────────

function buildClassifyPrompt(transactions: RawTransaction[]): string {
  // Send index + description + amount only — no need for date/type for classification
  const txLines = transactions.map((t, i) =>
    `${i}|${t.description}|${fmt(t.amount)}|${t.type}`
  ).join("\n");

  return `You are classifying Indian bank transactions into spending categories.

${CATEGORY_GUIDE}

Transactions (format: index|description|amount|type):
${txLines}

Respond with ONLY a JSON array. No explanation, no markdown, no code blocks.
Each item must have exactly two fields: "i" (the index number) and "c" (the category key).

Example: [{"i":0,"c":"food_dining"},{"i":1,"c":"rent_emi"}]

Rules:
- Classify ALL transactions, including credits (salary/refunds → savings_investment or others)
- Use only the category keys listed above
- When unsure, use "others"`;
}

async function callClassify(
  model: any,
  transactions: RawTransaction[]
): Promise<Record<number, ExpenseCategory>> {
  console.log(`  📋 Call 1: Classifying ${transactions.length} transactions...`);

  const result = await model.generateContent(buildClassifyPrompt(transactions));
  let text = result.response.text().trim();

  // Strip markdown code fences if model ignores instruction
  text = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  // Extract JSON array from response
  const start = text.indexOf("[");
  const end   = text.lastIndexOf("]");
  if (start < 0 || end < 0) {
    throw new Error("Classification response did not contain a JSON array.");
  }

  const parsed: { i: number; c: string }[] = JSON.parse(text.slice(start, end + 1));

  // Build index → category map, validating each category
  const map: Record<number, ExpenseCategory> = {};
  for (const item of parsed) {
    const cat = VALID_CATEGORIES.includes(item.c as ExpenseCategory)
      ? (item.c as ExpenseCategory)
      : "others";
    map[item.i] = cat;
  }

  return map;
}

// ──────────────────────────────────────────────────────────────────
//  CODE — ALL ARITHMETIC
//  No AI involved. Deterministic, fast, correct.
// ──────────────────────────────────────────────────────────────────

interface ComputedNumbers {
  categorised:   CategorisedTransaction[];
  categoryTotals: Partial<Record<ExpenseCategory, number>>;
  totalSpent:    number;
  totalIncome:   number;
  netSavings:    number;
  budgetVariance: BudgetVarianceItem[];
  goalImpact:    GoalImpactSummary[];
  topMerchants:  TopMerchant[];
}

interface GoalImpactSummary {
  title:               string;
  targetAmount:        number;
  totalSaved:          number;
  monthlyTarget:       number;
  actualContribution:  number;
  onTrack:             boolean;
  monthsBehindOrAhead: number; // negative = behind
  revisedMonthsLeft:   number;
}

interface TopMerchant {
  category: ExpenseCategory;
  name:     string;
  total:    number;
  count:    number;
}

function computeNumbers(
  transactions: RawTransaction[],
  categoryMap: Record<number, ExpenseCategory>,
  budget: MonthlyBudget,
  goals: GoalForAudit[]
): ComputedNumbers {

  // ── Categorise ──
  const categorised: CategorisedTransaction[] = transactions.map((t, i) => ({
    ...t,
    category: categoryMap[i] ?? "others",
  }));

  // ── Totals ──
  const categoryTotals: Partial<Record<ExpenseCategory, number>> = {};
  let totalSpent  = 0;
  let totalIncome = 0;

  for (const t of categorised) {
    if (t.type === "debit") {
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + t.amount;
      totalSpent += t.amount;
    } else {
      totalIncome += t.amount;
    }
  }

  const netSavings = totalIncome - totalSpent;

  // ── Budget variance ──
  //
  // BUDGETED: user set a planned amount → show real variance (over/under budget)
  // UNBUDGETED: spent here but no plan set → show with isUnbudgeted:true
  //             UI shows "Not budgeted" instead of misleading "planned ₹0"

  // Sum all planned investments (SIP + RD + PPF + NPS + stocks + others)
  const inv = budget.investments ?? { sip: 0, rd: 0, ppf: 0, nps: 0, stocks: 0, others: 0 };
  const totalPlannedInvestments =
    (inv.sip ?? 0) + (inv.rd ?? 0) + (inv.ppf ?? 0) +
    (inv.nps ?? 0) + (inv.stocks ?? 0) + (inv.others ?? 0);

  // Full planned budget per category (only include if planned > 0)
  const rawBudget: Partial<Record<ExpenseCategory, number>> = {
    rent_emi:           budget.expenses.rent,
    groceries:          budget.expenses.groceries,
    transport:          budget.expenses.travel,
    utilities_bills:    budget.expenses.bills,
    others:             (budget.expenses.dailyNeeds ?? 0) + (budget.expenses.others ?? 0),
    savings_investment: totalPlannedInvestments,
  };

  // Only keep categories where user actually set a budget
  const budgetedCategories = Object.fromEntries(
    Object.entries(rawBudget).filter(([, v]) => (v as number) > 0)
  ) as Partial<Record<ExpenseCategory, number>>;

  const budgetVariance: BudgetVarianceItem[] = [];

  // 1. Budgeted categories — always show even if actual spend was 0
  for (const [cat, planned] of Object.entries(budgetedCategories)) {
    const actual = categoryTotals[cat as ExpenseCategory] ?? 0;
    budgetVariance.push({
      category:     cat as ExpenseCategory,
      planned:      planned as number,
      actual,
      variance:     actual - (planned as number),
      isUnbudgeted: false,
    });
  }

  // 2. Unbudgeted categories — spent money but user set no plan
  for (const [cat, actual] of Object.entries(categoryTotals)) {
    const alreadyIn = budgetVariance.some((v) => v.category === cat);
    if (!alreadyIn && (actual ?? 0) > 200) {
      budgetVariance.push({
        category:     cat as ExpenseCategory,
        planned:      0,
        actual:       actual ?? 0,
        variance:     actual ?? 0,
        isUnbudgeted: true,  // UI shows "Not budgeted" — no misleading ₹0
      });
    }
  }

  // Sort: budgeted first (by |variance|), unbudgeted after (by actual spend)
  budgetVariance.sort((a, b) => {
    if (a.isUnbudgeted !== b.isUnbudgeted) return a.isUnbudgeted ? 1 : -1;
    return Math.abs(b.variance) - Math.abs(a.variance);
  });

  // ── Goal impact ──
  const goalImpact: GoalImpactSummary[] = goals.map((goal) => {
    const remaining       = Math.max(0, goal.targetAmount - goal.totalSaved);
    const monthlyTarget   = budget.safeMonthlysSavings;
    // Divide actual net savings equally across active goals
    const actualContrib   = goals.length > 0
      ? Math.max(0, netSavings) / goals.length
      : 0;

    const originalMonthsLeft = monthlyTarget > 0
      ? Math.ceil(remaining / monthlyTarget) : 999;
    const revisedMonthsLeft  = actualContrib > 0
      ? Math.ceil(remaining / actualContrib)  : 999;

    return {
      title:               goal.title,
      targetAmount:        goal.targetAmount,
      totalSaved:          goal.totalSaved,
      monthlyTarget,
      actualContribution:  actualContrib,
      onTrack:             actualContrib >= monthlyTarget * 0.9,
      monthsBehindOrAhead: originalMonthsLeft - revisedMonthsLeft,
      revisedMonthsLeft,
    };
  });

  // ── Top merchants per category ──
  const merchantMap: Record<string, { total: number; count: number; category: ExpenseCategory }> = {};
  for (const t of categorised) {
    if (t.type !== "debit") continue;
    const key = `${t.category}::${t.description.slice(0, 25).trim()}`;
    if (!merchantMap[key]) merchantMap[key] = { total: 0, count: 0, category: t.category };
    merchantMap[key].total += t.amount;
    merchantMap[key].count++;
  }

  const topMerchants: TopMerchant[] = Object.entries(merchantMap)
    .map(([key, data]) => ({
      category: data.category,
      name:     key.split("::")[1],
      total:    data.total,
      count:    data.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return {
    categorised, categoryTotals, totalSpent, totalIncome,
    netSavings, budgetVariance, goalImpact, topMerchants,
  };
}

// ──────────────────────────────────────────────────────────────────
//  CALL 2 — WRITE INSIGHTS
//  We pass all computed numbers to Gemini.
//  It only writes plain English — never does arithmetic.
// ──────────────────────────────────────────────────────────────────

function buildInsightsPrompt(
  numbers: ComputedNumbers,
  budget: MonthlyBudget,
  monthKey: string
): string {
  const varianceLines = numbers.budgetVariance
    .map((v) => {
      if (v.isUnbudgeted) {
        // No planned budget — tell Gemini this is untracked spending
        return `  ${v.category}: NOT BUDGETED, actual ${fmt(v.actual)} (user had no plan for this)`;
      }
      const tag = v.variance > 0 ? `OVER by ${fmt(v.variance)}`
                : v.variance < 0 ? `UNDER by ${fmt(Math.abs(v.variance))}`
                : "on budget";
      return `  ${v.category}: planned ${fmt(v.planned)}, actual ${fmt(v.actual)} — ${tag}`;
    }).join("\n");

  const merchantLines = numbers.topMerchants
    .map((m) => `  ${m.name} (${m.category}): ${fmt(m.total)} across ${m.count} transaction(s)`)
    .join("\n");

  const goalLines = numbers.goalImpact.length === 0
    ? "  No goals set."
    : numbers.goalImpact.map((g) => {
        const status = g.onTrack ? "ON TRACK"
          : g.monthsBehindOrAhead < 0
            ? `BEHIND by ~${Math.abs(g.monthsBehindOrAhead)} month(s)`
            : `AHEAD by ~${g.monthsBehindOrAhead} month(s)`;
        return `  "${g.title}": target ${fmt(g.targetAmount)}, saved ${fmt(g.totalSaved)}, ` +
               `planned ${fmt(g.monthlyTarget)}/month, actual ${fmt(g.actualContribution)}/month — ${status}`;
      }).join("\n");

  return `You are a personal finance advisor writing a monthly spending review for an Indian user.

MONTH: ${monthKey}
INCOME: ${fmt(numbers.totalIncome)}
TOTAL SPENT: ${fmt(numbers.totalSpent)}
NET SAVINGS: ${fmt(numbers.netSavings)}
SAFE SAVINGS TARGET WAS: ${fmt(budget.safeMonthlysSavings)}

BUDGET vs ACTUAL:
${varianceLines}

TOP MERCHANTS THIS MONTH:
${merchantLines}

GOAL IMPACT:
${goalLines}

Write a concise spending review with these exact sections:
## Your Month
2–3 sentences summarising overall spending. Be specific — mention actual merchant names and amounts.

## What Stood Out
3–4 bullet points (start each with •) about the most notable patterns — overspending, good savings, surprise categories.

## Goal Impact  
1–2 sentences per goal explaining if they are on track or falling behind based on this month.

## 3 Things To Do Next Month
Exactly 3 specific, actionable recommendations based on what you found. Number them 1, 2, 3.

Rules:
- Use ₹ currency throughout
- Mention specific merchants by name (Swiggy, Zomato, Amazon etc.)
- Be honest about overspending — don't sugarcoat
- Keep total response under 300 words
- Do NOT repeat the numbers table back — interpret what they mean`;
}

async function callInsights(
  model: any,
  numbers: ComputedNumbers,
  budget: MonthlyBudget,
  monthKey: string
): Promise<{ insights: string; goalImpact: string; topRecommendations: string[] }> {
  console.log(`  ✍️  Call 2: Writing insights...`);

  const result = await model.generateContent(
    buildInsightsPrompt(numbers, budget, monthKey)
  );
  const text = result.response.text().trim();

  // Parse out the goal impact section and recommendations
  const goalSection = extractSection(text, "## Goal Impact", "## 3 Things");
  const recsSection = extractSection(text, "## 3 Things", null);

  // Extract numbered recommendations
  const recs = (recsSection || text)
    .split("\n")
    .filter((l: string) => /^[123]\./.test(l.trim()))
    .map((l: string) => l.replace(/^[123]\.\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    insights:          text,
    goalImpact:        goalSection ?? "",
    topRecommendations: recs,
  };
}

// Extract a section between two markdown headers
function extractSection(text: string, startHeader: string, endHeader: string | null): string | null {
  const startIdx = text.indexOf(startHeader);
  if (startIdx < 0) return null;
  const contentStart = startIdx + startHeader.length;
  const endIdx = endHeader ? text.indexOf(endHeader, contentStart) : text.length;
  return endIdx > 0
    ? text.slice(contentStart, endIdx).trim()
    : text.slice(contentStart).trim();
}

// ──────────────────────────────────────────────────────────────────
//  RETRY WRAPPER
//  Handles 429 and 404 with model fallback — same as aiPrompt.ts
// ──────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: (model: any) => Promise<T>,
  genAI: GoogleGenerativeAI
): Promise<T> {
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await fn(model);
      console.log(`  ✅ Success with model: ${modelName}`);
      return result;
    } catch (err: any) {
      const msg = err?.message || String(err);
      const is429 = msg.includes("429") || msg.includes("quota");
      const is404 = msg.includes("404") || msg.includes("not found");

      if (is429) {
        const delayMatch = msg.match(/retry[^0-9]*(\d+)/i);
        const wait = delayMatch ? Math.min(parseInt(delayMatch[1]) * 1000, 30000) : 20000;
        console.warn(`  ⏳ ${modelName} quota — waiting ${wait/1000}s, trying next model...`);
        await sleep(wait);
      } else if (is404) {
        console.warn(`  ⚠️  ${modelName} not available, trying next...`);
      } else {
        throw err;
      }
    }
  }
  throw new Error("All Gemini models failed. Please try again later.");
}

// ──────────────────────────────────────────────────────────────────
//  PDF EXTRACTION
//  For PDF files, we use a single call to extract + classify at once.
//  This keeps PDF path at 2 calls total as well.
// ──────────────────────────────────────────────────────────────────

function buildPDFExtractPrompt(): string {
  return `Extract EVERY SINGLE transaction row from this bank statement PDF.

CRITICAL: Do not stop early. Do not summarise. Do not sample.
Extract ALL rows from ALL pages — even if there are 50, 100, or more.
A bank statement with 40 transactions must produce a JSON array with 40 items.

Return ONLY a JSON array. No explanation, no markdown, no code blocks.

Each item must have exactly these fields:
{
  "date": "DD/MM/YYYY",
  "description": "exact merchant/narration text from the statement",
  "amount": number (always positive, never zero),
  "type": "debit" or "credit",
  "category": "one category key from the list below"
}

${CATEGORY_GUIDE}

Rules:
- INCLUDE every row that has a date + amount — do not skip any
- EXCLUDE: opening balance line, closing balance line, column headers
- amount is always positive — use the type field for direction
- type is "debit" for money OUT, "credit" for money IN (salary, refunds)
- description: copy the narration/merchant text exactly as it appears
- If the statement has multiple pages, extract from ALL pages
- Respond with ONLY the JSON array, nothing before or after it`;
}

// CategorisedTransaction but without requiring all fields yet
type ExtractedTransaction = RawTransaction & { category?: ExpenseCategory };

async function extractFromPDF(
  model: any,
  pdfBase64: string
): Promise<ExtractedTransaction[]> {
  console.log(`  📄 Extracting transactions from PDF...`);

  const parts: Part[] = [
    { inlineData: { mimeType: "application/pdf", data: pdfBase64 } } as any,
    { text: buildPDFExtractPrompt() },
  ];

  const result = await model.generateContent(parts);
  let text = result.response.text().trim()
    .replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  const start = text.indexOf("[");
  const end   = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("PDF extraction did not return a JSON array.");

  const parsed = JSON.parse(text.slice(start, end + 1));

  // Preserve category — do NOT strip it. It was in the prompt response.
  return parsed
    .map((t: any) => ({
      date:        String(t.date || ""),
      description: String(t.description || ""),
      amount:      Math.abs(Number(t.amount) || 0),
      type:        t.type === "credit" ? "credit" : "debit",
      // Keep category if Gemini returned one, validate it
      category:    VALID_CATEGORIES.includes(t.category) ? t.category as ExpenseCategory : undefined,
    }))
    .filter((t: ExtractedTransaction) => t.amount > 0); // drop zero-amount rows
}

// ──────────────────────────────────────────────────────────────────
//  PUBLIC ENTRY POINT
// ──────────────────────────────────────────────────────────────────

export async function runAuditAgent(request: AuditRequest): Promise<AuditAIResponse> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
  let transactions: (RawTransaction & { category?: ExpenseCategory })[] = request.transactions ?? [];

  // ── Step 1: Get classified transactions ────────
  let categoryMap: Record<number, ExpenseCategory>;

  if (request.fileType === "pdf" && request.pdfBase64) {
    // PDF: extract + classify in one call
    transactions = await withRetry(
      (model) => extractFromPDF(model, request.pdfBase64!),
      genAI
    );
    // For PDF, Gemini already classified while extracting — build map from extracted data
    // (the extractFromPDF call returns typed transactions from the PDF prompt which includes category)
    // We re-classify with a separate call to keep the logic clean
    console.log(`  📊 Extracted ${transactions.length} transactions from PDF`);

    // Small wait before second call
    console.log(`  ⏳ Waiting ${INTER_CALL_DELAY_MS/1000}s before insights call...`);
    await sleep(INTER_CALL_DELAY_MS);

    // Build categoryMap from the categories Gemini assigned during extraction.
    // extractFromPDF now PRESERVES the category field — it is no longer stripped.
    categoryMap = {};
    transactions.forEach((t: any, i: number) => {
      // t.category is now populated from the extraction response
      categoryMap[i] = t.category ?? "others";
    });
    const categorisedCount = Object.values(categoryMap).filter(c => c !== "others").length;
    console.log(`  🏷️  ${categorisedCount}/${transactions.length} transactions categorised (rest → others)`);

  } else {
    // CSV: classify transactions
    categoryMap = await withRetry(
      (model) => callClassify(model, transactions),
      genAI
    );

    console.log(`  ⏳ Waiting ${INTER_CALL_DELAY_MS/1000}s before insights call...`);
    await sleep(INTER_CALL_DELAY_MS);
  }

  // ── Step 2: Compute all numbers in code ────────
  console.log(`  🔢 Computing variance, goal impact, merchant totals...`);
  const numbers = computeNumbers(
    transactions,
    categoryMap,
    request.monthlyBudget,
    request.goals
  );

  // ── Step 3: Write insights ─────────────────────
  const { insights, goalImpact, topRecommendations } = await withRetry(
    (model) => callInsights(model, numbers, request.monthlyBudget, request.monthKey),
    genAI
  );

  console.log(`  ✅ Audit complete — 2 API calls used`);

  return {
    transactions:       numbers.categorised,
    categoryTotals:     numbers.categoryTotals,
    totalSpent:         numbers.totalSpent,
    totalIncome:        numbers.totalIncome,
    netSavings:         numbers.netSavings,
    budgetVariance:     numbers.budgetVariance,
    insights,
    goalImpact,
    topRecommendations,
  };
}