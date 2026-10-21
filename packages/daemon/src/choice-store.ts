// Durable chat choice cards (EnvoyCoder ApprovalChoices peer — Design §3 / V-UX-14).
// Fail-closed TTL: expiry clears without selecting.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ChoiceSelection = "one" | "many" | "text";

export type ChoiceOption = {
  id: string;
  label: string;
  destructive?: boolean;
};

export type PendingChoice = {
  id: string;
  accountId: string;
  sessionId: string;
  turnId?: string;
  question: string;
  detail?: string;
  options: ChoiceOption[];
  selection: ChoiceSelection;
  multiline?: boolean;
  /** Who created it — resume tool vs follow-up user message. */
  purpose: "ask_user" | "schedule_candidates" | "home_disambiguation" | "general";
  createdAt: string;
  expiresAt: string;
};

export type ChoiceAnswer = {
  optionId?: string;
  optionIds?: string[];
  text?: string;
};

const DEFAULT_TTL_SEC = 600;

export class ChoiceStore {
  constructor(
    private readonly accountDir: (accountId: string) => string,
    /** Fired after an expired row is pruned (get/list). */
    private readonly onExpired?: (row: PendingChoice) => void,
  ) {}

  private dir(accountId: string): string {
    return join(this.accountDir(accountId), "choices");
  }

  async create(
    input: Omit<PendingChoice, "id" | "createdAt" | "expiresAt"> & { ttlSec?: number },
  ): Promise<PendingChoice> {
    const now = new Date();
    const ttl = input.ttlSec ?? DEFAULT_TTL_SEC;
    const selection = input.selection;
    if (selection !== "text" && (!input.options || input.options.length === 0)) {
      throw Object.assign(new Error("envoyhome.bad_params: choice needs options"), {
        code: "bad_params",
      });
    }
    const row: PendingChoice = {
      id: randomUUID(),
      accountId: input.accountId,
      sessionId: input.sessionId,
      question: input.question.trim().slice(0, 500),
      options: (input.options ?? []).slice(0, 24).map((o, i) => ({
        id: String(o.id || i).slice(0, 64),
        label: String(o.label || "").trim().slice(0, 200),
        ...(o.destructive === true ? { destructive: true } : {}),
      })),
      selection,
      purpose: input.purpose,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.detail?.trim() ? { detail: input.detail.trim().slice(0, 2000) } : {}),
      ...(input.multiline === true ? { multiline: true } : {}),
    };
    if (!row.question) {
      throw Object.assign(new Error("envoyhome.bad_params: choice needs question"), {
        code: "bad_params",
      });
    }
    const dir = this.dir(row.accountId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${row.id}.json`);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(row, null, 2), "utf8");
    await rename(tmp, path);
    return row;
  }

  async get(accountId: string, id: string): Promise<PendingChoice | undefined> {
    try {
      const raw = JSON.parse(await readFile(join(this.dir(accountId), `${id}.json`), "utf8")) as PendingChoice;
      if (raw.accountId !== accountId) return undefined;
      if (new Date(raw.expiresAt).getTime() < Date.now()) {
        await this.remove(accountId, id);
        this.onExpired?.(raw);
        return undefined;
      }
      return raw;
    } catch {
      return undefined;
    }
  }

  async list(accountId: string, sessionId?: string): Promise<PendingChoice[]> {
    let names: string[];
    try {
      names = await readdir(this.dir(accountId));
    } catch {
      return [];
    }
    const out: PendingChoice[] = [];
    const now = Date.now();
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(join(this.dir(accountId), name), "utf8"),
        ) as PendingChoice;
        if (raw.accountId !== accountId) continue;
        if (new Date(raw.expiresAt).getTime() < now) {
          await this.remove(accountId, raw.id);
          this.onExpired?.(raw);
          continue;
        }
        if (sessionId && raw.sessionId !== sessionId) continue;
        out.push(raw);
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async remove(accountId: string, id: string): Promise<void> {
    try {
      await unlink(join(this.dir(accountId), `${id}.json`));
    } catch {
      /* ignore */
    }
  }

  /** Validate and normalize an answer against a pending row. */
  resolveAnswer(
    row: PendingChoice,
    answer: ChoiceAnswer,
  ): { ok: true; labels: string[]; optionIds: string[]; text?: string } | { ok: false; reason: string } {
    if (row.selection === "text") {
      const text = typeof answer.text === "string" ? answer.text.trim() : "";
      if (!text) return { ok: false, reason: "text required" };
      return { ok: true, labels: [text], optionIds: [], text };
    }
    const ids =
      Array.isArray(answer.optionIds) && answer.optionIds.length > 0
        ? answer.optionIds.map(String)
        : typeof answer.optionId === "string" && answer.optionId.trim()
          ? [answer.optionId.trim()]
          : [];
    if (ids.length === 0) return { ok: false, reason: "option required" };
    if (row.selection === "one" && ids.length !== 1) {
      return { ok: false, reason: "exactly one option" };
    }
    const allowed = new Set(row.options.map((o) => o.id));
    for (const id of ids) {
      if (!allowed.has(id)) return { ok: false, reason: "unknown option" };
    }
    const labels = ids.map((id) => row.options.find((o) => o.id === id)?.label ?? id);
    return { ok: true, labels, optionIds: ids };
  }
}
