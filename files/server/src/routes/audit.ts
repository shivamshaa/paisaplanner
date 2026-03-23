// ─────────────────────────────────────────────
//  routes/audit.ts
//  POST /api/audit
//
//  Accepts CSV transactions or a PDF base64 string,
//  runs the Gemini audit agent, and returns a
//  structured AuditAIResponse.
// ─────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { AuditRequest } from "../../../client/src/types/index";
import { runAuditAgent } from "../utils/auditPrompt";

const router = Router();

// ── Validation ──────────────────────────────────
function validateAuditRequest(body: any): string | null {
  if (!body) return "Request body missing";

  const req = body as Partial<AuditRequest>;

  if (!req.monthKey || !/^\d{4}-\d{2}$/.test(req.monthKey))
    return "monthKey must be in YYYY-MM format";

  if (!req.monthlyBudget)
    return "monthlyBudget is required";

  if (typeof req.monthlyBudget.income !== "number" || req.monthlyBudget.income < 0)
    return "monthlyBudget.income must be a non-negative number";

  if (!req.fileType || !["csv", "pdf"].includes(req.fileType))
    return "fileType must be 'csv' or 'pdf'";

  if (req.fileType === "csv") {
    if (!Array.isArray(req.transactions) || req.transactions.length === 0)
      return "transactions array is required for CSV audits";
    if (req.transactions.length > 1000)
      return "Maximum 1000 transactions per audit";
  }

  if (req.fileType === "pdf") {
    if (!req.pdfBase64 || req.pdfBase64.trim() === "")
      return "pdfBase64 is required for PDF audits";
    // Rough size check: base64 of 10MB = ~13.3M chars
    if (req.pdfBase64.length > 14_000_000)
      return "PDF is too large. Maximum file size is 10MB";
  }

  return null;
}

// ── POST /api/audit ─────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const validationError = validateAuditRequest(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const auditReq = req.body as AuditRequest;

    console.log(
      `📊 Audit request: ${auditReq.monthKey} | ${auditReq.fileType} | ` +
      `${auditReq.transactions?.length ?? "PDF"} items`
    );

    const result = await runAuditAgent(auditReq);

    return res.status(200).json({
      result,
      disclaimer:
        "This audit is for personal planning only. Not financial advice.",
    });

  } catch (error: any) {
    console.error("Error in POST /api/audit:", error?.message || error);

    // Surface meaningful errors to the client
    const msg = error?.message || "Something went wrong during the audit.";

    if (msg.includes("GEMINI_API_KEY")) {
      return res.status(503).json({ error: "AI service not configured on the server." });
    }
    if (msg.includes("quota") || msg.includes("429")) {
      return res.status(429).json({ error: "AI service is temporarily rate-limited. Please try again in a minute." });
    }

    return res.status(500).json({ error: msg });
  }
});

export default router;