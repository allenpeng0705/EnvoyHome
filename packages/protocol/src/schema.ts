// @envoyhome/protocol — dependency-free JSON Schema (subset) validator.
//
// Design Appendix A specifies `home.*` payloads as JSON Schema, and Plan B1 asks
// for "Ajv or equivalent". This is the "equivalent": a small, total, well-tested
// implementation of exactly the keywords Appendix A uses. It is deliberately NOT
// a general-purpose JSON Schema engine — an unimplemented keyword would be a
// silent hole, so `assertSupportedSchema` rejects any keyword we do not enforce
// (see SUPPORTED_KEYWORDS) and the test suite covers each one's happy + sad path.
//
// Ordering guarantee: validation is deterministic and reports EVERY failure, not
// just the first, so `V-PROTO-1`'s "sad paths reject correctly" can assert on the
// full set.

export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  enum?: readonly unknown[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  description?: string;
}

export interface ValidationIssue {
  /** JSON Pointer-ish path, e.g. `/params/accountId` or `/learns/0/kind`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** The complete keyword set this validator enforces. Anything else is an error
 *  at schema-registration time rather than a silently ignored constraint. */
export const SUPPORTED_KEYWORDS: readonly string[] = [
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "enum",
  "const",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "oneOf",
  "anyOf",
  "allOf",
  "description",
];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function jsonTypeOf(value: unknown): JsonSchemaType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    default:
      return "object";
  }
}

function matchesType(value: unknown, expected: JsonSchemaType): boolean {
  const actual = jsonTypeOf(value);
  if (expected === actual) return true;
  // An integer satisfies `number`; a `number` does NOT satisfy `integer`.
  if (expected === "number" && actual === "integer") return true;
  return false;
}

/** Throws if a schema uses a keyword this validator does not enforce. Called by
 *  the catalogue's self-check test, so an unsupported keyword can never ship. */
export function assertSupportedSchema(schema: JsonSchema, path = "#"): void {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.includes(key)) {
      throw new Error(
        `assertSupportedSchema: unsupported keyword "${key}" at ${path} — ` +
          `add it to the validator and to SUPPORTED_KEYWORDS, or remove it from the schema`,
      );
    }
  }
  const walk = (child: JsonSchema | undefined, at: string): void => {
    if (child === undefined) return;
    assertSupportedSchema(child, at);
  };
  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) walk(v, `${path}/properties/${k}`);
  }
  if (typeof schema.additionalProperties === "object") {
    walk(schema.additionalProperties, `${path}/additionalProperties`);
  }
  walk(schema.items, `${path}/items`);
  for (const [i, s] of (schema.oneOf ?? []).entries()) walk(s, `${path}/oneOf/${i}`);
  for (const [i, s] of (schema.anyOf ?? []).entries()) walk(s, `${path}/anyOf/${i}`);
  for (const [i, s] of (schema.allOf ?? []).entries()) walk(s, `${path}/allOf/${i}`);
}

/** Validate `value` against `schema`. Reports all issues. */
export function validate(schema: JsonSchema, value: unknown, path = ""): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateInto(schema, value, path, issues);
  return issues;
}

function validateInto(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  const at = path === "" ? "" : path;

  if (schema.allOf) {
    for (const sub of schema.allOf) validateInto(sub, value, at, issues);
  }

  if (schema.oneOf) {
    const passes = schema.oneOf.filter((s) => validate(s, value, at).length === 0);
    if (passes.length !== 1) {
      issues.push({
        path: at,
        message:
          passes.length === 0
            ? `matches none of the ${schema.oneOf.length} allowed shapes`
            : `matches ${passes.length} of the ${schema.oneOf.length} allowed shapes (must match exactly one)`,
      });
      return; // oneOf failure makes further constraints noise
    }
  }

  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validate(s, value, at).length === 0);
    if (!ok) {
      issues.push({ path: at, message: `matches none of the ${schema.anyOf.length} allowed shapes` });
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path: at, message: `must equal ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    issues.push({
      path: at,
      message: `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(" | ")}`,
    });
  }

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((t) => matchesType(value, t))) {
      issues.push({
        path: at,
        message: `must be ${expected.join(" | ")}, got ${jsonTypeOf(value)}`,
      });
      return; // type mismatch makes the rest meaningless
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path: at, message: `must be at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path: at, message: `must be at most ${schema.maxLength} characters` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path: at, message: `must match ${schema.pattern}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path: at, message: `must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path: at, message: `must be <= ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path: at, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path: at, message: `must have at most ${schema.maxItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, i) => validateInto(schema.items!, item, `${at}/${i}`, issues));
    }
  }

  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        issues.push({ path: `${at}/${key}`, message: "is required" });
      }
    }
    const props = schema.properties ?? {};
    for (const [key, childSchema] of Object.entries(props)) {
      if (key in value) {
        validateInto(childSchema, value[key], `${at}/${key}`, issues);
      }
    }
    const extra = Object.keys(value).filter((k) => !(k in props));
    if (extra.length > 0) {
      if (schema.additionalProperties === false) {
        for (const key of extra) {
          issues.push({ path: `${at}/${key}`, message: "is not an allowed field" });
        }
      } else if (typeof schema.additionalProperties === "object") {
        for (const key of extra) {
          validateInto(schema.additionalProperties, value[key], `${at}/${key}`, issues);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ builders */
// A tiny DSL so the method catalogue reads like the Design doc's JSON blocks.

export const str = (o: Omit<JsonSchema, "type"> = {}): JsonSchema => ({ type: "string", ...o });
export const num = (o: Omit<JsonSchema, "type"> = {}): JsonSchema => ({ type: "number", ...o });
export const int = (o: Omit<JsonSchema, "type"> = {}): JsonSchema => ({ type: "integer", ...o });
export const bool = (o: Omit<JsonSchema, "type"> = {}): JsonSchema => ({ type: "boolean", ...o });
export const nul = (o: Omit<JsonSchema, "type"> = {}): JsonSchema => ({ type: "null", ...o });
export const iso = (o: Omit<JsonSchema, "type"> = {}): JsonSchema =>
  str({ description: "ISO-8601 UTC timestamp", ...o });
/** A `sha256:<64 lowercase hex>` digest — the only digest form in the protocol
 *  (Design §4.4 canonical form). */
export const digest = (): JsonSchema =>
  str({ pattern: "^sha256:[0-9a-f]{64}$", description: "canonical sha256 digest (Design §4.4)" });
export const enumOf = (...values: unknown[]): JsonSchema => ({ enum: values });
export const any = (description?: string): JsonSchema =>
  description === undefined ? {} : { description };
export const obj = (
  properties: Record<string, JsonSchema>,
  required: readonly string[] = [],
  additionalProperties: boolean | JsonSchema = false,
): JsonSchema => ({
  type: "object",
  properties,
  required: [...required],
  additionalProperties,
});
export const arr = (items: JsonSchema, o: Omit<JsonSchema, "type" | "items"> = {}): JsonSchema => ({
  type: "array",
  items,
  ...o,
});
/** `string | number | boolean | string[]` — a profile fact value (Design A.9). */
export const factValue = (): JsonSchema => ({
  oneOf: [str(), num(), bool(), arr(str())],
});
export const nullable = (inner: JsonSchema): JsonSchema => ({
  oneOf: [inner, { type: "null" }],
});
