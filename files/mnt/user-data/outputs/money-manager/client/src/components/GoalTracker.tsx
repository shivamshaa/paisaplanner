import React, { useState } from "react";
import { GoalWithProgress, GoalContribution } from "../types";
import { addGoalContribution, removeGoalContribution, getGoals, getCurrentMonthKey, getAuditForMonth, formatMonthKey } from "../utils/storage";

interface Props {
  goals: GoalWithProgress[];
  onGoalsUpdated: () => void;
  onNavigate: (view: "audit") => void;
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = pct >= 100 ? "progress-fill--green" : pct >= 60 ? "" : "progress-fill--amber";
  return (
    <div className="progress-track progress-track--thick">
      <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ContributeModal({ goal, suggested, monthKey, onSave, onClose }: {
  goal: GoalWithProgress; suggested: number; monthKey: string;
  onSave: (amount: number, note: string) => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(suggested > 0 ? suggested : 0);
  const [note, setNote]     = useState(`From ${formatMonthKey(monthKey)} audit`);
  const [error, setError]   = useState("");
  const remaining = Math.max(0, goal.targetAmount - goal.totalSaved);

  const handleSave = () => {
    if (amount <= 0) { setError("Amount must be > ₹0"); return; }
    if (remaining > 0 && amount > remaining) { setError(`Exceeds remaining target (${fmt(remaining)})`); return; }
    onSave(amount, note);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Record Contribution</h3>
        <p className="modal-subtitle">Goal: <strong>{goal.title}</strong></p>
        <div className="modal-progress">
          <div className="modal-progress-row"><span>Already saved</span><span className="text-bold text-success">{fmt(goal.totalSaved)}</span></div>
          <div className="modal-progress-row"><span>Still needed</span><span className="text-bold">{fmt(remaining)}</span></div>
        </div>
        <div className="field">
          <label className="field-label">Amount to record</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">₹</span>
            <input type="number" className="input-number" value={amount || ""} min={1}
              onChange={e => { setAmount(Number(e.target.value) || 0); setError(""); }} />
          </div>
          {suggested > 0 && (
            <p className="field-hint">Suggested from this month's savings. <button className="link-btn" onClick={() => setAmount(suggested)}>Use {fmt(suggested)}</button></p>
          )}
        </div>
        <div className="field">
          <label className="field-label">Note (optional)</label>
          <input type="text" className="input-text" value={note} maxLength={80} onChange={e => setNote(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="button-row">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

const GoalTracker: React.FC<Props> = ({ goals, onGoalsUpdated, onNavigate }) => {
  const monthKey   = getCurrentMonthKey();
  const audit      = getAuditForMonth(monthKey);
  const monthLabel = formatMonthKey(monthKey);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);

  const getSuggested = (goalId: string) => {
    if (!audit || audit.netSavings <= 0) return 0;
    const incomplete = goals.filter(g => g.totalSaved < g.targetAmount);
    if (!incomplete.some(g => g.id === goalId)) return 0;
    return Math.floor(audit.netSavings / incomplete.length);
  };

  const handleContribute = (goalId: string, amount: number, note: string) => {
    addGoalContribution(goalId, { monthKey, amount, note });
    setActiveModal(null);
    onGoalsUpdated();
  };

  if (goals.length === 0) {
    return (
      <div className="page-content">
        <div className="page-header"><h2 className="page-title">Goals</h2></div>
        <div className="card card--cta">
          <div className="cta-content">
            <span className="cta-icon">🎯</span>
            <div><p className="cta-title">No goals yet</p><p className="cta-sub">Go to Settings to add financial goals.</p></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2 className="page-title">Goals</h2>
          <p className="page-subtitle">{goals.length} goal{goals.length !== 1 ? "s" : ""} tracked</p>
        </div>
        {audit && (
          <div className="audit-savings-badge">
            <span>{monthLabel} savings:</span>
            <strong>{fmt(Math.max(0, audit.netSavings))}</strong>
          </div>
        )}
      </div>

      {!audit && (
        <div className="alert alert-info">
          <span>💡</span>
          <span>Run a <button className="link-btn" onClick={() => onNavigate("audit")}>monthly audit</button> to get suggested contribution amounts.</span>
        </div>
      )}

      <div className="goal-tracker-list">
        {goals.map(goal => {
          const pct       = goal.targetAmount > 0 ? Math.min(100, (goal.totalSaved / goal.targetAmount) * 100) : 0;
          const remaining = Math.max(0, goal.targetAmount - goal.totalSaved);
          const isDone    = goal.totalSaved >= goal.targetAmount;
          const isExpanded = expanded === goal.id;
          const suggested  = getSuggested(goal.id);

          return (
            <div key={goal.id} className={`goal-tracker-card ${isDone ? "goal-tracker-card--done" : ""}`}>
              <div className="goal-tracker-header">
                <div className="goal-tracker-title-row">
                  <span className="goal-item-title">{isDone ? "✅ " : ""}{goal.title}</span>
                  <span className="goal-tracker-pct">{Math.round(pct)}%</span>
                </div>
                <div className="goal-tracker-meta">{goal.type.replace(/_/g, " ")} · {goal.timelineMonths} months</div>
              </div>

              <ProgressBar value={goal.totalSaved} max={goal.targetAmount} />

              <div className="goal-tracker-amounts">
                <span className="text-success text-bold">{fmt(goal.totalSaved)} saved</span>
                <span className="text-muted">{fmt(goal.targetAmount)} target</span>
              </div>

              {!isDone && <div className="goal-tracker-remaining">{fmt(remaining)} remaining</div>}

              <div className="goal-tracker-actions" style={{ marginTop: "0.75rem" }}>
                {!isDone && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal(goal.id)}>
                    + Record
                    {suggested > 0 && <span className="btn-badge">{fmt(suggested)}</span>}
                  </button>
                )}
                {goal.contributions.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(isExpanded ? null : goal.id)}>
                    {isExpanded ? "Hide" : `History (${goal.contributions.length})`}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="contribution-history">
                  {[...goal.contributions].reverse().map(c => (
                    <div key={c.id} className="contribution-row">
                      <div className="contribution-info">
                        <span className="contribution-amount">{fmt(c.amount)}</span>
                        <span className="contribution-meta">{formatMonthKey(c.monthKey)} · {c.note}</span>
                      </div>
                      <button className="btn-remove" onClick={() => { removeGoalContribution(goal.id, c.id); onGoalsUpdated(); }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeModal && (
        <ContributeModal
          goal={goals.find(g => g.id === activeModal)!}
          suggested={getSuggested(activeModal)}
          monthKey={monthKey}
          onSave={(a, n) => handleContribute(activeModal, a, n)}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
};
export default GoalTracker;