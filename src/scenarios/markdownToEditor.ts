import type { Page } from "playwright";
import { marked, type Token, type Tokens } from "marked";
import { humanKeyboardType, humanPause } from "../browser/humanize.js";
import { logger } from "../logger.js";

// Translate Markdown into note's ProseMirror editor using note's REAL behavior
// (verified against the live editor 2026-10-13):
//
//   - note does NOT auto-convert markdown syntax. Type plain text, then format.
//   - SINGLE Enter = soft line break (<br>) within the same block.
//   - DOUBLE Enter = new paragraph block.   <-- block separator
//   - Inside a list, single Enter = new item; DOUBLE Enter exits the list.
//   - 大見出し Ctrl+Alt+2 / 小見出し Ctrl+Alt+3 (no H1; title is separate).
//   - 箇条書き Ctrl+Shift+8 / 番号付き Ctrl+Shift+7 / 引用 Ctrl+Shift+.
//   - 太字 Ctrl+B / 斜体 Ctrl+I.
//
// Contract: every block handler leaves the caret in a FRESH EMPTY PARAGRAPH,
// ready for the next block. So the main loop adds no separators of its own.
const SC = {
  h2: "Control+Alt+Digit2",
  h3: "Control+Alt+Digit3",
  bullet: "Control+Shift+Digit8",
  ordered: "Control+Shift+Digit7",
  quote: "Control+Shift+Period",
  bold: "Control+b",
  italic: "Control+i",
};

export async function typeMarkdown(page: Page, markdown: string): Promise<void> {
  const tokens = marked.lexer(markdown).filter((t) => t.type !== "space");
  for (const token of tokens) {
    await renderBlock(page, token);
    await humanPause(120, 300);
  }
}

async function newBlock(page: Page): Promise<void> {
  // Double Enter = a real new paragraph block.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

async function renderBlock(page: Page, token: Token): Promise<void> {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      await renderInline(page, t.tokens);
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press(t.depth <= 2 ? SC.h2 : SC.h3);
      await page.keyboard.press("End");
      // A single Enter exits a heading straight into a new empty paragraph.
      await page.keyboard.press("Enter");
      return;
    }
    case "paragraph": {
      await renderInline(page, (token as Tokens.Paragraph).tokens);
      await newBlock(page);
      return;
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      await page.keyboard.press(SC.quote);
      await humanKeyboardType(page, (t.text ?? "").replace(/\n+/g, " "));
      await newBlock(page); // double Enter exits the quote
      return;
    }
    case "list": {
      const t = token as Tokens.List;
      await page.keyboard.press(t.ordered ? SC.ordered : SC.bullet);
      for (let i = 0; i < t.items.length; i++) {
        await renderInline(page, t.items[i].tokens ?? []);
        if (i < t.items.length - 1) await page.keyboard.press("Enter"); // next item
      }
      await newBlock(page); // double Enter exits the list to a paragraph
      return;
    }
    case "code": {
      const t = token as Tokens.Code;
      logger.info("code block -> plain text (note has no code-block shortcut)");
      const lines = (t.text ?? "").split("\n");
      for (let i = 0; i < lines.length; i++) {
        await humanKeyboardType(page, lines[i]);
        if (i < lines.length - 1) await page.keyboard.press("Enter"); // soft break
      }
      await newBlock(page);
      return;
    }
    case "hr": {
      await newBlock(page);
      return;
    }
    default: {
      const raw = (token as { raw?: string; text?: string }).raw ?? (token as { text?: string }).text ?? "";
      if (raw.trim()) {
        logger.warn({ type: token.type }, "unhandled markdown block - inserting raw text");
        await humanKeyboardType(page, raw.trim());
        await newBlock(page);
      }
    }
  }
}

// Render inline tokens, applying bold/italic via toggles so styled runs become
// real editor marks rather than literal asterisks.
async function renderInline(page: Page, tokens: Token[] | undefined): Promise<void> {
  if (!tokens) return;
  for (const tk of tokens) {
    switch (tk.type) {
      case "text": {
        const t = tk as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) await renderInline(page, t.tokens);
        else await humanKeyboardType(page, t.text);
        break;
      }
      case "strong": {
        await page.keyboard.press(SC.bold);
        await renderInline(page, (tk as Tokens.Strong).tokens);
        await page.keyboard.press(SC.bold);
        break;
      }
      case "em": {
        // note's editor has NO italic (toolbar offers only 太字/取り消し線).
        // Render emphasis as plain text so nothing is lost or mis-toggled.
        await renderInline(page, (tk as Tokens.Em).tokens);
        break;
      }
      case "codespan": {
        await humanKeyboardType(page, (tk as Tokens.Codespan).text);
        break;
      }
      case "link": {
        const l = tk as Tokens.Link;
        await renderInline(page, l.tokens);
        await humanKeyboardType(page, ` (${l.href})`);
        break;
      }
      case "br": {
        await page.keyboard.press("Enter"); // soft line break
        break;
      }
      default: {
        const text = (tk as { text?: string }).text;
        if (text) await humanKeyboardType(page, text);
      }
    }
  }
}
