// Durable chat choice cards (EnvoyCoder ApprovalChoices peer — Design §3 / V-UX-14 / §9.5g.3 / §9.5i).
// Fail-closed TTL: expiry clears without selecting.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { assertHandoffOpenUrl } from "./outbound-url.js";

export type ChoiceSelection = "one" | "many" | "text" | "form";

export type ChoiceOption = {
  id: string;
  label: string;
  destructive?: boolean;
};

export type ChoiceFormFieldKind =
  | "text"
  | "password"
  | "otp"
  | "textarea"
  | "select"
  | "checkbox"
  | "file";

export type ChoiceFormField = {
  id: string;
  label: string;
  ref: string;
  kind: ChoiceFormFieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** §9.5g.3 — HTML accept hint for file fields. */
  accept?: string;
  /** §9.5g.3 — HTML multiple (newline-separated paths in fieldValues). */
  multiple?: boolean;
  sensitive: boolean;
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
  purpose:
    | "ask_user"
    | "schedule_candidates"
    | "home_disambiguation"
    | "general"
    | "session_plan"
    | "browser_form"
    | "outbound_handoff";
  /** §9.5g.3 — form card schema (no secret values). */
  fields?: ChoiceFormField[];
  snapshotId?: string;
  targetId?: string;
  profile?: "managed" | "personal" | "remote";
  submitRef?: string;
  url?: string;
  title?: string;
  /** §9.5i — https destination for Open (Universal Links / App Links). */
  openUrl?: string;
  /** §9.5i — short checklist shown on the handoff card. */
  steps?: string[];
  /**
   * Origin of the proposing turn — apply must use the same gates
   * (unattended refuses sensitive; managed-only unattended).
   */
  formOrigin?: "attended" | "unattended";
  createdAt: string;
  expiresAt: string;
};

export type ChoiceAnswer = {
  optionId?: string;
  optionIds?: string[];
  text?: string;
  /** §9.5g.3 — field id → string | boolean. */
  fieldValues?: Record<string, string | boolean>;
  /**
   * When answerChoice applies the form before waking the parked tool,
   * the apply outcome is attached so propose_form does not re-fill.
   */
  formApplyResult?: {
    ok: boolean;
    error?: string;
    result?: Record<string, unknown>;
  };
};

const DEFAULT_TTL_SEC = 600;
const FORM_FIELD_CAP = 24;

function normalizeFormFields(raw: ChoiceFormField[] | undefined): ChoiceFormField[] {
  if (!Array.isArray(raw)) return [];
  const out: ChoiceFormField[] = [];
  for (const f of raw.slice(0, FORM_FIELD_CAP)) {
    const id = String(f.id || "").trim().slice(0, 64);
    const label = String(f.label || "").trim().slice(0, 200);
    const ref = String(f.ref || "").trim().slice(0, 64);
    const kind = f.kind;
    if (!id || !label || !ref) continue;
    if (
      kind !== "text" &&
      kind !== "password" &&
      kind !== "otp" &&
      kind !== "textarea" &&
      kind !== "select" &&
      kind !== "checkbox" &&
      kind !== "file"
    ) {
      continue;
    }
    const sensitive =
      f.sensitive === true || kind === "password" || kind === "otp";
    const accept =
      kind === "file" && typeof f.accept === "string" && f.accept.trim()
        ? f.accept.trim().slice(0, 200)
        : undefined;
    out.push({
      id,
      label,
      ref,
      kind,
      sensitive,
      ...(f.required === true ? { required: true } : {}),
      ...(accept ? { accept } : {}),
      ...(kind === "file" && f.multiple === true ? { multiple: true } : {}),
      ...(kind === "select" && Array.isArray(f.options) && f.options.length
        ? {
            options: f.options.slice(0, 48).map((o) => ({
              value: String(o.value ?? "").trim().slice(0, 200),
              label: String(o.label ?? o.value ?? "").trim().slice(0, 200),
            })),
          }
        : {}),
    });
  }
  return out;
}

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
    if (
      selection !== "text" &&
      selection !== "form" &&
      (!input.options || input.options.length === 0)
    ) {
      throw Object.assign(new Error("envoyhome.bad_params: choice needs options"), {
        code: "bad_params",
      });
    }
    const fields =
      selection === "form" ? normalizeFormFields(input.fields) : undefined;
    if (selection === "form" && (!fields || fields.length === 0)) {
      throw Object.assign(new Error("envoyhome.bad_params: form choice needs fields"), {
        code: "bad_params",
      });
    }
    if (selection === "form" && input.purpose !== "browser_form") {
      throw Object.assign(
        new Error("envoyhome.bad_params: form selection requires purpose browser_form"),
        { code: "bad_params" },
      );
    }
    let handoffOpenUrl: string | undefined;
    if (input.purpose === "outbound_handoff") {
      if (selection !== "one") {
        throw Object.assign(
          new Error("envoyhome.bad_params: outbound_handoff requires selection one"),
          { code: "bad_params" },
        );
      }
      try {
        // V-OUT-23 — same SSRF family as browser navigate (https-only + host refuse).
        handoffOpenUrl = assertHandoffOpenUrl(String(input.openUrl ?? "")).href;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw Object.assign(
          new Error(
            msg.includes("openUrl") || msg.includes("https") || msg.includes("refused")
              ? msg
              : "envoyhome.bad_params: outbound_handoff requires https openUrl",
          ),
          { code: (e as { code?: string }).code ?? "bad_params" },
        );
      }
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
      ...(fields ? { fields } : {}),
      ...(selection === "form" && input.snapshotId?.trim()
        ? { snapshotId: input.snapshotId.trim().slice(0, 64) }
        : {}),
      ...(selection === "form" && input.targetId?.trim()
        ? { targetId: input.targetId.trim().slice(0, 64) }
        : {}),
      ...(selection === "form" &&
      (input.profile === "managed" ||
        input.profile === "personal" ||
        input.profile === "remote")
        ? { profile: input.profile }
        : {}),
      ...(selection === "form" && input.submitRef?.trim()
        ? { submitRef: input.submitRef.trim().slice(0, 64) }
        : {}),
      ...(selection === "form" && input.url?.trim()
        ? { url: input.url.trim().slice(0, 2000) }
        : {}),
      ...(selection === "form" && input.title?.trim()
        ? { title: input.title.trim().slice(0, 200) }
        : {}),
      ...(selection === "form" &&
      (input.formOrigin === "attended" || input.formOrigin === "unattended")
        ? { formOrigin: input.formOrigin }
        : {}),
      ...(input.purpose === "outbound_handoff" && handoffOpenUrl
        ? { openUrl: handoffOpenUrl.slice(0, 2000) }
        : {}),
      ...(input.purpose === "outbound_handoff" &&
      Array.isArray(input.steps) &&
      input.steps.length
        ? {
            steps: input.steps
              .map((s) => String(s ?? "").trim().slice(0, 200))
              .filter(Boolean)
              .slice(0, 8),
          }
        : {}),
      ...(input.purpose === "outbound_handoff" && input.title?.trim()
        ? { title: input.title.trim().slice(0, 200) }
        : {}),
    };
    if (!row.question) {
      throw Object.assign(new Error("envoyhome.bad_params: choice needs question"), {
        code: "bad_params",
      });
    }
    if (selection === "form" && (!row.snapshotId || !row.targetId || !row.profile)) {
      throw Object.assign(
        new Error("envoyhome.bad_params: form choice needs snapshotId, targetId, profile"),
        { code: "bad_params" },
      );
    }
    if (input.purpose === "outbound_handoff" && !row.openUrl) {
      throw Object.assign(
        new Error("envoyhome.bad_params: outbound_handoff needs openUrl"),
        { code: "bad_params" },
      );
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
  ):
    | {
        ok: true;
        labels: string[];
        optionIds: string[];
        text?: string;
        fieldValues?: Record<string, string | boolean>;
      }
    | { ok: false; reason: string } {
    if (row.selection === "text") {
      const text = typeof answer.text === "string" ? answer.text.trim() : "";
      if (!text) return { ok: false, reason: "text required" };
      return { ok: true, labels: [text], optionIds: [], text };
    }
    if (row.selection === "form") {
      const fields = row.fields ?? [];
      const raw = answer.fieldValues;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, reason: "fieldValues required" };
      }
      const fieldValues: Record<string, string | boolean> = {};
      const labels: string[] = [];
      for (const f of fields) {
        const v = raw[f.id];
        if (v === undefined || v === null) {
          if (f.required) return { ok: false, reason: `field required: ${f.id}` };
          continue;
        }
        if (f.kind === "checkbox") {
          const b = v === true || v === "true" || v === "1";
          fieldValues[f.id] = Boolean(b);
          labels.push(f.sensitive ? `${f.label}=••••` : `${f.label}=${fieldValues[f.id] ? "on" : "off"}`);
          continue;
        }
        const s = typeof v === "boolean" ? (v ? "true" : "false") : String(v).trim();
        if (!s && f.required) return { ok: false, reason: `field required: ${f.id}` };
        if (!s) continue;
        fieldValues[f.id] = s;
        if (f.sensitive) {
          labels.push(`${f.label}=••••`);
        } else if (f.kind === "file") {
          // V-OUT-26 — basename only (multi = newline-separated paths).
          const names = s
            .split(/\r?\n+/)
            .map((p) => basename(p.trim()))
            .filter(Boolean)
            .slice(0, 8);
          labels.push(`${f.label}=${names.join(", ").slice(0, 120)}`);
        } else {
          labels.push(`${f.label}=${s.slice(0, 40)}`);
        }
      }
      if (Object.keys(fieldValues).length === 0) {
        return { ok: false, reason: "fieldValues required" };
      }
      return { ok: true, labels, optionIds: [], fieldValues };
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
