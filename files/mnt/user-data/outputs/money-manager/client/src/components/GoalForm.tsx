// ─────────────────────────────────────────────
//  GoalForm.tsx – Step 2
//  Lets the user add multiple goals with:
//  - title, type, target amount, timeline
// ─────────────────────────────────────────────

import React, { useState } from "react";
import { Goal, GoalType } from "../types";

interface Props {
  goals: Goal[];
  onChange: (goals: Goal[]) => void;
  onNext: () => void;
  onBack: () => void;
}

// Human-readable labels for each goal type
const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: "💰 General Savings",
  domestic_trip: "🗺️ Domestic Trip",
  international_trip: "✈️ International Trip",
  gift: "🎁 Buy a Gift",
  gadget: "📱 Buy a Gadget / Item",
  event: "🎉 Save for an Event",
  emergency_fund: "🛡️ Emergency Fund",
  custom: "✏️ Custom Goal",
};

// Default blank goal for the "add goal" form
const blankGoal = (): Omit<Goal, "id"> => ({
  title: "",
  type: "savings",
  targetAmount: 0,
  timelineMonths: 3,
});

const GoalForm: React.FC<Props> = ({ goals, onChange, onNext, onBack }) => {
  // Form state for the currently-being-added goal
  const [draft, setDraft] = useState<Omit<Goal, "id">>(blankGoal());
  const [draftError, setDraftError] = useState<string>("");

  // Update a field in the draft
  const setDraftField = (key: keyof Omit<Goal, "id">, val: any) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
    setDraftError(""); // clear error on change
  };

  // Validate and add the draft goal to the list
  const addGoal = () => {
    if (!draft.title.trim()) {
      setDraftError("Please enter a goal title.");
      return;
    }
    if (draft.targetAmount <= 0) {
      setDraftError("Please enter a target amount greater than ₹0.");
      return;
    }
    if (draft.timelineMonths < 1 || draft.timelineMonths > 12) {
      setDraftError("Timeline must be between 1 and 12 months.");
      return;
    }
    if (goals.length >= 10) {
      setDraftError("Maximum 10 goals allowed.");
      return;
    }

    const newGoal: Goal = {
      ...draft,
      id: `goal_${Date.now()}`, // simple unique ID
    };

    onChange([...goals, newGoal]);
    setDraft(blankGoal()); // reset form
    setDraftError("");
  };

  // Remove a goal from the list
  const removeGoal = (id: string) => {
    onChange(goals.filter((g) => g.id !== id));
  };

  const canProceed = goals.length > 0;

  return (
    <div className="form-section">
      <h2 className="section-title">Step 2: Your Goals</h2>
      <p className="section-subtitle">
        Add the financial goals you want to achieve. You can add up to 10 goals.
        Goals can be for 1–12 months from now.
      </p>

      {/* ── Add a new goal ── */}
      <div className="card">
        <h3 className="card-title">➕ Add a Goal</h3>

        <div className="field">
          <label className="field-label">Goal title</label>
          <input
            type="text"
            className="input-text"
            value={draft.title}
            placeholder="e.g. Goa trip, New phone, Emergency fund..."
            maxLength={60}
            onChange={(e) => setDraftField("title", e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Goal type</label>
          <select
            className="input-select"
            value={draft.type}
            onChange={(e) => setDraftField("type", e.target.value as GoalType)}
          >
            {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Target amount</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">₹</span>
            <input
              type="number"
              className="input-number"
              value={draft.targetAmount === 0 ? "" : draft.targetAmount}
              placeholder="e.g. 45000"
              min={1}
              onChange={(e) =>
                setDraftField("targetAmount", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">
            Timeline: <strong>{draft.timelineMonths} month{draft.timelineMonths !== 1 ? "s" : ""}</strong>
          </label>
          <p className="field-hint">How many months from now do you want to achieve this?</p>
          <div className="timeline-group">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
              const isShortTerm = m <= 6;
              const label = isShortTerm ? "Short-term" : "Long-term";
              return (
                <button
                  key={m}
                  type="button"
                  className={`timeline-btn ${draft.timelineMonths === m ? "timeline-btn--active" : ""} ${isShortTerm ? "timeline-btn--short" : "timeline-btn--long"}`}
                  onClick={() => setDraftField("timelineMonths", m)}
                  title={`${m} month${m !== 1 ? "s" : ""} (${label})`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <p className="field-hint" style={{ marginTop: "0.4rem" }}>
            {draft.timelineMonths <= 6
              ? "🟡 Short-term goal (1–6 months)"
              : "🔵 Long-term goal (7–12 months)"}
          </p>
        </div>

        {draftError && <p className="error-text">{draftError}</p>}

        <button className="btn btn-secondary" onClick={addGoal}>
          + Add This Goal
        </button>
      </div>

      {/* ── Goal list ── */}
      {goals.length > 0 && (
        <div className="card">
          <h3 className="card-title">📋 Your Goals ({goals.length})</h3>
          <div className="goal-list">
            {goals.map((goal) => (
              <div key={goal.id} className="goal-item">
                <div className="goal-item-info">
                  <span className="goal-item-title">{goal.title}</span>
                  <span className="goal-item-meta">
                    {GOAL_TYPE_LABELS[goal.type]} &nbsp;·&nbsp; ₹
                    {goal.targetAmount.toLocaleString("en-IN")} &nbsp;·&nbsp;{" "}
                    {goal.timelineMonths} month{goal.timelineMonths !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  className="btn-remove"
                  onClick={() => removeGoal(goal.id)}
                  title="Remove this goal"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div className="button-row">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          Analyze My Finances →
        </button>
      </div>
      {!canProceed && (
        <p className="helper-text">Add at least one goal to continue.</p>
      )}
    </div>
  );
};

export default GoalForm;
