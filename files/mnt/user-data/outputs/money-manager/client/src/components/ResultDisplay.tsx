// ─────────────────────────────────────────────
//  ResultDisplay.tsx – Step 3
//  Shows:
//  - Financial summary cards (numbers)
//  - Per-goal result cards
//  - AI explanation (from Gemini or fallback)
//  - Disclaimer
// ─────────────────────────────────────────────

import React from "react";
import { AnalysisResponse, GoalResult } from "../types";

interface Props {
  result: AnalysisResponse;
  onReset: () => void;
}

// ── Currency formatter ──────────────────────────
function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ── Summary stat card ───────────────────────────
function StatCard({
  label,
  value,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`stat-card ${highlight ? "stat-card--highlight" : ""} ${
        warning ? "stat-card--warning" : ""
      }`}
    >
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

// ── Per-goal result card ────────────────────────
function GoalCard({ gr }: { gr: GoalResult }) {
  const isImpossible = gr.monthsNeeded === -1;
  const isCoveredBySavings = gr.monthsNeeded === 0;

  let statusText = "";
  let statusClass = "";
  let timelineText = "";

  if (isCoveredBySavings) {
    statusText = "✅ Already Covered";
    statusClass = "goal-card--achievable";
    timelineText = "Your current savings already cover this goal.";
  } else if (isImpossible) {
    statusText = "❌ Not Currently Possible";
    statusClass = "goal-card--impossible";
    timelineText =
      "You can't save enough per month at the current rate. Increasing income or reducing expenses would help.";
  } else if (gr.isAchievable) {
    statusText = "✅ Achievable";
    statusClass = "goal-card--achievable";
    timelineText = `You can reach this in about ${gr.monthsNeeded} month${
      gr.monthsNeeded !== 1 ? "s" : ""
    }, which fits your ${gr.timelineMonths}-month target.`;
  } else {
    statusText = "⚠️ Not in Target Timeline";
    statusClass = "goal-card--warning";
    timelineText = `At your current savings rate, this will take about ${gr.revisedTimelineMonths} month${
      gr.revisedTimelineMonths !== 1 ? "s" : ""
    } instead of ${gr.timelineMonths}.`;
  }

  return (
    <div className={`goal-card ${statusClass}`}>
      <div className="goal-card-header">
        <h4 className="goal-card-title">{gr.goalTitle}</h4>
        <span className={`goal-badge ${statusClass}`}>{statusText}</span>
      </div>

      <div className="goal-card-grid">
        <div className="goal-stat">
          <span className="goal-stat-label">Target Amount</span>
          <span className="goal-stat-value">{fmt(gr.targetAmount)}</span>
        </div>
        <div className="goal-stat">
          <span className="goal-stat-label">Your Timeline</span>
          <span className="goal-stat-value">{gr.timelineMonths} months</span>
        </div>
        {gr.amountCoveredBySavings > 0 && (
          <div className="goal-stat">
            <span className="goal-stat-label">Covered by Savings</span>
            <span className="goal-stat-value goal-stat-value--positive">
              {fmt(gr.amountCoveredBySavings)}
            </span>
          </div>
        )}
        {gr.amountNeededFromMonthlySavings > 0 && (
          <div className="goal-stat">
            <span className="goal-stat-label">Still Needed</span>
            <span className="goal-stat-value">{fmt(gr.amountNeededFromMonthlySavings)}</span>
          </div>
        )}
        {gr.shortfallMonthly > 0 && !gr.isAchievable && (
          <div className="goal-stat">
            <span className="goal-stat-label">Monthly Shortfall</span>
            <span className="goal-stat-value goal-stat-value--negative">
              {fmt(gr.shortfallMonthly)}
            </span>
          </div>
        )}
      </div>

      <p className="goal-timeline-text">{timelineText}</p>

      {!gr.isAchievable && !isImpossible && (
        <div className="goal-revised-timeline">
          <strong>Suggested revised goal:</strong> Aim for {gr.revisedTimelineMonths} months instead of {gr.timelineMonths}.
        </div>
      )}
    </div>
  );
}

// ── Render markdown-lite text ───────────────────
// Converts basic **bold** and ## headers and bullet • to HTML
// This is a minimal renderer — not a full markdown parser
function RenderExplanation({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="ai-explanation">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h4 key={i} className="ai-section-header">
              {line.replace("## ", "")}
            </h4>
          );
        }
        if (line.startsWith("• ") || line.startsWith("- ")) {
          const content = line.replace(/^[•\-] /, "");
          return (
            <p key={i} className="ai-bullet">
              {renderInline(content)}
            </p>
          );
        }
        if (line.startsWith("---")) {
          return <hr key={i} className="ai-divider" />;
        }
        if (line.trim() === "") {
          return <div key={i} style={{ height: "0.5rem" }} />;
        }
        return (
          <p key={i} className="ai-paragraph">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

// Convert **bold** inline markdown
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ── Main component ──────────────────────────────
const ResultDisplay: React.FC<Props> = ({ result, onReset }) => {
  const { calculation: calc, aiExplanation, disclaimer } = result;

  return (
    <div className="form-section">
      <h2 className="section-title">Your Financial Analysis</h2>

      {/* ── Overview warning ── */}
      {calc.hasNegativeDisposable && (
        <div className="alert alert-danger">
          ⚠️ <strong>Heads up:</strong> Your monthly expenses ({fmt(calc.totalEssentialExpenses)}) exceed your income ({fmt(calc.monthlyIncome)}). Saving toward goals will be very difficult until this gap is addressed.
        </div>
      )}

      {/* ── Financial Summary Stats ── */}
      <div className="card">
        <h3 className="card-title">📊 Monthly Breakdown</h3>
        <div className="stats-grid">
          <StatCard label="Monthly Income" value={fmt(calc.monthlyIncome)} />
          <StatCard
            label="Total Expenses"
            value={fmt(calc.totalEssentialExpenses)}
            warning={calc.hasNegativeDisposable}
          />
          <StatCard
            label="Disposable Income"
            value={fmt(calc.disposableIncome)}
            warning={calc.disposableIncome < 0}
          />
          <StatCard
            label="Emergency Buffer / Month"
            value={fmt(calc.emergencyBufferMonthly)}
          />
          <StatCard
            label="Safe Monthly Savings"
            value={fmt(calc.safeMonthlysSavings)}
            highlight={calc.safeMonthlysSavings > 0}
          />
          <StatCard
            label={`Current Savings (${calc.useSavingsForGoal ? "used for goals" : "not counted"})`}
            value={fmt(calc.currentSavings)}
          />
        </div>
      </div>

      {/* ── Goal Results ── */}
      <div className="card">
        <h3 className="card-title">🎯 Goal Analysis</h3>
        <div className="goal-cards">
          {calc.goalResults.map((gr) => (
            <GoalCard key={gr.goalId} gr={gr} />
          ))}
        </div>
      </div>

      {/* ── AI Explanation ── */}
      <div className="card">
        <h3 className="card-title">🤖 AI-Powered Advice</h3>
        <RenderExplanation text={aiExplanation} />
      </div>

      {/* ── Disclaimer ── */}
      <div className="alert alert-info">
        {disclaimer}
      </div>

      {/* ── Reset ── */}
      <button className="btn btn-ghost btn-full" onClick={onReset}>
        ← Start Over / Adjust Inputs
      </button>
    </div>
  );
};

export default ResultDisplay;
