# EnvoyHome conventions (must-follow)

| Field | Value |
|-------|-------|
| **Document** | Conventions every implementer must follow. Lands in B0. |
| **Source** | Distilled from Plan §5.1–§5.8 risk register + Design §5.7.2 (R13). |
| **Enforced by** | Code review checklist, lint rules, PR template. |
| **Violations** | Land as doctor issues (`conventions.<name>`) or fail CI. |

These rules exist because the peer projects (EnvoyMesh-family, OpenClaw, Hermes, OpenHuman, HomeClaw) all shipped, regressed, and learned the same lessons. Don't re-learn them.

**R1–R12** come from family regressions. **R13** comes from EnvoyHome's own smart-home surface (Design §5.7): it is the one rule here that exists because *we* can now actuate the physical world, and it is the most expensive one to get wrong.

---

## R1 — Pre-loop asserts must persist failures (Plan §5.2)

**Rule:** If a failure is persistent (not a transient retryable error), it must land in the persisted store **before** throwing — never silently at function head.

**Why:** Sanity checks / one-time init at function head bypass the loop's try-catch. The throw propagates out, no failure state lands in the persisted store, the UI shows "Not started yet" instead of the real error. This is the most common silent-failure mode.

**Pattern:**

```ts
// ❌ WRONG — silent at function head
function startTurn(ctx: TurnContext) {
  assert(ctx.account_id);  // throws → no persisted state
  for (...) { ... }
}

// ✅ RIGHT — inside the iteration
function startTurn(ctx: TurnContext) {
  for (const attempt of attempts) {
    try {
      assert(ctx.account_id);  // lands in store before throw
      ...
    } catch (err) {
      persistFailure(ctx.account_id, classify(err));  // classified error
      throw;
    }
  }
}
```

**Lint rule (suggested):** `no-restricted-syntax` banning `assert(...)` outside try-catch in `packages/harness-host/`.

---

## R2 — Allow-list IS the contract (Plan §5.2)

**Rule:** For any "send any intent" transport routed through a validator gate, the allow-list IS the contract. Adding a new intent family requires **both** an allow-list entry AND a regression test exercising every new value. No silent additions.

**Why:** A drift between the runtime allow-list and what the validator accepts is a security regression that no static type-check catches.

**Pattern:**

```ts
// validator.ts
const ALLOWED_INTENTS = new Set([
  "tool_call",
  "approval",
  "memory_op",
  // Add new intent families here AND in the regression test below
]);

export function validateIntent(intent: string): boolean {
  return ALLOWED_INTENTS.has(intent);
}

// validator.test.ts
test("every allowed intent has a regression case", () => {
  for (const intent of ALLOWED_INTENTS) {
    expect(validateIntent(intent)).toBe(true);
    // CI fails if a new intent lacks a test case
  }
});
```

---

## R3 — Cap checks inside iteration (Plan §5.2)

**Rule:** Cap checks live **inside** the iteration, not before. `break` cleanly when reached mid-cycle. Pre-loop bailouts miss growth inside the loop.

**Why:** A cap check at function head or "before loop start" assumes the resource is bounded before iteration. If the resource grows each iteration (queue, list, file), the cap is hit mid-cycle and the loop overruns.

**Pattern:**

```ts
// ❌ WRONG — assumes pre-loop cap is enough
function* process(items: Item[]) {
  if (items.length > CAP) throw new Error("too many");
  for (const item of items) yield process1(item);  // grows the queue
}

// ✅ RIGHT — check inside, break cleanly
function* process(items: Item[]) {
  let count = 0;
  for (const item of items) {
    if (count >= CAP) break;
    yield process1(item);
    count++;
  }
}
```

---

## R4 — Watchdog signals OR (probe = truth) (Plan §5.2)

**Rule:** Multiple "I'm alive" signals (log parser + direct probe + RPC ping + heartbeat) must OR. Direct probe is **source of truth**. Log parser is faster-but-flakier pre-confirmation. **Don't restart if EITHER says healthy.**

**Why ANDed pattern = wrong:** A flaky log parser with a healthy probe restarts a healthy daemon. Restarting kills in-flight turns.

**Pattern:**

```ts
// watchdog.ts
async function isHealthy() {
  const probeOk = await ping();           // source of truth
  const parserOk = await parseLogs();     // fast pre-confirmation
  return probeOk || parserOk;             // OR, not AND
}

async function maybeRestart() {
  if (await isHealthy()) return;          // EITHER healthy → no restart
  await restart();
}
```

---

## R5 — RPC timeout exceeds retry budget (Plan §5.1)

**Rule:** WebSocket RPC timeout must exceed `maxAttempts × (retryDelayMs + perAttemptTimeoutMs)`. Defaults: 30s ordinary; 120s long-running.

**Why:** If the RPC kills the wait first, callers get "timed out" with no classified hint and no progress bar.

**Pattern (test, not just config):**

```ts
test("rpc timeout > retry budget", () => {
  const runtime = { maxAttempts: 3, retryDelayMs: 1000, perAttemptTimeoutMs: 10_000 };
  const budget = runtime.maxAttempts * (runtime.retryDelayMs + runtime.perAttemptTimeoutMs);
  expect(HOST.timeoutMs).toBeGreaterThan(budget);
});
```

---

## R6 — UI hints from classified errors (Plan §5.3)

**Rule:** Persist `lastErrorKind` (network | proof-token | other) alongside `lastError`. Gate UI hints on **classification**, not regex of `lastError.message`. Always persist first-run failures (success AND catch paths).

**Why:** A user sees "Network error: socket hang up" and the UI shows a hint "Did you pair your phone?" — wrong. The string says network but the kind is proof-token. Classify, then hint.

**Pattern:**

```ts
// errors.ts
type ErrorKind = "network" | "proof-token" | "other";

function classify(err: unknown): ErrorKind {
  if (err instanceof NetError) return "network";
  if (err instanceof TokenError) return "proof-token";
  return "other";
}

// store.ts
function persistFailure(accountId: string, err: Error) {
  store.set(accountId, {
    lastError: err.message,
    lastErrorKind: classify(err),  // ← separate field
    at: new Date().toISOString(),
  });
}

// UI
const hint = ERR_HINTS[record.lastErrorKind];  // not ERR_HINTS[record.lastError]
```

---

## R7 — Settings form reads RESOLVED config (Plan §5.3)

**Rule:** For `resolveXxxConfig({ bundled, persisted })`, the Settings form must read the **RESOLVED** config, not just persisted. Keep the source-URI form so users can copy it. Test the **persisted-wins-over-bundled** path explicitly.

**Why:** Persisted config overrides bundled; if the form reads persisted alone, bundled defaults never load and the user sees an empty form after reset.

**Pattern:**

```ts
// resolve-config.ts
export function resolveConfig({ bundled, persisted }) {
  return { ...bundled, ...persisted };  // persisted wins
}

// SettingsForm.tsx
const config = resolveConfig({ bundled: bundledConfig, persisted: persistedConfig });
//                ← RESOLVED, not just persisted

// test
test("persisted wins over bundled", () => {
  const r = resolveConfig({
    bundled: { port: 4780 },
    persisted: { port: 4781 },
  });
  expect(r.port).toBe(4781);
});
```

---

## R8 — Fire-and-forget tests need drain helpers (Plan §5.2)

**Rule:** Any test that touches async fire-and-forget code must use `flushXxxLoop()` (drains microtasks + N macrotask ticks) and `__resetActiveXForTests()` (resets module-level Sets/Maps/counters). Symptom: passes in isolation, fails in suite with "Number of calls: 0".

**Why:** Sync runtime converted to fire-and-forget breaks test isolation in two ways — pending microtasks not drained, and module-level state leaking across tests.

**Pattern:**

```ts
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";

afterEach(() => {
  __resetActiveXForTests();  // clear module state
});

test("queue processes", async () => {
  queue.push(item);
  await flushLoop();  // drain microtasks + 10 macrotask ticks
  expect(handler).toHaveBeenCalled();
});
```

---

## R9 — `CI=true` after pnpm, not before (Plan §5.7)

**Rule:** In CI scripts, do **not** set `CI=true` before `pnpm install` — pnpm interprets it as strict mode (`--frozen-lockfile`, fails on postinstall scripts, fails on peer-dep warnings). Set `CI=true` only AFTER `pnpm install` completes. Always check pnpm's exit code directly (don't mask with `| tail -N`).

**Pattern (`scripts/ci.sh`):**

```bash
#!/usr/bin/env bash
set -euo pipefail

# pnpm first, NO CI yet
pnpm install
pnpm -r build
pnpm -r test

# Now CI is safe
export CI=true
pnpm -r lint
```

---

## R10 — Compatibility: one wire mechanism, separate from on-disk migrations (Design §3.7, Plan §5.6)

**Rule:** There are exactly **three** version numbers, on three axes — do not add a fourth and do not conflate them:

| Axis | Number | Bump when |
|------|--------|-----------|
| Wire protocol | `protocolApiVersion` (`packages/protocol/src/version.ts`, advertised in `home.hello`) | **breaking** wire change only: method removed/renamed, field removed, type or meaning changed, schema tightened so previously-valid params fail |
| Plugin contract | `apiVersion` in the `envoyhome` manifest block | the plugin contract changes (plugin `apiVersion` ≤ daemon max, else refuse enable) |
| On-disk state | `stateSchemaVersion` in `daemon.json` | stored-data shape changes; migrations are explicit code in `packages/daemon/src/migrations/` |

**Additive change needs no bump.** A new method or a new optional field is discovered via `home.hello.methods[]` (Design Q1); clients MUST tolerate its absence. Do **not** add a protocol-level `apiVersion` alongside `methods[]` — that is the second mechanism Design §3.7 forbids.

**Errors:** an old client calling a removed method gets `envoyhome.version_too_low: …`; params that no longer validate get `envoyhome.bad_params: …`. Never an opaque "unknown method".

**Pattern:**

```ts
// protocol/version.ts
export const PROTOCOL_API_VERSION = 1;   // bump ONLY for a breaking wire change

// daemon/migrations/index.ts
export const MIGRATIONS = [
  { from: 1, to: 2, run: (state) => /* ... */ },
];

// daemon/main.ts
async function start() {
  const current = await loadStateSchemaVersion();   // daemon.json
  if (current < CURRENT_STATE_SCHEMA_VERSION) {
    for (const m of MIGRATIONS) {
      if (current < m.to) await m.run(current);
    }
  }
}
```

**Why:** the earlier wording said "every `home.*` schema change bumps `apiVersion`", which contradicts the additive-fields rule and would have made every optional field a breaking change. One axis, one rule.

---

## R11 — Wire protocol: same envelope, never invent a second wrapper (Design §3.1)

**Rule:** Adopt the family envelope `{id, method, params?}` / `{id, result|error}` / `{event, data}`. The **types are defined in `@envoymesh/protocol`** (`packages/protocol/src/json-rpc-wire.ts:23-51`); `@envoymesh/reuse-host` only *re-exports the transport* over `@envoymesh/host-connect`'s `WsServer`. Depend on `@envoymesh/protocol` for the shapes and `@envoymesh/reuse-host` for hosting — do not go looking for the types in `reuse-host`, and do not re-declare them.

**Details that are easy to get wrong:**
- `error.code` is a **string from the transport's closed catalogue**, not JSON-RPC's numeric code. Namespace the **message** instead: `envoyhome.<snake>: …`.
- Tolerate `messageKey?` / `messageValues?` on inbound errors — EnvoyCoder's copy adds them for i18n.
- `on` / `off` take `{ event }` and must run **after** authentication (the family shipped the opposite bug).
- Pairing claims set `app=EnvoyHome` — and EnvoyHome must also **validate** an inbound code's `app`, because an absent `app` never mismatches.

**Never** invent a second envelope shape per package.

---

## R12 — Plugin lifecycle vs daemon restart (Plan §5.5)

**Rule:** Plugin state stored per `channelAccount` and persisted (`channels.json`). On daemon restart, re-`start(ctx)` on the same state and re-check health. Sidecar health checked every Ns; unhealthy → mark (never silently fail closed).

---

## R13 — Physical actuation is `admin`, class-keyed, and never implicitly granted (Design §5.7.2)

**Rule:** Any call that changes the physical world is **`admin`** — never `write`. It requires an attended approval when a human is present, and a matching, unexpired **grant** when unattended (Design §4.3.2). A **safety class** of calls requires an attended approval **every time** and must be refused a grant **at creation and again at dispatch**.

**Why this rule was rewritten.** The first version of R13 shipped this as the reference implementation:

```ts
// ❌ WITHDRAWN — fails open in five ways
const SAFETY_LIST = /^(lock\.unlock|garage|valve|gate|alarm\.disarm)/;
neverUnattended: (args) => SAFETY_LIST.test(args.service),
```

It is wrong: `alarm_control_panel.alarm_disarm` is the real HA disarm service and does **not** match; garage and gate are `cover.*` and the words never appear in a service string; `lock.open` is unmatched; `mqtt_publish` has no `args.service` at all, so `test(undefined)` is `false` and **every MQTT actuation was grantable**; and `script.turn_on` / `scene.turn_on` / `button.press` bypass string matching entirely — including a script named `unlock_front_door`. It also inspected a string the model chooses from text that Design §5.7.4 rule 2 concedes is attacker-controllable. **Do not reintroduce it or anything shaped like it.**

**Rule (the real one): classify on the resolved object, as data, deny-by-default.** A call is safety-class iff **any** of:

0. Its `domain`/`service` is **outside the recognised vocabulary** — the normative table in Design §5.7.2. Deny-by-default is only meaningful against a closed list, so that table (not a constant in this file) is the definition of "known". Vendor domains, typos, and domains a future Home Assistant release adds are all safety-class.

1. The **resolved object's declared `class`** (`objects.json`, Design §5.7.3) is `lock`, `garage`, `gate`, `valve`, or `alarm` — the authoritative signal, and the only one a per-call argument cannot rewrite.
2. `domain.service` is on the deny list: `lock.{unlock,open}`, `cover.{open_cover,open_cover_tilt,set_cover_position,toggle}`, `valve.{open_valve,set_valve_position}`, `alarm_control_panel.{alarm_disarm,alarm_arm_night,alarm_arm_away}`, and any `*.toggle` whose target class is in (1).
3. The target is an **indirection**: `domain ∈ {script, scene, button, input_button, automation}`, or the resolved entity is one. Deny by default; a specific script may be operator-allow-listed, and that allow-list entry is itself attended-only.
4. **MQTT**: the topic is not in the object's `actuationAllowList`. MQTT has no service taxonomy, so **unknown and unlisted topics are safety-class**.
5. The object is marked `neverUnattended`.

**Also rule:**

- **Unknown defaults to safety-class.** An unrecognised domain, service, class or topic is denied unattended — never treated as normal.
- **Never downgrade.** Evaluate the resolved object's class **first**; model-chosen strings may only **escalate** a call into the safety class. This is what makes the decision independent of a prompt-injected event body.
- **Refuse at dispatch too**, not only at creation: a creation-time check cannot know what a digest will match later (`envoyhome.actuation_never_unattended`, Design §4.4).
- **You are not the gate.** Approval, grants, dispatch and the journal belong to the daemon (Design §4.4, §5.7.7). A tool declares its tier and `idempotent` flag and nothing else.

**Pattern (data, not a regex):**

```ts
// packages/smarthome/src/safety-class.ts — the shape, not the whole table
const SAFETY_CLASSES = new Set(["lock", "garage", "gate", "valve", "alarm"]);

const DENY_SERVICES = new Set([
  "lock.unlock", "lock.open",
  "cover.open_cover", "cover.open_cover_tilt", "cover.set_cover_position", "cover.toggle",
  "valve.open_valve", "valve.set_valve_position",
  "alarm_control_panel.alarm_disarm", "alarm_control_panel.alarm_arm_night",
  "alarm_control_panel.alarm_arm_away",
]);

const INDIRECTION_DOMAINS = new Set(["script", "scene", "button", "input_button", "automation"]);

export function isSafetyClass(call: ResolvedCall): boolean {
  // (1) the authoritative signal — from the registry, not from args
  if (SAFETY_CLASSES.has(call.object.class)) return true;
  if (call.object.neverUnattended) return true;

  // (2) explicit deny list, including toggle on a safety class
  const svc = `${call.domain}.${call.service}`;
  if (DENY_SERVICES.has(svc)) return true;
  if (call.service === "toggle" && SAFETY_CLASSES.has(call.object.class)) return true;

  // (3) indirection — deny by default, allow-list only via owner-scope config
  if (INDIRECTION_DOMAINS.has(call.domain)) return true;

  // (4) MQTT: no taxonomy, so unlisted means unsafe
  if (call.channel === "mqtt") return !call.object.actuationAllowList.includes(call.topic);

  // (5) unknown → safety-class, never "normal".
  //     KNOWN_DOMAINS / KNOWN_SERVICES are NOT defined here — they are the
  //     normative recognised-vocabulary table in Design §5.7.2 ("Always
  //     safety-class" / "Indirection" / "Actuating, class-dependent" /
  //     "Non-actuating"). Anything outside that table is safety-class, which
  //     includes vendor domains (esphome, matter) and domains a future HA
  //     release adds. Extending the table is a Normative change plus a new
  //     Appendix C.4 row.
  return !isRecognisedDomain(call.domain) || !isRecognisedService(call.domain, call.service);
}
```

**Idempotency (Design §5.7.7).** Tools also declare `idempotent`. `set`-semantics (`turn_on`, `lock`, `set_position`) are idempotent; `*.toggle` is not, and a non-idempotent service **must not** run unattended — an automation expresses desired *state*, not a flip.

**Tests (Design Appendix C.4).** The required-deny corpus is the regression guard, and it is written to **grow ahead of the code**: `lock.open`, `cover.open_cover`, `cover.set_cover_position`, `valve.open_valve`, `alarm_control_panel.alarm_disarm`, `script.turn_on` on `script.unlock_front_door`, `scene.turn_on`, `button.press`, `*.toggle` on a lock class, an unlisted MQTT topic, an unrecognised domain, a `neverUnattended` object, and any service against a `lock`/`alarm`/`garage`/`gate`/`valve` object. Add a row **before** fixing a new bypass.

**Also rule:** a workflow's `tool` step is a real tool call (Design §7.2) — **an automation is never an approval bypass**.

---

## Quick reference — rule → test name

| Rule | Test name | File |
|------|-----------|------|
| R1 pre-loop asserts | `harness-host.test.ts` "pre-loop assert persists" | `packages/harness-host/test/` |
| R2 allow-list | `validator.test.ts` "every allowed intent has regression case" | `packages/harness-host/test/` |
| R3 cap inside iteration | `turn.test.ts` "cap reached mid-cycle breaks cleanly" | `packages/harness-host/test/` |
| R4 watchdog OR | `watchdog.test.ts` "log-parser unhealthy, probe healthy → no restart" | `packages/daemon/test/` |
| R5 RPC timeout | `host.test.ts` "timeoutMs > maxAttempts * ..." | `packages/daemon/test/` |
| R6 classified errors | `errors.test.ts` "classified network → hint shown; unclassified → no hint" | `packages/daemon/test/` |
| R7 resolved config | `resolve-config.test.ts` "persisted wins over bundled" | `apps/desktop/test/` |
| R8 drain helpers | `flush.test.ts` "suite-level drain clears pending" | `packages/test-utils/test/` |
| R9 CI ordering | `ci.test.sh` "CI unset during pnpm install" | `scripts/` |
| R10 compatibility axes | `compat.test.ts` "additive method needs no bump; breaking change without a bump fails" | `packages/protocol/test/` |
| R11 envelope | `protocol.test.ts` "all methods use the `@envoymesh/protocol` envelope" | `packages/protocol/test/` |
| R12 plugin restart | `channels.test.ts` "kill daemon → restart → plugin state preserved" | `packages/daemon/test/` |
| R13 actuation is admin | `smarthome.test.ts` "unattended unlock refused; grant for safety list refused at creation" | `packages/smarthome/test/` |

If a rule has no regression test, it isn't enforced — that's a CI gap, file an issue.