import type { Locator, Page } from "playwright";
import { config } from "../config.js";

export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Random pause, used liberally between discrete actions.
export function humanPause(min = 350, max = 1400): Promise<void> {
  return sleep(randInt(min, max));
}

// Type into a field one key at a time with randomized per-key delay so the
// input rhythm looks human instead of an instantaneous value paste.
export async function humanType(target: Locator, text: string): Promise<void> {
  await target.click();
  await humanPause(150, 500);
  for (const ch of text) {
    await target.press(keyFor(ch), { delay: randInt(config.typing.minDelayMs, config.typing.maxDelayMs) }).catch(async () => {
      // Fallback for characters press() can't express directly.
      await target.type(ch, { delay: randInt(config.typing.minDelayMs, config.typing.maxDelayMs) });
    });
  }
}

// Type free text directly at the current keyboard focus (used by the editor).
export async function humanKeyboardType(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text, {
    delay: randInt(config.typing.minDelayMs, config.typing.maxDelayMs),
  });
}

// press() wants key names; most printable chars map to themselves, but a
// handful (space, newline) need explicit names.
function keyFor(ch: string): string {
  if (ch === " ") return "Space";
  if (ch === "\n") return "Enter";
  if (ch === "\t") return "Tab";
  return ch;
}
