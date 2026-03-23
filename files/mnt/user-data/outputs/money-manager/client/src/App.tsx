// ─────────────────────────────────────────────
//  App.tsx – Root component
//
//  Routing logic:
//   - No saved profile → 3-step setup flow (existing)
//   - Profile exists   → Sidebar app with Dashboard/Goals/Audit/Settings
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import FinancialForm from "./components/FinancialForm";
import GoalForm from "./components/GoalForm";
import ResultDisplay from "./components/ResultDisplay";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import GoalTracker from "./components/GoalTracker";
import AuditPage from "./components/AuditPage";
import {
  FinancialInput,
  Goal,
  AppStep,
  AppView,
  AnalysisResponse,
  GoalWithProgress,
  SavedProfile,
  defaultExpenses,
  defaultInvestments,
} from "./types";
import {
  getProfile,
  saveProfile,
  getGoals,
  initGoalsFromSetup,
  clearAllData,
  hasProfile,
} from "./utils/storage";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

// ── Setup flow (runs once on first visit) ───────
function SetupFlow() {
  const [step, setStep]             = useState<AppStep>("financial");
  const [financialData, setFin]     = useState<Omit<FinancialInput, "goals">>({
    monthlyIncome: 0, currentSavings: 0, useSavingsForGoal: true,
    expenses: defaultExpenses, investments: defaultInvestments,
  });
  const [goals, setGoals]           = useState<Goal[]>([]);
  const [result, setResult]         = useState<AnalysisResponse | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState("");

  const handleAnalyze = async () => {
    setIsLoading(true); setError("");
    const payload: FinancialInput = { ...financialData, goals };
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialData: payload }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || `Server error ${res.status}`);
      }
      const data: AnalysisResponse = await res.json();

      // Save profile + goals to localStorage
      saveProfile(
        { monthlyIncome: financialData.monthlyIncome, currentSavings: financialData.currentSavings,
          useSavingsForGoal: financialData.useSavingsForGoal, expenses: financialData.expenses,
          investments: financialData.investments ?? defaultInvestments },
        data.calculation
      );
      initGoalsFromSetup(goals);

      setResult(data);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Could not reach the server. Is it running?");
    } finally {
      setIsLoading(false);
    }
  };

  // After seeing results, trigger a page reload to enter the main app
  const handleEnterApp = () => window.location.reload();

  const steps = [
    { key: "financial", label: "1. Finances" },
    { key: "goals",     label: "2. Goals"    },
    { key: "results",   label: "3. Results"  },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">💸 Paisa Planner</h1>
        <p className="app-tagline">Know if your financial goals are realistic — honest math + AI</p>
      </header>

      <div className="step-indicator">
        {steps.map((s, i) => (
          <div key={s.key} className={`step-dot ${step === s.key ? "step-dot--active" : ""}
            ${(step === "goals" && i === 0) || (step === "results" && i <= 1) ? "step-dot--done" : ""}`}>
            <div className="step-dot-circle">{i + 1}</div>
            <span className="step-dot-label">{s.label}</span>
          </div>
        ))}
      </div>

      <main className="app-main">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-box">
              <div className="spinner" />
              <p>Analysing your finances…</p>
              <p className="loading-sub">Running calculations + AI advice</p>
            </div>
          </div>
        )}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
            ❌ {error}<br />
            <small>Make sure the backend is running: <code>cd server && npm run dev</code></small>
          </div>
        )}
        {step === "financial" && (
          <FinancialForm data={financialData} onChange={setFin} onNext={() => setStep("goals")} />
        )}
        {step === "goals" && (
          <GoalForm goals={goals} onChange={setGoals}
            onBack={() => setStep("financial")} onNext={handleAnalyze} />
        )}
        {step === "results" && result && (
          <>
            <ResultDisplay result={result} onReset={() => setStep("financial")} />
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button className="btn btn-primary btn-full" onClick={handleEnterApp}>
                Enter Paisa Planner →
              </button>
              <p className="helper-text" style={{ marginTop: "0.5rem" }}>
                Your profile has been saved. You can track goals and run monthly audits.
              </p>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>Personal planning tool only — not financial advice.</p>
      </footer>
    </div>
  );
}

// ── Settings view ──────────────────────────────
// Separate component so it has its own local state for the goals step.
// Two-tab layout: Financial Profile | Goals
interface SettingsViewProps {
  financialData: Omit<FinancialInput, "goals">;
  onFinancialChange: (d: Omit<FinancialInput, "goals">) => void;
  existingGoals: GoalWithProgress[];
  onSave: (goals: Goal[]) => void;
  error: string;
}

function SettingsView({ financialData, onFinancialChange, existingGoals, onSave, error }: SettingsViewProps) {
  const [tab, setTab] = useState<"financial" | "goals">("financial");

  // Seed goal editor from existing goals (strip contribution history for editing)
  const [editGoals, setEditGoals] = useState<Goal[]>(
    existingGoals.map((g) => ({
      id: g.id, title: g.title, type: g.type,
      targetAmount: g.targetAmount, timelineMonths: g.timelineMonths,
    }))
  );

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Update your financial profile and goals</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>
      )}

      {/* Tab switcher */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === "financial" ? "settings-tab--active" : ""}`}
          onClick={() => setTab("financial")}
        >
          💰 Financial Profile
        </button>
        <button
          className={`settings-tab ${tab === "goals" ? "settings-tab--active" : ""}`}
          onClick={() => setTab("goals")}
        >
          🎯 Goals
        </button>
      </div>

      {tab === "financial" && (
        <FinancialForm
          data={financialData}
          onChange={onFinancialChange}
          submitLabel="Save Changes"
          onNext={() => onSave(editGoals)}
        />
      )}

      {tab === "goals" && (
        <GoalForm
          goals={editGoals}
          onChange={setEditGoals}
          onBack={() => setTab("financial")}
          onNext={() => onSave(editGoals)}
        />
      )}
    </div>
  );
}

// ── Main sidebar app (after setup) ─────────────
function MainApp() {
  const [view, setView]         = useState<AppView>("dashboard");
  const [profile, setProfile]   = useState<SavedProfile>(getProfile()!);
  const [goals, setGoals]       = useState<GoalWithProgress[]>(getGoals());

  // Re-read from localStorage after any mutation
  const refresh = useCallback(() => {
    setProfile(getProfile()!);
    setGoals(getGoals());
  }, []);

  // Settings = re-run the setup flow, then come back
  // We handle this by resetting to setup mode
  const handleReset = () => {
    clearAllData();
    window.location.reload();
  };

  // Settings: update profile (re-analyze)
  const [isLoading, setIsLoading]   = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [financialData, setFin]     = useState<Omit<FinancialInput, "goals">>({
    monthlyIncome:     profile.monthlyIncome,
    currentSavings:    profile.currentSavings,
    useSavingsForGoal: profile.useSavingsForGoal,
    expenses:          profile.expenses,
    investments:       profile.investments ?? defaultInvestments,
  });

  // updatedGoals comes from SettingsView — may include new/removed/edited goals
  const handleSaveSettings = async (updatedGoals: Goal[]) => {
    setIsLoading(true); setSettingsError("");
    const payload: FinancialInput = {
      ...financialData,
      goals: updatedGoals,
    };
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialData: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data: AnalysisResponse = await res.json();
      saveProfile(
        { monthlyIncome: financialData.monthlyIncome, currentSavings: financialData.currentSavings,
          useSavingsForGoal: financialData.useSavingsForGoal, expenses: financialData.expenses,
          investments: financialData.investments ?? defaultInvestments },
        data.calculation
      );
      // Merge updated goals with existing contribution history so progress isn't lost
      initGoalsFromSetup(updatedGoals);
      refresh();
      setView("dashboard");
    } catch (err: any) {
      setSettingsError(err.message || "Failed to save settings.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sidebar-app">
      <Sidebar currentView={view} onNavigate={setView} onReset={handleReset} />

      <main className="sidebar-main">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-box">
              <div className="spinner" />
              <p>Updating your profile…</p>
            </div>
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard profile={profile} goals={goals} onNavigate={setView} />
        )}

        {view === "goals" && (
          <GoalTracker goals={goals} onGoalsUpdated={refresh} onNavigate={setView} />
        )}

        {view === "audit" && (
          <AuditPage profile={profile} goals={goals} onAuditSaved={refresh} />
        )}

        {view === "settings" && (
          <SettingsView
            financialData={financialData}
            onFinancialChange={setFin}
            existingGoals={goals}
            onSave={handleSaveSettings}
            error={settingsError}
          />
        )}
      </main>
    </div>
  );
}

// ── Root ────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(false);
  const [profileExists, setProfileExists] = useState(false);

  useEffect(() => {
    setProfileExists(hasProfile());
    setReady(true);
  }, []);

  if (!ready) return null; // avoid flash

  return profileExists ? <MainApp /> : <SetupFlow />;
}