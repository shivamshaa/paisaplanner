import React from "react";
import { SavedProfile, GoalWithProgress, CATEGORY_LABELS } from "../types";
import { getCurrentMonthKey, formatMonthKey, getAuditForMonth } from "../utils/storage";

interface Props {
  profile: SavedProfile;
  goals: GoalWithProgress[];
  onNavigate: (view: "goals" | "audit" | "settings") => void;
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Compute a simple financial health score 0-100
function computeHealthScore(profile: SavedProfile): number {
  const calc = profile.calculationResult;
  let score = 0;
  // Savings rate 0-40 pts
  const savingsRate = calc.monthlyIncome > 0 ? calc.safeMonthlysSavings / calc.monthlyIncome : 0;
  score += Math.min(40, Math.round(savingsRate * 200));
  // Not negative disposable 0-20 pts
  if (!calc.hasNegativeDisposable) score += 20;
  // Has investments 0-20 pts
  if (calc.totalMonthlyInvestments > 0) {
    const invRate = calc.totalMonthlyInvestments / calc.monthlyIncome;
    score += Math.min(20, Math.round(invRate * 100));
  }
  // Goals achievable 0-20 pts
  if (calc.goalResults.length > 0) {
    const achievable = calc.goalResults.filter(g => g.isAchievable).length;
    score += Math.round((achievable / calc.goalResults.length) * 20);
  } else {
    score += 10;
  }
  return Math.min(100, score);
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "Excellent", color: "#10B981" };
  if (score >= 55) return { label: "Good",      color: "#3B82F6" };
  if (score >= 35) return { label: "Fair",       color: "#F59E0B" };
  return                  { label: "Needs Work", color: "#EF4444" };
}

// Spending category colours
const CAT_COLORS: Record<string, string> = {
  rent_emi: "#3B82F6", groceries: "#10B981", food_dining: "#F59E0B",
  transport: "#8B5CF6", utilities_bills: "#06B6D4", shopping: "#EC4899",
  entertainment: "#F97316", health: "#14B8A6", education: "#6366F1",
  savings_investment: "#22C55E", others: "#94A3B8",
};

function ProgressBar({ value, max, color = "var(--blue)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress-track" style={{ marginBottom: "0.25rem" }}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--emerald)" : color }} />
    </div>
  );
}

const Dashboard: React.FC<Props> = ({ profile, goals, onNavigate }) => {
  const monthKey   = getCurrentMonthKey();
  const monthLabel = formatMonthKey(monthKey);
  const calc       = profile.calculationResult;
  const audit      = getAuditForMonth(monthKey);
  const score      = computeHealthScore(profile);
  const { label: scoreTag, color: scoreColor } = scoreLabel(score);
  const achievable = calc.goalResults.filter(g => g.isAchievable).length;

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">{monthLabel}</p>
        </div>
        {!audit && (
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate("audit")}>
            Run Audit
          </button>
        )}
      </div>

      {calc.hasNegativeDisposable && (
        <div className="alert alert-danger">
          <span>⚠️</span>
          <span>
            Your expenses ({fmt(calc.totalEssentialExpenses + calc.totalMonthlyInvestments)}) exceed
            your income ({fmt(calc.monthlyIncome)}).{" "}
            <button className="link-btn" onClick={() => onNavigate("settings")}>Update profile →</button>
          </span>
        </div>
      )}

      {/* ── Health hero ── */}
      <div className="health-hero">
        <div className="health-hero-top">
          <div>
            <div className="health-hero-label">Financial Health Score</div>
            <div className="health-hero-score" style={{ color: scoreColor }}>{score}</div>
            <div className="health-hero-status">{scoreTag} · {monthLabel}</div>
          </div>
          <div className="health-hero-badge">
            {calc.goalResults.length > 0 ? `${achievable}/${calc.goalResults.length} goals on track` : "No goals set"}
          </div>
        </div>
        <div className="health-hero-stats">
          <div className="health-mini-stat">
            <div className="health-mini-label">Income</div>
            <div className="health-mini-value">{fmt(calc.monthlyIncome)}</div>
          </div>
          <div className="health-mini-stat">
            <div className="health-mini-label">Safe Savings</div>
            <div className="health-mini-value">{fmt(calc.safeMonthlysSavings)}</div>
          </div>
          <div className="health-mini-stat">
            <div className="health-mini-label">Investing</div>
            <div className="health-mini-value">{fmt(calc.totalMonthlyInvestments)}</div>
          </div>
        </div>
      </div>

      {/* ── Monthly breakdown ── */}
      <div className="card">
        <h3 className="card-title">Monthly Breakdown</h3>
        <div className="stats-grid">
          <div className="stat-card stat-card--blue">
            <p className="stat-label">Income</p>
            <p className="stat-value">{fmt(calc.monthlyIncome)}</p>
          </div>
          <div className="stat-card stat-card--amber">
            <p className="stat-label">Essential Expenses</p>
            <p className="stat-value">{fmt(calc.totalEssentialExpenses)}</p>
          </div>
          {calc.totalMonthlyInvestments > 0 && (
            <div className="stat-card stat-card--purple">
              <p className="stat-label">Monthly Investments</p>
              <p className="stat-value">{fmt(calc.totalMonthlyInvestments)}</p>
              <p className="stat-sub">SIP, RD, PPF &amp; more</p>
            </div>
          )}
          <div className="stat-card">
            <p className="stat-label">Emergency Buffer</p>
            <p className="stat-value">{fmt(calc.emergencyBufferMonthly)}</p>
          </div>
          <div className={`stat-card ${calc.safeMonthlysSavings > 0 ? "stat-card--green" : "stat-card--red"}`}>
            <p className="stat-label">Safe Goal Savings</p>
            <p className="stat-value">{fmt(calc.safeMonthlysSavings)}</p>
          </div>
        </div>
      </div>

      {/* ── Audit summary or CTA ── */}
      {audit ? (
        <div className="card">
          <div className="card-title-row">
            <h3 className="card-title">This Month's Audit</h3>
            <button className="link-btn" onClick={() => onNavigate("audit")}>Full report →</button>
          </div>
          <div className="stats-grid" style={{ marginBottom: "1rem" }}>
            <div className="stat-card stat-card--red">
              <p className="stat-label">Total Spent</p>
              <p className="stat-value">{fmt(audit.totalSpent)}</p>
            </div>
            <div className="stat-card stat-card--green">
              <p className="stat-label">Net Savings</p>
              <p className="stat-value">{fmt(audit.netSavings)}</p>
            </div>
          </div>
          {/* Spending bar */}
          {Object.keys(audit.categoryTotals).length > 0 && (
            <div className="spend-bar-container">
              <div className="spend-bar">
                {Object.entries(audit.categoryTotals)
                  .filter(([, v]) => (v ?? 0) > 0)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .map(([cat, amt]) => {
                    const pct = audit.totalSpent > 0 ? ((amt ?? 0) / audit.totalSpent) * 100 : 0;
                    return (
                      <div
                        key={cat}
                        className="spend-bar-segment"
                        style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? "#94A3B8" }}
                        title={`${CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}: ${fmt(amt ?? 0)}`}
                      />
                    );
                  })}
              </div>
              <div className="spend-legend">
                {Object.entries(audit.categoryTotals)
                  .filter(([, v]) => (v ?? 0) > 0)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .slice(0, 5)
                  .map(([cat, amt]) => (
                    <div key={cat} className="spend-legend-item">
                      <div className="spend-legend-dot" style={{ background: CAT_COLORS[cat] ?? "#94A3B8" }} />
                      <span>{CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat} · {fmt(amt ?? 0)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card card--cta">
          <div className="cta-content">
            <span className="cta-icon">🔍</span>
            <div>
              <p className="cta-title">No audit yet for {monthLabel}</p>
              <p className="cta-sub">Upload your bank statement to see actual vs planned spending.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate("audit")}>Run Audit →</button>
        </div>
      )}

      {/* ── Goals overview ── */}
      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title">Goals ({goals.length})</h3>
          <button className="link-btn" onClick={() => onNavigate("goals")}>Manage →</button>
        </div>
        {goals.length === 0 ? (
          <p className="empty-state">No goals yet. <button className="link-btn" onClick={() => onNavigate("settings")}>Add goals in settings →</button></p>
        ) : (
          <div className="goal-overview-list">
            {goals.slice(0, 4).map(g => {
              const pct = g.targetAmount > 0 ? Math.min(100, (g.totalSaved / g.targetAmount) * 100) : 0;
              return (
                <div key={g.id} className="goal-overview-item">
                  <div className="goal-overview-row">
                    <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{g.title}</span>
                    <span className="goal-overview-amounts">{fmt(g.totalSaved)} / {fmt(g.targetAmount)}</span>
                  </div>
                  <ProgressBar value={g.totalSaved} max={g.targetAmount} color={pct >= 100 ? "var(--emerald)" : "var(--blue)"} />
                </div>
              );
            })}
            {goals.length > 4 && <p className="helper-text" style={{ textAlign: "left" }}>+{goals.length - 4} more · <button className="link-btn" onClick={() => onNavigate("goals")}>view all</button></p>}
          </div>
        )}
      </div>
    </div>
  );
};
export default Dashboard;