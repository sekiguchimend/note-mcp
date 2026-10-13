import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Persistent per-day like counter so the daily limit survives process
// restarts (a remote server may run many short-lived jobs per day).
const __dirname = dirname(fileURLToPath(import.meta.url));
const stateDir = resolve(__dirname, "..", "..", "state");
const statePath = resolve(stateDir, "like-budget.json");

interface BudgetState {
  day: string; // YYYY-MM-DD in JST
  used: number;
}

function today(): string {
  // Date in the configured timezone (JST by default).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.browser.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function read(): BudgetState {
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as BudgetState;
    if (raw.day === today()) return raw;
  } catch {
    // no file yet / new day
  }
  return { day: today(), used: 0 };
}

function write(state: BudgetState): void {
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify(state), "utf8");
  } catch (e) {
    logger.warn({ err: String(e) }, "could not persist like budget");
  }
}

// Atomically reserve `n` likes against today's budget.
// Returns how many were actually granted and how many remain afterwards.
export function consumeLikeBudget(n: number): { granted: number; remaining: number } {
  const state = read();
  const limit = config.like.dailyLimit;
  const available = Math.max(0, limit - state.used);
  const granted = Math.min(n, available);
  if (granted > 0) {
    state.used += granted;
    write(state);
  }
  return { granted, remaining: limit - state.used };
}
