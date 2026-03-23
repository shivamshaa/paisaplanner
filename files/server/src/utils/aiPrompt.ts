// ─────────────────────────────────────────────
//  aiPrompt.ts – Google Gemini integration
//
//  WHY GEMINI?
//  - Free tier: 1,500 requests/day, no credit card needed
//  - Get API key in 60s: https://aistudio.google.com/app/apikey
//  - Simple official npm package: @google/generative-ai
//
//  IMPORTANT: AI never does math here.
//  All numbers come from calculator.ts.
//  Gemini only explains them in plain language.
// ─────────────────────────────────────────────

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CalculationResult, FinancialInput } from "../types";

// NOTE: Do NOT initialize GoogleGenerativeAI here at module load time.
// At import time, dotenv hasn't loaded yet, so process.env.GEMINI_API_KEY
// would be undefined and the client gets an empty key — causing the 403 error.
// Instead, we create a fresh client inside getAIExplanation() each call,
// which guarantees the env var is fully loaded before it's read.

function fmt(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function buildPrompt(input: FinancialInput, calc: CalculationResult): string {
  const goalLines = calc.goalResults.map((gr) => {
    const status = gr.isAchievable ? "✅ ACHIEVABLE" : "❌ NOT ACHIEVABLE";
    const timeNote =
      gr.monthsNeeded === 0 ? "Already covered by current savings"
      : gr.monthsNeeded === -1 ? "Cannot be achieved at current savings rate"
      : gr.isAchievable
        ? `Can be achieved in ${gr.monthsNeeded} month(s) — within the ${gr.timelineMonths}-month target`
        : `Would realistically take ${gr.revisedTimelineMonths} months (target was ${gr.timelineMonths} months)`;

    const savingsNote = gr.amountCoveredBySavings > 0
      ? `  → Current savings cover: ${fmt(gr.amountCoveredBySavings)}` : "";
    const shortfallNote = gr.shortfallMonthly > 0
      ? `  → Monthly shortfall to meet target timeline: ${fmt(gr.shortfallMonthly)}` : "";

    return [
      `Goal: "${gr.goalTitle}" (${gr.goalType})`,
      `  Target: ${fmt(gr.targetAmount)} in ${gr.timelineMonths} month(s)`,
      `  Status: ${status}`,
      `  ${timeNote}`,
      savingsNote, shortfallNote,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `You are a practical, honest personal finance assistant helping an Indian user plan their monthly finances.
You are NOT a certified financial advisor. Speak like a knowledgeable friend — simple, direct, honest.

The calculations have already been done for you. Your job is ONLY to:
1. Explain what these numbers mean in plain language
2. Give 3–5 realistic saving tips suited to the user's income level
3. Say clearly whether each goal is or isn't achievable
4. Suggest a realistic path forward for goals that aren't achievable
5. End with one honest, encouraging (but realistic) closing sentence

─── USER'S FINANCIAL SUMMARY ───

INCOME & SAVINGS:
• Monthly take-home income: ${fmt(calc.monthlyIncome)}
• Current savings: ${fmt(calc.currentSavings)}
• Using current savings toward goals: ${calc.useSavingsForGoal ? "Yes" : "No"}

MONTHLY EXPENSES:
• Rent: ${fmt(input.expenses.rent)}
• Groceries: ${fmt(input.expenses.groceries)}
• Travel/Commute: ${fmt(input.expenses.travel)}
• Bills & Utilities: ${fmt(input.expenses.bills)}
• Daily Needs: ${fmt(input.expenses.dailyNeeds)}
• Other Mandatory: ${fmt(input.expenses.others)}
• Total Expenses: ${fmt(calc.totalEssentialExpenses)}

CALCULATED RESULTS:
• Disposable income (after expenses): ${fmt(calc.disposableIncome)}
• Recommended monthly emergency buffer: ${fmt(calc.emergencyBufferMonthly)}
• Safe monthly savings capacity: ${fmt(calc.safeMonthlysSavings)}
${calc.hasNegativeDisposable ? "\n⚠️  CRITICAL: This user's expenses EXCEED their income. Address this clearly and compassionately." : ""}

GOALS:
${goalLines}

─── YOUR RESPONSE RULES ───
• Use simple words — the user may not know financial terms
• Always use ₹ and Indian context (mention SIP, UPI, emergency fund in Indian terms if helpful)
• Do NOT suggest skipping meals, eliminating all entertainment, or any unhealthy extreme
• Be honest if something isn't realistic — don't false-encourage
• Keep your total response under 400 words
• Do NOT repeat the numbers back verbatim — explain what they mean
• Format with these exact sections: "## Your Situation", "## Saving Tips", "## Goal Breakdown", "## Moving Forward"`;
}

// Models to try in order. If one fails with quota/404, the next is attempted.
// gemini-2.0-flash-lite has the most reliable free tier across regions.
const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",   // best free tier availability, lightest
  // "gemini-1.5-flash-8b",     // older but widely available fallback
  // "gemini-2.5-flash",        // may have limit:0 on some free accounts
  // "gemini-3.0-flash",        // may have limit:0 on some free accounts
];

// Sleep helper for retry delay
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAIExplanation(
  input: FinancialInput,
  calc: CalculationResult
): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    console.log("ℹ️  No Gemini API key — using rule-based fallback.");
    return generateFallbackExplanation(input, calc);
  }

  // Instantiate the client here (after dotenv has loaded) so the key is present
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
  const prompt = buildPrompt(input, calc);

  // Try each model in order — stop at the first one that works
  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`🤖 Trying Gemini model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) {
        console.log(`✅ Success with model: ${modelName}`);
        return text;
      }
    } catch (error: any) {
      const msg: string = error?.message || String(error);
      const is429 = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
      const is404 = msg.includes("404") || msg.includes("not found");

      if (is429) {
        // Extract retry delay from error message if present (e.g. "retry in 46s")
        const delayMatch = msg.match(/retry[^0-9]*(\d+)/i);
        const waitSecs = delayMatch ? Math.min(parseInt(delayMatch[1]), 10) : 5;
        console.warn(`⏳ ${modelName} quota hit — waiting ${waitSecs}s then trying next model...`);
        await sleep(waitSecs * 1000);
        // continue to next model rather than retrying same one
      } else if (is404) {
        console.warn(`⚠️  ${modelName} not available (404) — trying next model...`);
        // continue immediately to next model
      } else {
        // Unexpected error — log and fall through to rule-based fallback
        console.error(`Gemini API error (${modelName}):`, msg);
        break;
      }
    }
  }

  // All models failed or unavailable — use the built-in explanation
  console.warn("⚠️  All Gemini models failed — using rule-based fallback.");
  return generateFallbackExplanation(input, calc);
}

// ── Rule-based fallback ─────────────────────────
// Used when Gemini API key is missing or call fails.
// The app is always useful without AI.
function generateFallbackExplanation(input: FinancialInput, calc: CalculationResult): string {
  const parts: string[] = [];

  parts.push("## Your Situation\n");
  if (calc.hasNegativeDisposable) {
    parts.push(
      `Your monthly expenses (${fmt(calc.totalEssentialExpenses)}) are higher than your income (${fmt(calc.monthlyIncome)}). ` +
      `This means you're spending more than you earn, making it very difficult to save right now. ` +
      `Before working toward goals, try to identify even small areas where expenses can be reduced.`
    );
  } else {
    parts.push(
      `After paying all your essential expenses (${fmt(calc.totalEssentialExpenses)}), ` +
      `you have ${fmt(calc.disposableIncome)} left each month. ` +
      `Keeping ${fmt(calc.emergencyBufferMonthly)} aside as a safety buffer each month, ` +
      `you can safely save around **${fmt(calc.safeMonthlysSavings)} per month** toward your goals.`
    );
  }

  parts.push("\n## Saving Tips\n");
  parts.push(
    "• Track your daily spending for one week — small unnoticed purchases add up fast.\n" +
    "• Set up a separate savings account so goal money stays separate from spending money.\n" +
    "• Review subscriptions and apps you're paying for but rarely using.\n" +
    "• Try a weekly grocery run instead of daily trips to reduce impulse purchases.\n" +
    "• Automate a fixed transfer to savings right when your salary arrives."
  );

  parts.push("\n## Goal Breakdown\n");
  for (const gr of calc.goalResults) {
    if (gr.monthsNeeded === 0) {
      parts.push(`• **${gr.goalTitle}**: Your current savings already cover this goal. ✅`);
    } else if (gr.monthsNeeded === -1) {
      parts.push(
        `• **${gr.goalTitle}**: Not achievable at your current savings rate. ` +
        `Focus on reducing expenses or increasing income first.`
      );
    } else if (gr.isAchievable) {
      parts.push(
        `• **${gr.goalTitle}**: Achievable! It will take about **${gr.monthsNeeded} month(s)**, ` +
        `which fits your ${gr.timelineMonths}-month target. ✅`
      );
    } else {
      parts.push(
        `• **${gr.goalTitle}**: Not achievable in ${gr.timelineMonths} months at your current rate. ` +
        `A realistic timeline would be **${gr.revisedTimelineMonths} months**.`
      );
    }
  }

  parts.push("\n## Moving Forward\n");
  if (calc.hasNegativeDisposable) {
    parts.push("Focus on closing the gap between your income and expenses first — even small reductions make a real difference over time.");
  } else if (calc.safeMonthlysSavings < 3000) {
    parts.push("Your savings room is tight right now, but consistency matters more than amount. A small, regular saving habit builds over time.");
  } else {
    parts.push("You're in a reasonable position. Stay consistent with monthly savings and revisit your plan every 2–3 months.");
  }

  parts.push(
    "\n\n---\n*💡 Add a Gemini API key in `server/.env` to get personalized AI-powered advice instead of this generic summary.*"
  );

  return parts.join("\n");
}