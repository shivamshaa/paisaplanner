// ─────────────────────────────────────────────
//  AuditPage.tsx – Monthly budget audit
//
//  Steps:
//  1. idle     — month selector + file upload area
//  2. preview  — parsed transactions preview (CSV)
//               or PDF confirmed
//  3. loading  — running audit via API
//  4. results  — full audit report
// ─────────────────────────────────────────────

import React, { useState, useRef, useCallback } from "react";
import {
  SavedProfile,
  GoalWithProgress,
  AuditResult,
  AuditRequest,
  AuditResponse,
  RawTransaction,
  CATEGORY_LABELS,
  BudgetVarianceItem,
} from "../types";
import { parseCSV } from "../utils/csvParser";
import {
  getCurrentMonthKey,
  getAuditForMonth,
  saveAudit,
  deleteAudit,
  getAudits,
  formatMonthKey,
} from "../utils/storage";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

interface Props {
  profile: SavedProfile;
  goals: GoalWithProgress[];
  onAuditSaved: () => void;
}

type Step = "idle" | "preview" | "loading" | "results";

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ── Variance bar ────────────────────────────────
function VarianceBar({ item }: { item: BudgetVarianceItem }) {
  const overspent  = item.variance > 0;
  const underspent = item.variance < 0;
  // For unbudgeted items, bar fills 100% of track to show full actual spend
  const actualPct = item.planned > 0
    ? Math.min(150, (item.actual / item.planned) * 100)
    : 100;

  // Unbudgeted: user never set a budget here
  // Show differently — no variance badge, just "Not budgeted" label
  if (item.isUnbudgeted) {
    return (
      <div className="variance-row">
        <div className="variance-label">
          <span>{CATEGORY_LABELS[item.category]}</span>
          <span className="pill pill--amber" style={{ fontSize: "0.68rem" }}>Not budgeted</span>
        </div>
        <div className="variance-bar-track">
          <div
            className="variance-bar-actual"
            style={{ width: "100%", background: "var(--amber)" }}
            title={`Actual: ${fmt(item.actual)}`}
          />
        </div>
        <div className="variance-amounts">
          <span className="field-hint" style={{ color: "var(--amber)" }}>
            No planned budget set
          </span>
          <span className="field-hint">Spent: {fmt(item.actual)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="variance-row">
      <div className="variance-label">
        <span>{CATEGORY_LABELS[item.category]}</span>
        <span className={overspent ? "text-danger" : underspent ? "text-success" : "text-muted"}>
          {overspent ? "+" : ""}{fmt(item.variance)}
          {overspent ? " over" : underspent ? " under" : " ✓"}
        </span>
      </div>
      <div className="variance-bars">
        <div className="variance-bar-track">
          <div
            className="variance-bar-planned"
            style={{ width: "100%" }}
            title={`Planned: ${fmt(item.planned)}`}
          />
        </div>
        <div className="variance-bar-track">
          <div
            className={`variance-bar-actual ${overspent ? "variance-bar-actual--over" : underspent ? "variance-bar-actual--under" : ""}`}
            style={{ width: `${Math.min(150, actualPct)}%` }}
            title={`Actual: ${fmt(item.actual)}`}
          />
        </div>
      </div>
      <div className="variance-amounts">
        <span className="field-hint">Planned: {fmt(item.planned)}</span>
        <span className="field-hint">Actual: {fmt(item.actual)}</span>
      </div>
    </div>
  );
}

// ── AI explanation renderer ─────────────────────
function RenderText({ text }: { text: string }) {
  return (
    <div className="ai-explanation">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "0.4rem" }} />;
        if (line.startsWith("## ")) return <h4 key={i} className="ai-section-header">{line.replace("## ", "")}</h4>;
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return <p key={i} className="ai-bullet">{line.replace(/^[•\-] /, "")}</p>;
        }
        return <p key={i} className="ai-paragraph">{line}</p>;
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────
const AuditPage: React.FC<Props> = ({ profile, goals, onAuditSaved }) => {
  const [step, setStep]               = useState<Step>("idle");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [fileType, setFileType]       = useState<"csv" | "pdf" | null>(null);
  const [fileName, setFileName]       = useState("");
  const [transactions, setTransactions] = useState<RawTransaction[]>([]);
  const [pdfBase64, setPdfBase64]     = useState<string>("");
  const [bankDetected, setBankDetected] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [error, setError]             = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if an audit already exists for the selected month
  const existingAudit = getAuditForMonth(selectedMonth);
  const pastAudits    = getAudits().filter((a) => a.monthKey !== getCurrentMonthKey());

  // Generate last 6 months for the selector
  const monthOptions = (() => {
    const opts: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ key, label: formatMonthKey(key) });
    }
    return opts;
  })();

  // ── File handling ───────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || file.type === "text/csv") {
      setFileType("csv");
      setFileName(file.name);
      const text = await file.text();
      const parsed = parseCSV(text);
      setTransactions(parsed.transactions);
      setBankDetected(parsed.bankDetected);
      setParseWarnings(parsed.warnings);
      if (parsed.transactions.length === 0) {
        setError("No transactions found in this CSV. Check the format.");
        return;
      }
      setStep("preview");

    } else if (ext === "pdf" || file.type === "application/pdf") {
      setFileType("pdf");
      setFileName(file.name);
      // Convert to base64 for sending to backend
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip "data:application/pdf;base64," prefix
        const base64 = result.split(",")[1] ?? result;
        setPdfBase64(base64);
        setStep("preview");
      };
      reader.onerror = () => setError("Failed to read PDF file.");
      reader.readAsDataURL(file);

    } else {
      setError("Please upload a CSV or PDF file.");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Run audit ───────────────────────────────────
  const runAudit = async () => {
    setStep("loading");
    setError("");

    const calc = profile.calculationResult;

    const requestBody: AuditRequest = {
      monthKey: selectedMonth,
      monthlyBudget: {
        monthKey:              selectedMonth,
        income:                profile.monthlyIncome,
        expenses:              profile.expenses,
        investments:           profile.investments ?? { sip: 0, rd: 0, ppf: 0, nps: 0, stocks: 0, others: 0 },
        safeMonthlysSavings:   calc.safeMonthlysSavings,
        emergencyBufferMonthly: calc.emergencyBufferMonthly,
      },
      goals,
      fileType: fileType!,
      transactions: fileType === "csv" ? transactions : undefined,
      pdfBase64:    fileType === "pdf" ? pdfBase64    : undefined,
    };

    try {
      const res = await fetch(`${API_BASE}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data: AuditResponse = await res.json();

      // Build full AuditResult with id + metadata
      const fullResult: AuditResult = {
        ...data.result,
        id:         `audit_${Date.now()}`,
        createdAt:  new Date().toISOString(),
        fileType:   fileType!,
        monthKey:   selectedMonth,
      };

      saveAudit(fullResult);
      setAuditResult(fullResult);
      setStep("results");
      onAuditSaved();

    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setStep("preview");
    }
  };

  const resetFlow = () => {
    setStep("idle");
    setFileType(null);
    setFileName("");
    setTransactions([]);
    setPdfBase64("");
    setBankDetected("");
    setParseWarnings([]);
    setError("");
    setAuditResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const viewExistingAudit = (audit: AuditResult) => {
    setAuditResult(audit);
    setStep("results");
    setViewingHistory(true);
  };

  // ── Render ──────────────────────────────────────
  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2 className="page-title">Budget Audit</h2>
          <p className="page-subtitle">Upload your bank statement to compare actual vs planned spending</p>
        </div>
        {(step === "preview" || step === "results") && (
          <button className="btn btn-ghost" onClick={resetFlow}>← New Audit</button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>❌ {error}</div>
      )}

      {/* ── Step 1: Idle — month select + upload ── */}
      {step === "idle" && (
        <>
          {/* Month selector */}
          <div className="card">
            <h3 className="card-title">📅 Select Month</h3>
            <div className="month-selector">
              {monthOptions.map((opt) => (
                <button
                  key={opt.key}
                  className={`month-btn ${selectedMonth === opt.key ? "month-btn--active" : ""}`}
                  onClick={() => setSelectedMonth(opt.key)}
                >
                  {opt.label}
                  {getAuditForMonth(opt.key) && <span className="month-btn-dot" />}
                </button>
              ))}
            </div>
            {existingAudit && (
              <div className="alert alert-info" style={{ marginTop: "0.75rem" }}>
                An audit already exists for {formatMonthKey(selectedMonth)}.{" "}
                <button className="link-btn" onClick={() => viewExistingAudit(existingAudit)}>
                  View it →
                </button>{" "}
                or upload a new file to replace it.
              </div>
            )}
          </div>

          {/* Upload area */}
          <div className="card">
            <h3 className="card-title">📂 Upload Bank Statement</h3>
            <p className="field-hint" style={{ marginBottom: "1rem" }}>
              Supports CSV and PDF. Most Indian banks let you export statements from their app or netbanking.
            </p>

            <div
              className="upload-zone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-zone-content">
                <span className="upload-icon">📄</span>
                <p className="upload-title">Drop your statement here or click to browse</p>
                <p className="upload-sub">CSV or PDF · Max 10MB</p>
                <div className="upload-format-tags">
                  <span className="format-tag">HDFC</span>
                  <span className="format-tag">SBI</span>
                  <span className="format-tag">ICICI</span>
                  <span className="format-tag">Axis</span>
                  <span className="format-tag">Kotak</span>
                  <span className="format-tag">& more</span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </div>
          </div>

          {/* Audit history */}
          {pastAudits.length > 0 && (
            <div className="card">
              <div className="card-title-row">
                <h3 className="card-title">📋 Past Audits</h3>
                <button className="link-btn" onClick={() => setViewingHistory(!viewingHistory)}>
                  {viewingHistory ? "Hide" : "Show all"}
                </button>
              </div>
              <div className="audit-history-list">
                {pastAudits.slice(0, viewingHistory ? undefined : 3).map((a) => (
                  <div key={a.id} className="audit-history-item">
                    <div className="audit-history-info">
                      <span className="audit-history-month">{formatMonthKey(a.monthKey)}</span>
                      <span className="field-hint">
                        {fmt(a.totalSpent)} spent · {fmt(a.netSavings)} saved · {a.transactions.length} transactions
                      </span>
                    </div>
                    <div className="audit-history-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => viewExistingAudit(a)}>View</button>
                      <button
                        className="btn-remove"
                        onClick={() => { if (window.confirm("Delete this audit?")) { deleteAudit(a.id); onAuditSaved(); }}}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step 2: Preview ── */}
      {step === "preview" && (
        <div className="card">
          <h3 className="card-title">
            {fileType === "csv" ? "📊 Transaction Preview" : "📄 PDF Ready"}
          </h3>

          <div className="file-info-row">
            <span className="file-badge">{fileType?.toUpperCase()}</span>
            <span className="file-name">{fileName}</span>
            {bankDetected && bankDetected !== "Unknown" && (
              <span className="bank-badge">🏦 {bankDetected}</span>
            )}
          </div>

          {parseWarnings.map((w, i) => (
            <div key={i} className="alert alert-info" style={{ marginBottom: "0.5rem" }}>{w}</div>
          ))}

          {fileType === "csv" && transactions.length > 0 && (
            <>
              <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
                Found <strong>{transactions.length} transactions</strong>. Showing first 8:
              </p>
              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 8).map((t, i) => (
                      <tr key={i}>
                        <td>{t.date}</td>
                        <td className="desc-cell">{t.description}</td>
                        <td className={t.type === "debit" ? "text-danger" : "text-success"}>
                          {fmt(t.amount)}
                        </td>
                        <td>
                          <span className={`type-badge type-badge--${t.type}`}>
                            {t.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {transactions.length > 8 && (
                <p className="field-hint" style={{ marginTop: "0.4rem" }}>
                  +{transactions.length - 8} more transactions will be included in the audit.
                </p>
              )}
            </>
          )}

          {fileType === "pdf" && (
            <div className="pdf-ready-box">
              <span className="pdf-icon">📄</span>
              <div>
                <p className="cta-title">{fileName}</p>
                <p className="cta-sub">Gemini AI will read and extract transactions directly from this PDF.</p>
              </div>
            </div>
          )}

          <div className="button-row" style={{ marginTop: "1.25rem" }}>
            <button className="btn btn-ghost" onClick={resetFlow}>← Change file</button>
            <button className="btn btn-primary" onClick={runAudit}>
              🔍 Run Audit for {formatMonthKey(selectedMonth)} →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Loading ── */}
      {step === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Analysing your statement…</p>
          <p className="field-hint">
            {fileType === "pdf"
              ? "Gemini is reading your PDF, extracting transactions, and comparing against your budget."
              : "Gemini is categorising your transactions and comparing against your budget."}
          </p>
          <p className="field-hint" style={{ marginTop: "0.5rem" }}>This takes 10–20 seconds.</p>
        </div>
      )}

      {/* ── Step 4: Results ── */}
      {step === "results" && auditResult && (
        <>
          <div className="card">
            <div className="card-title-row">
              <h3 className="card-title">📊 {formatMonthKey(auditResult.monthKey)} — Audit Results</h3>
              <span className="field-hint">{auditResult.transactions.length} transactions</span>
            </div>

            {/* Summary stats */}
            <div className="stats-grid" style={{ marginBottom: "1rem" }}>
              <div className="stat-card stat-card--warning">
                <p className="stat-label">Total Spent</p>
                <p className="stat-value">{fmt(auditResult.totalSpent)}</p>
              </div>
              <div className="stat-card stat-card--highlight">
                <p className="stat-label">Total Income</p>
                <p className="stat-value">{fmt(auditResult.totalIncome)}</p>
              </div>
              <div className={`stat-card ${auditResult.netSavings >= 0 ? "stat-card--highlight" : "stat-card--warning"}`}>
                <p className="stat-label">Net Savings</p>
                <p className="stat-value">{fmt(auditResult.netSavings)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Savings Rate</p>
                <p className="stat-value">
                  {auditResult.totalIncome > 0
                    ? `${Math.round((auditResult.netSavings / auditResult.totalIncome) * 100)}%`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Budget vs Actual */}
          {auditResult.budgetVariance.length > 0 && (
            <div className="card">
              <h3 className="card-title">📈 Budget vs Actual</h3>
              <div className="variance-legend">
                <span><span className="legend-dot legend-dot--planned" />Planned</span>
                <span><span className="legend-dot legend-dot--actual" />Actual</span>
                {auditResult.budgetVariance.some(v => v.isUnbudgeted) && (
                  <span><span className="legend-dot" style={{ background: "var(--amber)" }} />Not budgeted</span>
                )}
              </div>
              {/* Budgeted categories first */}
              {auditResult.budgetVariance.filter(v => !v.isUnbudgeted).map(item => (
                <VarianceBar key={item.category} item={item} />
              ))}
              {/* Unbudgeted spending — shown as a separate group */}
              {auditResult.budgetVariance.some(v => v.isUnbudgeted) && (
                <>
                  <div style={{ marginTop: "1rem", marginBottom: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                    <p className="field-hint" style={{ fontWeight: 600, color: "var(--amber)" }}>
                      Unbudgeted spending — not in your monthly plan:
                    </p>
                  </div>
                  {auditResult.budgetVariance.filter(v => v.isUnbudgeted).map(item => (
                    <VarianceBar key={item.category} item={item} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Category breakdown */}
          <div className="card">
            <h3 className="card-title">🗂️ Spending by Category</h3>
            {Object.entries(auditResult.categoryTotals)
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
              .map(([cat, amt]) => {
                const pct = auditResult.totalSpent > 0
                  ? ((amt ?? 0) / auditResult.totalSpent) * 100
                  : 0;
                return (
                  <div key={cat} className="category-breakdown-row">
                    <div className="category-breakdown-label">
                      <span>{CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}</span>
                      <span>{fmt(amt ?? 0)} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${pct}%`, background: "var(--color-primary)" }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          {/* AI Insights */}
          <div className="card">
            <h3 className="card-title">🤖 AI Insights</h3>
            <RenderText text={auditResult.insights} />
          </div>

          {/* Goal Impact */}
          {auditResult.goalImpact && (
            <div className="card">
              <h3 className="card-title">🎯 Impact on Your Goals</h3>
              <RenderText text={auditResult.goalImpact} />
            </div>
          )}

          {/* Recommendations */}
          {auditResult.topRecommendations.length > 0 && (
            <div className="card">
              <h3 className="card-title">💡 Top Recommendations</h3>
              <ol className="recommendations-list">
                {auditResult.topRecommendations.map((r, i) => (
                  <li key={i} className="recommendation-item">{r}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Transactions table */}
          <div className="card">
            <h3 className="card-title">🧾 All Transactions ({auditResult.transactions.length})</h3>
            <div className="preview-table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.transactions.map((t, i) => (
                    <tr key={i}>
                      <td>{t.date}</td>
                      <td className="desc-cell">{t.description}</td>
                      <td className={t.type === "debit" ? "text-danger" : "text-success"}>
                        {t.type === "debit" ? "-" : "+"}{fmt(t.amount)}
                      </td>
                      <td>
                        <span className="category-pill">
                          {CATEGORY_LABELS[t.category] ?? t.category}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alert alert-info">
            ⚠️ This audit is for personal planning only. Not financial advice.
          </div>
        </>
      )}
    </div>
  );
};

export default AuditPage;