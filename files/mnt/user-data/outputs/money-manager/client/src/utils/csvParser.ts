// ─────────────────────────────────────────────
//  utils/csvParser.ts
//  Client-side CSV parser for Indian bank statements.
//
//  Handles: HDFC, SBI, ICICI, Axis, Kotak, and generic formats.
//  Returns normalised RawTransaction[] for display + server submission.
// ─────────────────────────────────────────────

import { RawTransaction, CSVParseResult } from "../types";

// ── Known bank header patterns ─────────────────
// Each entry maps a bank name to patterns we look for in its headers.
const BANK_SIGNATURES: { bank: string; headers: string[] }[] = [
  { bank: "HDFC",   headers: ["narration", "withdrawal amt", "deposit amt"] },
  { bank: "SBI",    headers: ["txn date", "description", "debit", "credit"] },
  { bank: "ICICI",  headers: ["transaction date", "amount (inr)", "type"] },
  { bank: "Axis",   headers: ["tran date", "particulars", "dr", "cr"] },
  { bank: "Kotak",  headers: ["transaction date", "dr amount", "cr amount"] },
  { bank: "IndusInd", headers: ["value date", "debit amount", "credit amount"] },
];

// ── Row parser ─────────────────────────────────
// Splits a CSV row respecting quoted fields.
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Amount cleaner ──────────────────────────────
// Strips commas, spaces, ₹ signs, and converts to number
function parseAmount(raw: string): number {
  if (!raw || raw.trim() === "" || raw.trim() === "-") return 0;
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/[()]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

// ── Date normaliser ─────────────────────────────
// Tries to produce a readable date string from various formats
function normaliseDate(raw: string): string {
  if (!raw || raw.trim() === "") return "Unknown";
  const s = raw.trim();

  // Try common formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, MM/DD/YYYY
  const formats: RegExp[] = [
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/,    // DD/MM/YYYY or DD-MM-YYYY
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/,     // DD/MM/YY
    /^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/,     // YYYY-MM-DD
    /^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/,     // DD MMM YYYY
  ];

  const monthNames: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${d.padStart(2,"0")}/${m.padStart(2,"0")}/${year}`;
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d}/${m}/${y}`;
  }

  // DD MMM YYYY (e.g. "01 Jul 2025")
  const dmy2 = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (dmy2) {
    const [, d, mon, y] = dmy2;
    const m = monthNames[mon.toLowerCase()] || "01";
    return `${d.padStart(2,"0")}/${m}/${y}`;
  }

  return s; // return raw if nothing matched
}

// ── Column index finder ─────────────────────────
// Given headers, returns indices for key columns.
interface ColumnMap {
  date: number;
  description: number;
  debit: number;
  credit: number;
  amount: number;       // single amount column (when debit/credit not separate)
  type: number;         // Dr/Cr column (ICICI style)
}

function findColumns(headers: string[]): ColumnMap {
  const h = headers.map((s) => s.toLowerCase().trim());

  const find = (...patterns: string[]): number => {
    for (const p of patterns) {
      const idx = h.findIndex((col) => col.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    date:        find("txn date", "tran date", "transaction date", "date", "value dt", "value date"),
    description: find("narration", "particulars", "description", "details", "remarks"),
    debit:       find("withdrawal amt", "debit amt", "dr amount", "debit amount", "withdrawal", "debit", " dr"),
    credit:      find("deposit amt", "credit amt", "cr amount", "credit amount", "deposit", "credit", " cr"),
    amount:      find("amount (inr)", "amount(inr)", "transaction amount", "amount"),
    type:        find("type", "dr/cr", "transaction type"),
  };
}

// ── Detect bank ─────────────────────────────────
function detectBank(headerLine: string): string {
  const lower = headerLine.toLowerCase();
  for (const { bank, headers } of BANK_SIGNATURES) {
    const matches = headers.filter((h) => lower.includes(h)).length;
    if (matches >= 2) return bank;
  }
  return "Unknown";
}

// ── Skip rows ───────────────────────────────────
// Returns true if a row looks like a header, summary, or empty row
function shouldSkipRow(cells: string[], colMap: ColumnMap): boolean {
  if (cells.every((c) => c === "")) return true;
  if (cells.length < 2) return true;

  // If the "date" cell contains text (not a date), skip
  const dateCell = cells[colMap.date] ?? "";
  if (dateCell.toLowerCase().includes("date") ||
      dateCell.toLowerCase().includes("opening") ||
      dateCell.toLowerCase().includes("closing") ||
      dateCell.toLowerCase().includes("balance")) return true;

  // If all amount cells are empty or non-numeric, skip summary rows
  return false;
}

// ── Main export ─────────────────────────────────
export function parseCSV(csvText: string): CSVParseResult {
  const warnings: string[] = [];
  const transactions: RawTransaction[] = [];

  // Normalise line endings
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return {
      transactions: [],
      bankDetected: "Unknown",
      warnings: ["File appears to be empty or has only one row."],
      totalRows: 0,
    };
  }

  // Find the header row — scan first 10 lines
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("date") && (lower.includes("amount") || lower.includes("debit") || lower.includes("dr"))) {
      headerRowIdx = i;
      break;
    }
  }

  const headerLine = lines[headerRowIdx];
  const headers = parseCSVRow(headerLine);
  const bankDetected = detectBank(headerLine);
  const colMap = findColumns(headers);

  if (colMap.date === -1) {
    warnings.push("Could not find a date column. Please check your CSV format.");
  }
  if (colMap.description === -1) {
    warnings.push("Could not find a description/narration column.");
  }
  if (colMap.debit === -1 && colMap.amount === -1) {
    warnings.push("Could not find a debit/amount column.");
  }

  // Parse data rows
  let parsedCount = 0;
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = parseCSVRow(lines[i]);
    if (shouldSkipRow(cells, colMap)) continue;

    const dateRaw    = colMap.date >= 0 ? (cells[colMap.date] ?? "") : "";
    const descRaw    = colMap.description >= 0 ? (cells[colMap.description] ?? "") : `Row ${i}`;
    const debitRaw   = colMap.debit >= 0 ? (cells[colMap.debit] ?? "") : "";
    const creditRaw  = colMap.credit >= 0 ? (cells[colMap.credit] ?? "") : "";
    const amountRaw  = colMap.amount >= 0 ? (cells[colMap.amount] ?? "") : "";
    const typeRaw    = colMap.type >= 0 ? (cells[colMap.type] ?? "").toLowerCase() : "";

    const debitAmt   = parseAmount(debitRaw);
    const creditAmt  = parseAmount(creditRaw);
    const singleAmt  = parseAmount(amountRaw);

    let amount = 0;
    let type: "debit" | "credit" = "debit";

    if (colMap.debit >= 0 && colMap.credit >= 0) {
      // Separate debit/credit columns (HDFC, SBI, Axis style)
      if (debitAmt > 0) { amount = debitAmt; type = "debit"; }
      else if (creditAmt > 0) { amount = creditAmt; type = "credit"; }
      else continue; // skip rows with no amount
    } else if (colMap.amount >= 0) {
      // Single amount column with type indicator (ICICI style)
      amount = singleAmt;
      type = typeRaw.includes("cr") ? "credit" : "debit";
    } else {
      continue;
    }

    if (amount === 0) continue;

    transactions.push({
      date:        normaliseDate(dateRaw),
      description: descRaw.replace(/\s+/g, " ").trim() || "Unknown",
      amount,
      type,
    });
    parsedCount++;
  }

  if (parsedCount === 0) {
    warnings.push("No valid transactions found. Check that your file has date and amount columns.");
  }

  return {
    transactions,
    bankDetected,
    warnings,
    totalRows: parsedCount,
  };
}