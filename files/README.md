# 💸 Money Manager

A simple, personal-use GenAI financial planning tool built with **React + TypeScript + Node.js + Express + Google Gemini**.

It helps you understand whether your financial goals are realistic based on your income, expenses, savings, and timeline. Honest math first, AI explanation second.

---

## ✨ What It Does

1. You enter your monthly income, current savings, and essential expenses
2. You add one or more financial goals (trip, gadget, savings, etc.) with a timeline
3. The app calculates exactly how much you can save each month (after expenses + emergency buffer)
4. It tells you whether each goal is achievable in your timeline — and if not, when it realistically would be
5. Google Gemini AI explains the results in plain, friendly language and gives practical saving tips

---

## 🤖 Why Google Gemini?

| Feature | Details |
|---|---|
| **Free tier** | 1,500 requests/day, 15 req/min — no credit card needed |
| **Setup time** | ~60 seconds — just a Google account |
| **Package** | `@google/generative-ai` — 3 lines to initialize |
| **Fallback** | App works without a key (uses rule-based explanation) |

**Get your free API key:** https://aistudio.google.com/app/apikey

---

## 🏗️ Architecture

```
User fills form
     ↓
React (client) → POST /api/analyze → Express (server)
                                          ↓
                                  1. calculateFinancials()
                                     (pure rule-based math)
                                          ↓
                                  2. getAIExplanation()
                                     (Gemini explains results)
                                          ↓
                                  JSON response → UI displays results
```

**Key principle:** AI is never used for math. All calculations happen in `calculator.ts`. Gemini only converts numbers into plain English.

---

## 📁 Folder Structure

```
money-manager/
├── client/                        # React frontend (Vite)
│   ├── index.html
│   ├── vite.config.ts             # Proxy /api → localhost:3001
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.tsx               # App entry point
│       ├── App.tsx                # 3-step flow controller
│       ├── App.css                # All styles (plain CSS)
│       ├── types/index.ts         # Shared TypeScript types
│       └── components/
│           ├── FinancialForm.tsx  # Step 1: income, savings, expenses
│           ├── GoalForm.tsx       # Step 2: add goals
│           └── ResultDisplay.tsx # Step 3: results + AI advice
│
├── server/                        # Express backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── calculator.test.ts         # Manual unit tests
│   └── src/
│       ├── index.ts               # Server entry point
│       ├── types/index.ts         # TypeScript interfaces
│       ├── utils/
│       │   ├── calculator.ts      # ← All financial math lives here
│       │   └── aiPrompt.ts        # ← Gemini integration + fallback
│       └── routes/
│           └── analyze.ts         # POST /api/analyze
│
├── sample-inputs.ts               # 4 test scenarios with comments
├── .env.example                   # Copy this to server/.env
└── README.md
```

---

## 🚀 Quick Start (< 5 minutes)

### Prerequisites

- [Node.js 18+](https://nodejs.org/) installed
- A terminal / command prompt

### Step 1 — Clone / download the project

```bash
# If you have git:
git clone <your-repo-url>
cd money-manager

# Or just unzip the downloaded folder and cd into it
```

### Step 2 — Set up the backend

```bash
cd server
npm install
cp ../.env.example .env
```

Now open `server/.env` and add your Gemini API key:

```
GEMINI_API_KEY=your_actual_key_here
```

> **Don't have a key yet?** That's fine! The app still works without it.  
> The AI section will show a rule-based explanation instead of Gemini's response.  
> Get a free key at: https://aistudio.google.com/app/apikey (takes 60 seconds)

### Step 3 — Set up the frontend

```bash
# Open a new terminal tab/window
cd client
npm install
```

### Step 4 — Run both servers

**Terminal 1 (backend):**
```bash
cd server
npm run dev
```
You should see:
```
🚀 Money Manager API running at http://localhost:3001
```

**Terminal 2 (frontend):**
```bash
cd client
npm run dev
```
You should see:
```
  VITE ready in 300ms
  ➜  Local:   http://localhost:5173/
```

### Step 5 — Open the app

Visit **http://localhost:5173** in your browser. That's it!

---

## 🧪 Running Tests

The test file verifies the core calculation logic — no test runner needed.

```bash
cd server
npx ts-node calculator.test.ts
```

Expected output:
```
📋 Disposable Income Calculation
  ✅ PASS: Total expenses = sum of all expense fields
  ✅ PASS: Disposable income = income - expenses
  ...

────────────────────────────────────────
Results: 14 passed, 0 failed
🎉 All tests passed!
```

---

## 🔌 API Reference

### `POST /api/analyze`

**Request body:**
```json
{
  "financialData": {
    "monthlyIncome": 60000,
    "currentSavings": 30000,
    "useSavingsForGoal": true,
    "expenses": {
      "rent": 12000,
      "groceries": 5000,
      "travel": 2000,
      "bills": 3000,
      "dailyNeeds": 2000,
      "others": 1000
    },
    "goals": [
      {
        "id": "g1",
        "title": "Goa Trip",
        "type": "domestic_trip",
        "targetAmount": 25000,
        "timelineMonths": 3
      }
    ]
  }
}
```

**Response:**
```json
{
  "calculation": {
    "monthlyIncome": 60000,
    "totalEssentialExpenses": 25000,
    "disposableIncome": 35000,
    "emergencyBufferMonthly": 7000,
    "safeMonthlysSavings": 28000,
    "currentSavings": 30000,
    "useSavingsForGoal": true,
    "hasNegativeDisposable": false,
    "goalResults": [...]
  },
  "aiExplanation": "...",
  "disclaimer": "..."
}
```

### `GET /health`

Returns server status and whether Gemini is configured.

---

## 🧮 Calculation Logic

```
totalEssentialExpenses = rent + groceries + travel + bills + dailyNeeds + others

disposableIncome = monthlyIncome - totalEssentialExpenses

emergencyBuffer = max(₹3,000, disposableIncome × 20%)
                  capped at disposableIncome

safeMonthlysSavings = max(0, disposableIncome - emergencyBuffer)

── Per Goal ──

if useSavingsForGoal:
  amountCoveredBySavings = min(currentSavings, targetAmount)
else:
  amountCoveredBySavings = 0

amountNeededFromMonthlySavings = targetAmount - amountCoveredBySavings

monthsNeeded = ceil(amountNeededFromMonthlySavings / safeMonthlysSavings)

isAchievable = (monthsNeeded ≤ timelineMonths)
```

---

## 💡 Sample Test Scenarios

See `sample-inputs.ts` for 4 pre-built scenarios:

| Scenario | Income | Situation |
|---|---|---|
| 1. Comfortable | ₹75,000 | Multiple goals — some achievable, some not |
| 2. Tight Budget | ₹25,000 | Expenses > income — tests warning path |
| 3. Savings Excluded | ₹55,000 | Planning without touching existing savings |
| 4. Low Disposable | ₹35,000 | Very little left after expenses |

---

## 🛠️ Customization Ideas

| What | Where |
|---|---|
| Change emergency buffer % | `server/src/utils/calculator.ts` → `EMERGENCY_BUFFER_PERCENT` |
| Change minimum buffer | `server/src/utils/calculator.ts` → `MIN_EMERGENCY_BUFFER` |
| Change AI prompt/tone | `server/src/utils/aiPrompt.ts` → `buildPrompt()` |
| Change AI model | `server/src/utils/aiPrompt.ts` → `"gemini-1.5-flash"` |
| Add more goal types | `server/src/types/index.ts` + `client/src/types/index.ts` + `GoalForm.tsx` |
| Change app colors | `client/src/App.css` → `:root { --color-primary: ... }` |
| Support USD / other currency | Replace `₹` with your currency symbol in `aiPrompt.ts` and `ResultDisplay.tsx` |

---

## ⚠️ Important Notes

- This is a **personal planning tool only** — not financial advice
- Always keep an emergency fund before chasing goals
- The AI explanation is for guidance — real financial decisions should involve a certified advisor
- Your data is not stored anywhere — it only lives in the browser during your session

---

## 🐛 Troubleshooting

**"Something went wrong. Please make sure the backend server is running."**
→ Make sure `npm run dev` is running in the `server/` directory and accessible at `http://localhost:3001`

**"Cannot find module '@google/generative-ai'"**
→ Run `npm install` inside the `server/` directory

**Gemini API error in server logs**
→ Check that your `GEMINI_API_KEY` in `server/.env` is correct and not expired
→ The app falls back to rule-based explanations automatically

**Port already in use**
→ Change `PORT=3001` in `server/.env`, and update `vite.config.ts` proxy target accordingly

---

## 📚 Learning Notes

This project is intentionally simple so it's easy to read and learn from:

- **No ORM, no database** — data lives only in request/response cycles
- **No state management library** — React's built-in `useState` is enough
- **No CSS framework** — plain CSS variables keep styling readable
- **No test framework** — raw `ts-node` runs the test file directly
- **One API endpoint** — keeps the backend easy to reason about
- **Comments throughout** — every non-obvious decision is explained inline
