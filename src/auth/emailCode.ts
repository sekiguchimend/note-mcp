import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { sleep } from "../browser/humanize.js";

// Pull a numeric verification code out of a message body/subject.
function extractCode(text: string): string | null {
  // note's codes are typically 4-8 digits. Prefer a standalone run of digits.
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

// Poll the Gmail inbox over IMAP for a fresh note verification code.
// `since` bounds the search to mail that arrived during this login attempt,
// so we never replay an old code.
export async function fetchNoteVerificationCode(since: Date): Promise<string | null> {
  if (!config.gmail.enabled) {
    logger.warn("Gmail IMAP disabled - cannot auto-read verification code");
    return null;
  }
  if (!config.gmail.user || !config.gmail.password) {
    logger.error("GMAIL_IMAP_USER / GMAIL_IMAP_PASSWORD not set");
    return null;
  }

  const timeoutMs = config.gmail.codeTimeoutSec * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const code = await scanOnce(since);
    if (code) return code;
    await sleep(5000);
  }
  logger.error("verification code not found within timeout");
  return null;
}

async function scanOnce(since: Date): Promise<string | null> {
  const client = new ImapFlow({
    host: config.gmail.host,
    port: config.gmail.port,
    secure: true,
    auth: { user: config.gmail.user, pass: config.gmail.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search recent mail; filter to note senders and pick the newest.
      const uids = await client.search({ since });
      if (!uids || uids.length === 0) return null;

      // Walk newest-first.
      const sorted = [...uids].sort((a, b) => b - a);
      for (const uid of sorted) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        const isNote = fromAddr.includes("note.com") || fromAddr.includes("note.jp");
        if (!isNote) continue;

        const parsed = await simpleParser(msg.source);
        const haystack = `${parsed.subject ?? ""}\n${parsed.text ?? ""}`;
        const code = extractCode(haystack);
        if (code) {
          logger.info({ from: fromAddr }, "verification code extracted from email");
          return code;
        }
      }
      return null;
    } finally {
      lock.release();
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "IMAP scan failed (will retry)");
    return null;
  } finally {
    await client.logout().catch(() => undefined);
  }
}
