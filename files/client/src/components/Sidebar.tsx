import React, { useState } from "react";
import { AppView } from "../types";

interface Props {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onReset: () => void;
}

const NAV_ITEMS: { view: AppView; icon: string; label: string }[] = [
  { view: "dashboard", icon: "⊞",  label: "Dashboard" },
  { view: "goals",     icon: "◎",  label: "Goals"     },
  { view: "audit",     icon: "⟳",  label: "Audit"     },
  { view: "settings",  icon: "◈",  label: "Settings"  },
];

const Sidebar: React.FC<Props> = ({ currentView, onNavigate, onReset }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleNav = (view: AppView) => { onNavigate(view); setMobileOpen(false); };

  return (
    <>
      <div className="mobile-header">
        <span className="sidebar-brand">💸 Paisa Planner</span>
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand-desktop">
            <div className="sidebar-brand-icon">💸</div>
            <div className="sidebar-brand-text">Paisa Planner</div>
          </div>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.view}
                className={`sidebar-nav-item ${currentView === item.view ? "sidebar-nav-item--active" : ""}`}
                onClick={() => handleNav(item.view)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-reset-btn"
            onClick={() => window.confirm("Clear all data and start over? This cannot be undone.") && onReset()}>
            🗑️ Clear All Data
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
    </>
  );
};
export default Sidebar;