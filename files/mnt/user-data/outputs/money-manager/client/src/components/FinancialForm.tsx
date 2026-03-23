import React, { useState } from "react";
import { FinancialInput, Expenses, MonthlyInvestments } from "../types";

interface Props {
  data: Omit<FinancialInput, "goals">;
  onChange: (updated: Omit<FinancialInput, "goals">) => void;
  onNext: () => void;
  submitLabel?: string;
}

function NumberField({ label, value, onChange, placeholder, hint }: {
  label: string; value: number; onChange: (v: number) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {hint && <p className="field-hint">{hint}</p>}
      <div className="input-prefix-wrapper">
        <span className="input-prefix">₹</span>
        <input type="number" className="input-number"
          value={value === 0 ? "" : value} placeholder={placeholder || "0"} min={0}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} />
      </div>
    </div>
  );
}

const FinancialForm: React.FC<Props> = ({ data, onChange, onNext, submitLabel }) => {
  const [showInvestments, setShowInvestments] = useState(false);

  const setField = (key: keyof Omit<FinancialInput, "goals" | "expenses" | "investments">, val: any) =>
    onChange({ ...data, [key]: val });

  const setExpense = (key: keyof Expenses, val: number) =>
    onChange({ ...data, expenses: { ...data.expenses, [key]: val } });

  const setInvestment = (key: keyof MonthlyInvestments, val: number) =>
    onChange({ ...data, investments: { ...data.investments, [key]: val } });

  const totalExpenses = Object.values(data.expenses).reduce((a, b) => a + b, 0);
  const totalInvestments = data.investments ? Object.values(data.investments).reduce((a, b) => a + b, 0) : 0;
  const disposable = data.monthlyIncome - totalExpenses - totalInvestments;

  return (
    <div className="form-section">
      <h2 className="section-title">Your Finances</h2>
      <p className="section-subtitle">All values in Indian Rupees (₹). Fill in what applies to you.</p>

      {/* Income & Savings */}
      <div className="card">
        <h3 className="card-title">💰 Income & Savings</h3>
        <NumberField label="Monthly take-home income" value={data.monthlyIncome}
          onChange={v => setField("monthlyIncome", v)} placeholder="50000"
          hint="Your salary after taxes, every month" />
        <NumberField label="Current savings" value={data.currentSavings}
          onChange={v => setField("currentSavings", v)} placeholder="30000"
          hint="Total savings you have right now" />
        <div className="field">
          <label className="field-label">Use current savings toward goals?</label>
          <p className="field-hint">Choose Yes to count existing savings toward your goal timeline.</p>
          <div className="radio-group">
            <label className="radio-option">
              <input type="radio" name="useSavings" checked={data.useSavingsForGoal}
                onChange={() => setField("useSavingsForGoal", true)} />
              <span><strong>Yes</strong> — include my savings in goal calculations</span>
            </label>
            <label className="radio-option">
              <input type="radio" name="useSavings" checked={!data.useSavingsForGoal}
                onChange={() => setField("useSavingsForGoal", false)} />
              <span><strong>No</strong> — plan only from monthly income</span>
            </label>
          </div>
        </div>
      </div>

      {/* Expenses */}
      <div className="card">
        <h3 className="card-title">🧾 Essential Monthly Expenses</h3>
        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          Only mandatory, unavoidable expenses. Leave 0 if not applicable.
        </p>
        <NumberField label="Rent / EMI" value={data.expenses.rent} onChange={v => setExpense("rent", v)} placeholder="12000" />
        <NumberField label="Groceries & food supplies" value={data.expenses.groceries} onChange={v => setExpense("groceries", v)} placeholder="5000" />
        <NumberField label="Travel & commute" value={data.expenses.travel} onChange={v => setExpense("travel", v)} placeholder="2000" />
        <NumberField label="Bills & utilities (electricity, internet, mobile)" value={data.expenses.bills} onChange={v => setExpense("bills", v)} placeholder="3000" />
        <NumberField label="Daily needs & household" value={data.expenses.dailyNeeds} onChange={v => setExpense("dailyNeeds", v)} placeholder="2000" />
        <NumberField label="Other mandatory expenses" value={data.expenses.others} onChange={v => setExpense("others", v)} placeholder="1000"
          hint="Medical, school fees, insurance premiums, etc." />
      </div>

      {/* Investments — collapsible */}
      <div className="card">
        <div className="collapsible-header" onClick={() => setShowInvestments(o => !o)}>
          <h3 className="card-title" style={{ margin: 0 }}>
            📈 Monthly Investments
            {totalInvestments > 0 && (
              <span className="investments-badge" style={{ marginLeft: "0.6rem" }}>
                {`₹${Math.round(totalInvestments).toLocaleString("en-IN")}/month`}
              </span>
            )}
          </h3>
          <span className={`collapsible-arrow ${showInvestments ? "collapsible-arrow--open" : ""}`}>▼</span>
        </div>
        {!showInvestments && (
          <p className="field-hint" style={{ marginTop: "0.5rem" }}>
            SIPs, RD, PPF, NPS — tracked separately from expenses, shown as wealth-building.
            <button className="link-btn" style={{ marginLeft: "0.3rem" }} onClick={() => setShowInvestments(true)}>
              Add investments →
            </button>
          </p>
        )}
        {showInvestments && (
          <div className="investment-grid" style={{ marginTop: "0.75rem" }}>
            <NumberField label="SIP (Mutual Funds)" value={data.investments?.sip ?? 0}
              onChange={v => setInvestment("sip", v)} placeholder="3000" />
            <NumberField label="Recurring Deposit (RD)" value={data.investments?.rd ?? 0}
              onChange={v => setInvestment("rd", v)} placeholder="2000" />
            <NumberField label="PPF" value={data.investments?.ppf ?? 0}
              onChange={v => setInvestment("ppf", v)} placeholder="500" />
            <NumberField label="NPS" value={data.investments?.nps ?? 0}
              onChange={v => setInvestment("nps", v)} placeholder="500" />
            <NumberField label="Direct Stocks" value={data.investments?.stocks ?? 0}
              onChange={v => setInvestment("stocks", v)} placeholder="1000" />
            <NumberField label="Other Investments" value={data.investments?.others ?? 0}
              onChange={v => setInvestment("others", v)} placeholder="0" />
          </div>
        )}
      </div>

      {/* Live preview */}
      {data.monthlyIncome > 0 && (
        <div className={`preview-box ${disposable < 0 ? "preview-box--warning" : ""}`}>
          <div className="preview-row"><span>Monthly income</span><span>₹{data.monthlyIncome.toLocaleString("en-IN")}</span></div>
          <div className="preview-row"><span>Expenses</span><span>₹{totalExpenses.toLocaleString("en-IN")}</span></div>
          {totalInvestments > 0 && <div className="preview-row"><span>Investments</span><span>₹{totalInvestments.toLocaleString("en-IN")}</span></div>}
          <div className="preview-row preview-row--total">
            <span>Available for goals &amp; savings</span>
            <span className={disposable < 0 ? "text-danger" : "text-success"}>
              ₹{disposable.toLocaleString("en-IN")} {disposable < 0 && "⚠️"}
            </span>
          </div>
          {disposable < 0 && <p className="preview-warning">Expenses exceed income. You can continue but saving will be very difficult.</p>}
        </div>
      )}

      <button className="btn btn-primary btn-full" onClick={onNext} disabled={!data.monthlyIncome}>
        {submitLabel ?? "Next: Set Your Goals →"}
      </button>
      {!data.monthlyIncome && <p className="helper-text">Enter your monthly income to continue.</p>}
    </div>
  );
};
export default FinancialForm;