// Design §19.10 standing orders — durable rules; cron syncs into ScheduleService.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HomePaths } from "./home-paths.js";
import type { SchedulePayload, ScheduleSpec } from "./schedule/types.js";

export type StandingWhen =
  | { kind: "cron"; cronExpr: string; timeZone?: string }
  | { kind: "channel_event"; channel: string; eventType?: string }
  | { kind: "smarthome_event"; sourceId: string; eventType?: string };

export type StandingAction =
  | { kind: "notify"; message: string }
  | { kind: "workflow"; workflowId: string }
  | {
      kind: "agentTurn";
      prompt: string;
      toolPolicyPreset?: "standard" | "restricted";
      maxToolRounds?: number;
    };

export type StandingOrder = {
  id: string;
  accountId: string;
  name: string;
  enabled: boolean;
  when: StandingWhen;
  action: StandingAction;
  createdAt: string;
  updatedAt: string;
};

export function standingJobId(orderId: string): string {
  return `standing:${orderId}`;
}

export class StandingOrderStore {
  constructor(private readonly paths: HomePaths) {}

  private pathFor(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "standing-orders.json");
  }

  async list(accountId: string): Promise<StandingOrder[]> {
    try {
      const raw = JSON.parse(await readFile(this.pathFor(accountId), "utf8")) as {
        orders?: StandingOrder[];
      };
      return Array.isArray(raw.orders) ? raw.orders.filter((o) => o.accountId === accountId) : [];
    } catch {
      return [];
    }
  }

  async get(accountId: string, id: string): Promise<StandingOrder | undefined> {
    return (await this.list(accountId)).find((o) => o.id === id);
  }

  async put(
    input: Omit<StandingOrder, "id" | "createdAt" | "updatedAt" | "enabled"> & {
      id?: string;
      enabled?: boolean;
    },
  ): Promise<StandingOrder> {
    validateStandingOrder(input);
    const now = new Date().toISOString();
    const rows = await this.list(input.accountId);
    const id = input.id?.trim() || randomUUID();
    const existing = rows.find((o) => o.id === id);
    const row: StandingOrder = {
      id,
      accountId: input.accountId,
      name: input.name.trim().slice(0, 120),
      enabled: input.enabled !== false,
      when: input.when,
      action: input.action,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? rows.map((o) => (o.id === id ? row : o))
      : [...rows, row];
    await this.writeAll(input.accountId, next);
    return row;
  }

  async remove(accountId: string, id: string): Promise<boolean> {
    const rows = await this.list(accountId);
    const next = rows.filter((o) => o.id !== id);
    if (next.length === rows.length) return false;
    await this.writeAll(accountId, next);
    return true;
  }

  async setEnabled(accountId: string, id: string, enabled: boolean): Promise<StandingOrder | undefined> {
    const row = await this.get(accountId, id);
    if (!row) return undefined;
    return this.put({ ...row, enabled });
  }

  private async writeAll(accountId: string, orders: StandingOrder[]): Promise<void> {
    const path = this.pathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ orders }, null, 2) + "\n", "utf8");
  }
}

export function validateStandingOrder(input: {
  name: string;
  when: StandingWhen;
  action: StandingAction;
}): void {
  if (!input.name?.trim()) {
    throw Object.assign(new Error("envoyhome.bad_params: standing order needs name"), {
      code: "bad_params",
    });
  }
  const w = input.when;
  if (w.kind === "cron") {
    if (!w.cronExpr?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: cronExpr required"), {
        code: "bad_params",
      });
    }
  } else if (w.kind === "channel_event") {
    if (!w.channel?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: channel required"), {
        code: "bad_params",
      });
    }
  } else if (w.kind === "smarthome_event") {
    if (!w.sourceId?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: sourceId required"), {
        code: "bad_params",
      });
    }
  } else {
    throw Object.assign(new Error("envoyhome.bad_params: unknown when.kind"), {
      code: "bad_params",
    });
  }
  const a = input.action;
  if (a.kind === "notify") {
    if (!a.message?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: notify message required"), {
        code: "bad_params",
      });
    }
  } else if (a.kind === "workflow") {
    if (!a.workflowId?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: workflowId required"), {
        code: "bad_params",
      });
    }
  } else if (a.kind === "agentTurn") {
    if (!a.prompt?.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: agentTurn prompt required"), {
        code: "bad_params",
      });
    }
  } else {
    throw Object.assign(new Error("envoyhome.bad_params: unknown action.kind"), {
      code: "bad_params",
    });
  }
}

/** Map a cron standing order to a ScheduleService job shape. */
export function standingOrderToScheduleParts(
  order: StandingOrder,
  defaultTimeZone: string,
): { spec: ScheduleSpec; payload: SchedulePayload } | undefined {
  if (order.when.kind !== "cron") return undefined;
  const tz = order.when.timeZone?.trim() || defaultTimeZone;
  const spec: ScheduleSpec = {
    kind: "cron",
    cronExpr: order.when.cronExpr.trim(),
    timeZone: tz,
  };
  let payload: SchedulePayload;
  if (order.action.kind === "notify") {
    payload = { kind: "notify", message: order.action.message.trim() };
  } else if (order.action.kind === "workflow") {
    payload = { kind: "workflow", workflowId: order.action.workflowId.trim() };
  } else {
    payload = {
      kind: "agentTurn",
      prompt: order.action.prompt.trim(),
      ...(order.action.toolPolicyPreset
        ? { toolPolicyPreset: order.action.toolPolicyPreset }
        : {}),
      ...(order.action.maxToolRounds !== undefined
        ? { maxToolRounds: order.action.maxToolRounds }
        : {}),
    };
  }
  return { spec, payload };
}

export type StandingEventTrigger =
  | { kind: "channel_event"; channel: string; eventType?: string }
  | { kind: "smarthome_event"; sourceId: string; eventType?: string };

/** Match enabled non-cron standing orders to an inbound trigger. */
export function matchStandingOrders(
  orders: readonly StandingOrder[],
  trigger: StandingEventTrigger,
): StandingOrder[] {
  return orders.filter((o) => {
    if (!o.enabled) return false;
    if (trigger.kind === "channel_event") {
      if (o.when.kind !== "channel_event") return false;
      if (o.when.channel.trim() !== trigger.channel.trim()) return false;
      if (o.when.eventType && trigger.eventType && o.when.eventType !== trigger.eventType) {
        return false;
      }
      return true;
    }
    if (o.when.kind !== "smarthome_event") return false;
    if (o.when.sourceId.trim() !== trigger.sourceId.trim()) return false;
    if (o.when.eventType && trigger.eventType && o.when.eventType !== trigger.eventType) {
      return false;
    }
    return true;
  });
}

/**
 * Run standing-order actions for an inbound event (Design §19.10).
 * notify → push/callback; workflow/agentTurn → schedule run-now style handlers.
 */
export async function fireStandingOrderMatches(input: {
  orders: readonly StandingOrder[];
  trigger: StandingEventTrigger;
  onNotify: (order: StandingOrder, message: string) => Promise<void>;
  onWorkflow: (order: StandingOrder, workflowId: string) => Promise<void>;
  onAgentTurn: (order: StandingOrder, prompt: string) => Promise<void>;
}): Promise<{ fired: string[] }> {
  const matched = matchStandingOrders(input.orders, input.trigger);
  const fired: string[] = [];
  for (const order of matched) {
    if (order.action.kind === "notify") {
      await input.onNotify(order, order.action.message);
    } else if (order.action.kind === "workflow") {
      await input.onWorkflow(order, order.action.workflowId);
    } else {
      await input.onAgentTurn(order, order.action.prompt);
    }
    fired.push(order.id);
  }
  return { fired };
}
