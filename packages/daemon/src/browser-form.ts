// Design §9.5g.3 — derive dynamic form fields from a browser snapshot.
// Design §9.5i — skip payment/wallet fields; never open a card for card data.

export const BROWSER_FORM_FIELD_CAP = 24;

/** Labels / autocomplete that indicate payment or wallet fields (V-OUT-21). */
export const PAYMENT_FIELD_RE =
  /\b(card\s*number|credit\s*card|debit\s*card|cvv|cvc|cid|security\s*code|expir(y|ation)|exp\s*date|mm\s*\/\s*yy|billing\s*(zip|postal)|iban|routing\s*number|account\s*number|apple\s*pay|google\s*pay|samsung\s*pay|paypal|wallet|pan\b)\b/i;

export const PAYMENT_AUTOCOMPLETE_RE =
  /^(cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year|cc-name|cc-type)$/i;

/** Page-level payment wall signals (URL/title/body). */
export const PAYMENT_PAGE_RE =
  /\b(payment|checkout|pay\s*now|place\s*order|billing\s*info|card\s*details|apple\s*pay|google\s*pay|3d\s*secure|3ds|complete\s*purchase)\b/i;

export type BrowserFormFieldKind =
  | "text"
  | "password"
  | "otp"
  | "textarea"
  | "select"
  | "checkbox"
  | "file";

export type BrowserFormField = {
  id: string;
  label: string;
  ref: string;
  kind: BrowserFormFieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** HTML accept hint for `kind: file` (thin clients MAY filter). */
  accept?: string;
  /** HTML multiple — Owner MAY supply several jail paths (newline-separated). */
  multiple?: boolean;
  sensitive: boolean;
};

/** Cap paths per file field when `multiple` (align chat attach). */
export const BROWSER_FORM_FILE_MAX_COUNT = 8;

/** §9.5g.3 / P2-J — images + common docs; refuse executables. */
export const BROWSER_FORM_FILE_EXT_ALLOW = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

/** Declared MIME allow-list (clients); path apply also sniffs magic. */
export const BROWSER_FORM_FILE_MIME_ALLOW = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // unknown — still gated by ext + magic
]);

/** Ext → MIME for server apply when the client did not declare a type (jail browse). */
export const BROWSER_FORM_FILE_EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const BROWSER_FORM_FILE_MIME_DENY_RE = [
  /^application\/x-msdownload$/i,
  /^application\/x-msdos-program$/i,
  /^application\/x-executable$/i,
  /^application\/x-dosexec$/i,
  /^application\/vnd\.microsoft\.portable-executable$/i,
  /^application\/x-sh$/i,
  /^application\/x-shellscript$/i,
  /^application\/javascript$/i,
  /^text\/html$/i,
  /^application\/wasm$/i,
];

export function isAllowedBrowserFormFileExt(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return BROWSER_FORM_FILE_EXT_ALLOW.has(lower.slice(dot));
}

/** Infer MIME from an allow-listed extension (jail browse / server apply). */
export function mimeFromBrowserFormFileName(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return undefined;
  return BROWSER_FORM_FILE_EXT_MIME[lower.slice(dot)];
}

/** Client-declared MIME gate (extension still required). */
export function isAllowedBrowserFormFileMime(mimeType: string | undefined): boolean {
  if (!mimeType || !String(mimeType).trim()) return true;
  const m = String(mimeType).toLowerCase().split(";")[0]!.trim();
  if (!m) return true;
  if (BROWSER_FORM_FILE_MIME_DENY_RE.some((re) => re.test(m))) return false;
  if (BROWSER_FORM_FILE_MIME_ALLOW.has(m)) return true;
  if (m.startsWith("image/") && /^(image\/(png|jpeg|gif|webp))$/.test(m)) return true;
  return false;
}

/**
 * Enforce HTML `accept` against basename (+ optional MIME hint).
 * Empty / missing accept → allow (ext + MIME gates still apply).
 */
export function matchesBrowserFormFileAccept(
  fileName: string,
  accept: string | undefined,
  mimeHint?: string,
): boolean {
  const raw = String(accept ?? "").trim();
  if (!raw) return true;
  const lowerName = fileName.toLowerCase();
  const dot = lowerName.lastIndexOf(".");
  const ext = dot >= 0 ? lowerName.slice(dot) : "";
  const mime = String(mimeHint ?? mimeFromBrowserFormFileName(fileName) ?? "")
    .toLowerCase()
    .split(";")[0]!
    .trim();
  const tokens = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  for (const t of tokens) {
    if (t.startsWith(".")) {
      if (ext === t) return true;
      continue;
    }
    if (t.endsWith("/*")) {
      const prefix = t.slice(0, -1); // "image/"
      if (mime.startsWith(prefix)) return true;
      continue;
    }
    if (t.includes("/")) {
      if (mime === t) return true;
      continue;
    }
    // Bare token ("pdf") — treat as extension without the leading dot.
    if (ext === `.${t}`) return true;
  }
  return false;
}

/**
 * Split a file field value into jail-relative paths.
 * Multiple files are newline-separated (wire stays string|boolean).
 * Caller MUST fail closed when `length > BROWSER_FORM_FILE_MAX_COUNT` (`file_too_many`).
 */
export function parseBrowserFormFilePaths(raw: unknown): string[] {
  const s = typeof raw === "boolean" ? "" : String(raw ?? "");
  return s
    .split(/\r?\n+/)
    .map((p) => p.replace(/\\/g, "/").replace(/^\.\/+/, "").trim())
    .filter(Boolean);
}

/** Magic-byte refuse for PE/ELF/Mach-O (ext allow-list is not enough). */
export function isDeniedBrowserFormFileMagic(head: Uint8Array): boolean {
  if (head.length < 2) return false;
  // MZ — PE / DOS
  if (head[0] === 0x4d && head[1] === 0x5a) return true;
  // ELF
  if (
    head.length >= 4 &&
    head[0] === 0x7f &&
    head[1] === 0x45 &&
    head[2] === 0x4c &&
    head[3] === 0x46
  ) {
    return true;
  }
  // Mach-O (32/64, fat)
  if (head.length >= 4) {
    const b0 = head[0]!;
    const b1 = head[1]!;
    const b2 = head[2]!;
    const b3 = head[3]!;
    const be =
      (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    const le = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
    const magics = new Set([
      0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
    ]);
    if (magics.has(be >>> 0) || magics.has(le >>> 0)) return true;
  }
  return false;
}

const SECRET_LABEL_RE =
  /\b(password|passwd|passcode|pin|otp|2fa|mfa|verification\s*code|one[-\s]?time|secret|token)\b/i;

function isNavOnly(el: Record<string, unknown>): boolean {
  const tag = String(el.tag ?? "").toLowerCase();
  const role = String(el.role ?? "").toLowerCase();
  const inputType = String(el.inputType ?? "").toLowerCase();
  if (tag === "a" || role === "link") return true;
  if (tag === "button" || role === "button" || role === "tab" || role === "menuitem") {
    // Submit buttons are not fillable fields.
    return true;
  }
  if (
    inputType === "submit" ||
    inputType === "button" ||
    inputType === "image" ||
    inputType === "reset" ||
    inputType === "hidden"
  ) {
    return true;
  }
  return false;
}

function isFillable(el: Record<string, unknown>): boolean {
  const tag = String(el.tag ?? "").toLowerCase();
  const role = String(el.role ?? "").toLowerCase();
  const inputType = String(el.inputType ?? "").toLowerCase();
  // File before nav check — snapshots may label file inputs with role=button.
  if (tag === "input" && inputType === "file") return true;
  if (isNavOnly(el)) return false;
  if (tag === "textarea" || role === "textbox") return true;
  if (tag === "select" || role === "combobox") return true;
  if (tag === "input") {
    if (
      !inputType ||
      inputType === "text" ||
      inputType === "email" ||
      inputType === "search" ||
      inputType === "tel" ||
      inputType === "url" ||
      inputType === "number" ||
      inputType === "password" ||
      inputType === "checkbox"
    ) {
      return true;
    }
  }
  if (role === "checkbox") return true;
  return false;
}

function inferKind(el: Record<string, unknown>): BrowserFormFieldKind {
  const tag = String(el.tag ?? "").toLowerCase();
  const role = String(el.role ?? "").toLowerCase();
  const inputType = String(el.inputType ?? "").toLowerCase();
  const labelBlob = [
    String(el.name ?? ""),
    String(el.text ?? ""),
    String(el.nameAttr ?? ""),
    String(el.autocomplete ?? ""),
  ].join(" ");

  if (inputType === "file") return "file";
  if (tag === "select" || role === "combobox") return "select";
  if (tag === "textarea") return "textarea";
  if (inputType === "checkbox" || role === "checkbox") return "checkbox";
  if (inputType === "password") return "password";
  if (
    /\botp\b|one[-\s]?time|2fa|mfa|verification\s*code/i.test(labelBlob) ||
    /one-time-code/i.test(String(el.autocomplete ?? ""))
  ) {
    return "otp";
  }
  return "text";
}

function inferLabel(el: Record<string, unknown>, kind: BrowserFormFieldKind, index: number): string {
  const candidates = [
    String(el.name ?? "").trim(),
    String(el.text ?? "").trim(),
    String(el.nameAttr ?? "").trim(),
    String(el.placeholder ?? "").trim(),
  ].filter((s) => s && s !== "(no name)" && s !== "(no text)");
  const raw = (candidates[0] ?? "").slice(0, 80);
  if (raw) return raw;
  if (kind === "password") return `Password ${index + 1}`;
  if (kind === "otp") return `Code ${index + 1}`;
  if (kind === "checkbox") return `Option ${index + 1}`;
  if (kind === "file") return `File ${index + 1}`;
  return `Field ${index + 1}`;
}

function isSensitive(kind: BrowserFormFieldKind, label: string, el: Record<string, unknown>): boolean {
  if (kind === "password" || kind === "otp") return true;
  const blob = [label, String(el.nameAttr ?? ""), String(el.autocomplete ?? "")].join(" ");
  return SECRET_LABEL_RE.test(blob);
}

/** True when a snapshot element is a card/wallet/payment control (§9.5i). */
export function isPaymentFieldElement(el: Record<string, unknown>): boolean {
  const autocomplete = String(el.autocomplete ?? "").trim();
  if (PAYMENT_AUTOCOMPLETE_RE.test(autocomplete)) return true;
  const blob = [
    String(el.name ?? ""),
    String(el.text ?? ""),
    String(el.nameAttr ?? ""),
    String(el.placeholder ?? ""),
    autocomplete,
  ].join(" ");
  return PAYMENT_FIELD_RE.test(blob);
}

/**
 * Advisory payment-wall detect from page chrome (V-OUT-21).
 * Stronger when both path/title and body mention pay, or cc-* fields exist.
 */
export function detectPaymentWall(input: {
  url: string;
  title?: string;
  textSample?: string;
  elements?: Array<Record<string, unknown>>;
}): boolean {
  if (input.elements?.some((el) => isPaymentFieldElement(el))) return true;
  const url = (input.url || "").toLowerCase();
  const title = (input.title || "").toLowerCase();
  const text = (input.textSample || "").toLowerCase().slice(0, 2_000);
  const pathPay = /\/(checkout|payment|pay|billing|wallet)\b/i.test(url);
  const titlePay = PAYMENT_PAGE_RE.test(title);
  const bodyPay = PAYMENT_PAGE_RE.test(text);
  if (pathPay && (titlePay || bodyPay)) return true;
  if (titlePay && bodyPay && /\b(card|cvv|cvc|apple\s*pay|google\s*pay|wallet)\b/i.test(text)) {
    return true;
  }
  return false;
}

function pickSubmitRef(
  elements: Array<Record<string, unknown>>,
  explicit?: string,
): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  for (const el of elements) {
    const tag = String(el.tag ?? "").toLowerCase();
    const role = String(el.role ?? "").toLowerCase();
    const inputType = String(el.inputType ?? "").toLowerCase();
    const name = String(el.name ?? el.text ?? "").toLowerCase();
    const ref = String(el.ref ?? "").trim();
    if (!ref) continue;
    if (inputType === "submit") return ref;
    if (
      (tag === "button" || role === "button") &&
      /\b(submit|sign\s*in|log\s*in|continue|next|save|apply|confirm|send|upload)\b/i.test(name)
    ) {
      return ref;
    }
  }
  return undefined;
}

/**
 * Build card fields from stamped snapshot elements (Design §9.5g.3 / §9.5i).
 * Skips nav-only and payment/wallet controls; caps at {@link BROWSER_FORM_FIELD_CAP}.
 */
export function deriveBrowserFormFields(
  elements: Array<Record<string, unknown>>,
  opts?: { fieldRefs?: string[]; submitRef?: string },
): {
  fields: BrowserFormField[];
  submitRef?: string;
  /** True when payment fields were present (skipped) or page is a pay wall. */
  paymentBlocked?: boolean;
  skippedPaymentFields?: number;
} {
  const filter =
    Array.isArray(opts?.fieldRefs) && opts!.fieldRefs!.length > 0
      ? new Set(opts!.fieldRefs!.map((r) => String(r).trim()).filter(Boolean))
      : null;
  const fields: BrowserFormField[] = [];
  let skippedPaymentFields = 0;
  for (const el of elements) {
    if (fields.length >= BROWSER_FORM_FIELD_CAP) break;
    const ref = String(el.ref ?? "").trim();
    if (!ref) continue;
    if (filter && !filter.has(ref)) continue;
    if (!isFillable(el)) continue;
    if (isPaymentFieldElement(el)) {
      skippedPaymentFields += 1;
      continue;
    }
    const kind = inferKind(el);
    const label = inferLabel(el, kind, fields.length);
    const sensitive = isSensitive(kind, label, el);
    const field: BrowserFormField = {
      id: `f${fields.length}`,
      label,
      ref,
      kind,
      sensitive,
      ...(el.required === true ? { required: true } : {}),
    };
    if (kind === "file") {
      const accept = String(el.accept ?? "").trim().slice(0, 200);
      if (accept) field.accept = accept;
      if (el.multiple === true) field.multiple = true;
    }
    if (kind === "select" && Array.isArray(el.selectOptions)) {
      const options = (el.selectOptions as Array<Record<string, unknown>>)
        .map((o) => ({
          value: String(o.value ?? "").trim().slice(0, 200),
          label: String(o.label ?? o.value ?? "").trim().slice(0, 200),
        }))
        .filter((o) => o.value);
      if (options.length) field.options = options.slice(0, 48);
    }
    fields.push(field);
  }
  const submitRef = pickSubmitRef(elements, opts?.submitRef);
  const paymentBlocked =
    skippedPaymentFields > 0 && fields.length === 0
      ? true
      : skippedPaymentFields > 0 && skippedPaymentFields >= fields.length;
  return {
    fields,
    ...(submitRef ? { submitRef } : {}),
    ...(paymentBlocked || skippedPaymentFields > 0
      ? { paymentBlocked: Boolean(paymentBlocked), skippedPaymentFields }
      : {}),
  };
}
