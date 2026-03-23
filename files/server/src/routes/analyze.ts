import { Router, Request, Response } from "express";
import { AnalyzeRequest, AnalysisResponse, FinancialInput } from "../types";
import { calculateFinancials } from "../utils/calculator";
import { getAIExplanation } from "../utils/aiPrompt";

const router = Router();

function validateInput(data: FinancialInput): string | null {
  if (!data) return "Request body is missing";
  if (typeof data.monthlyIncome !== "number" || data.monthlyIncome < 0)
    return "monthlyIncome must be a non-negative number";
  if (typeof data.currentSavings !== "number" || data.currentSavings < 0)
    return "currentSavings must be a non-negative number";
  if (typeof data.useSavingsForGoal !== "boolean")
    return "useSavingsForGoal must be true or false";
  if (!data.expenses) return "expenses object is required";

  // investments is optional — default to zeros for backward compatibility
  if (!data.investments) {
    data.investments = { sip: 0, rd: 0, ppf: 0, nps: 0, stocks: 0, others: 0 };
  }

  const expenseFields = ["rent", "groceries", "travel", "bills", "dailyNeeds", "others"];
  for (const field of expenseFields) {
    const val = (data.expenses as any)[field];
    if (typeof val !== "number" || val < 0)
      return `expenses.${field} must be a non-negative number`;
  }

  if (!Array.isArray(data.goals) || data.goals.length === 0)
    return "At least one goal is required";
  if (data.goals.length > 10) return "Maximum 10 goals allowed";

  for (const goal of data.goals) {
    if (!goal.title || goal.title.trim() === "") return "Each goal must have a title";
    if (typeof goal.targetAmount !== "number" || goal.targetAmount <= 0)
      return `Goal "${goal.title}": targetAmount must be a positive number`;
    if (typeof goal.timelineMonths !== "number" || goal.timelineMonths < 1 || goal.timelineMonths > 12)
      return `Goal "${goal.title}": timelineMonths must be between 1 and 12`;
  }
  return null;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const { financialData } = req.body as AnalyzeRequest;
    const validationError = validateInput(financialData);
    if (validationError) return res.status(400).json({ error: validationError });

    // Step 1: Rule-based math (no AI)
    const calculation = calculateFinancials(financialData);

    // Step 2: AI plain-English explanation
    const aiExplanation = await getAIExplanation(financialData, calculation);

    const response: AnalysisResponse = {
      calculation,
      aiExplanation,
      disclaimer:
        "⚠️ This tool is for educational and personal planning purposes only. " +
        "It is not financial advice. Always consult a qualified financial advisor " +
        "before making major financial decisions.",
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error("Error in /api/analyze:", error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;