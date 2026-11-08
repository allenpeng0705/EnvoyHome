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
  | "checkbox";

export type BrowserFormField = {
  id: string;
  label: string;
  ref: string;
  kind: BrowserFormFieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  sensitive: boolean;
};

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
    inputType === "file" ||
    inputType === "hidden"
  ) {
    return true;
  }
  return false;
}

function isFillable(el: Record<string, unknown>): boolean {
  if (isNavOnly(el)) return false;
  const tag = String(el.tag ?? "").toLowerCase();
  const role = String(el.role ?? "").toLowerCase();
  const inputType = String(el.inputType ?? "").toLowerCase();
  if (tag === "textarea" || role === "textbox") return true;
  if (tag === "select" || role === "combobox") return true;
  if (tag === "input") {
    if (!inputType || inputType === "text" || inputType === "email" || inputType === "search" ||
        inputType === "tel" || inputType === "url" || inputType === "number" ||
        inputType === "password" || inputType === "checkbox") {
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
      /\b(submit|sign\s*in|log\s*in|continue|next|save|apply|confirm|send)\b/i.test(name)
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
