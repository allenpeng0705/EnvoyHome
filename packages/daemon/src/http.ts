// HTTP hatch on 4781 — Design §2.4 / Appendix A.8 / V-SEC-12.
// POST /v1/inbound with Bearer auth; account resolved from binding, never trusted from client alone.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { DeviceCredentialStore } from "./auth.js";
import type { DaemonLogger } from "./logger.js";
import { handleArtifactGet } from "./artifact-handler.js";
import type { ArtifactService } from "./artifacts.js";

export interface HatchDeps {
  port: number;
  apiKey: string;
  devices: DeviceCredentialStore;
  logger: DaemonLogger;
  /** Returns which accountIds the hatch API key is bound to (operator config). */
  hatchBoundAccounts: () => string[];
  /** Optional turn handler; until B5/B6 this is a no-op accepted response. */
  handleInbound?: (input: {
    accountId: string;
    text: string;
    sessionId?: string;
    async: boolean;
    clientTurnId?: string;
  }) => Promise<{ turnId: string; text: string; format: "markdown" }>;
  /** B11 signed artifact GET handler. */
  artifacts?: ArtifactService;
  artifactSecret?: () => Promise<Buffer>;
  production?: boolean;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * V-SEC-12: the hatch resolves the account from a binding.
 * A client-supplied accountId that the caller is not bound to is refused.
 */
export function resolveHatchAccount(
  requestedAccountId: unknown,
  boundAccounts: readonly string[],
): { accountId: string } | { error: string } {
  if (boundAccounts.length === 0) {
    return { error: "envoyhome.auth: hatch has no account bindings" };
  }
  if (typeof requestedAccountId === "string" && requestedAccountId.length > 0) {
    if (!boundAccounts.includes(requestedAccountId)) {
      return {
        error: `envoyhome.account_not_bound: hatch is not bound to account ${requestedAccountId}`,
      };
    }
    return { accountId: requestedAccountId };
  }
  if (boundAccounts.length === 1) {
    return { accountId: boundAccounts[0]! };
  }
  return { error: "envoyhome.bad_params: accountId required when hatch is bound to multiple accounts" };
}

export async function startHttpHatch(deps: HatchDeps): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && (url === "/health" || url.startsWith("/health?"))) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (
      req.method === "GET" &&
      url.startsWith("/artifacts/") &&
      deps.artifacts &&
      deps.artifactSecret
    ) {
      const handled = await handleArtifactGet(req, res, {
        artifacts: deps.artifacts,
        artifactSecret: deps.artifactSecret,
      });
      if (handled) return;
    }

    if (req.method === "POST" && (url === "/v1/inbound" || url.startsWith("/v1/inbound?"))) {
      const auth = req.headers.authorization ?? "";
      const expected = `Bearer ${deps.apiKey}`;
      if (!deps.apiKey || auth !== expected) {
        sendJson(res, 401, {
          error: { code: "UNAUTHORIZED", message: "envoyhome.auth: missing_token" },
        });
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, {
          error: { code: "BAD_PARAMS", message: "envoyhome.bad_params: invalid JSON body" },
        });
        return;
      }

      const resolved = resolveHatchAccount(body.accountId, deps.hatchBoundAccounts());
      if ("error" in resolved) {
        const status = resolved.error.includes("account_not_bound") ? 403 : 400;
        const code = resolved.error.includes("account_not_bound") ? "UNAUTHORIZED" : "BAD_PARAMS";
        sendJson(res, status, { error: { code, message: resolved.error } });
        return;
      }

      const text = typeof body.text === "string" ? body.text : "";
      if (!text) {
        sendJson(res, 400, {
          error: { code: "BAD_PARAMS", message: "envoyhome.bad_params: text is required" },
        });
        return;
      }

      const asyncFlag = body.async === true;
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
      const clientTurnId = typeof body.clientTurnId === "string" ? body.clientTurnId : undefined;

      if (deps.handleInbound) {
        const result = await deps.handleInbound({
          accountId: resolved.accountId,
          text,
          ...(sessionId !== undefined ? { sessionId } : {}),
          async: asyncFlag,
          ...(clientTurnId !== undefined ? { clientTurnId } : {}),
        });
        sendJson(res, 200, result);
        return;
      }

      // B2 stub — accepted, no turn pipeline yet (lands B5/B6).
      sendJson(res, 200, {
        turnId: `hatch-${Date.now()}`,
        text: "",
        format: "markdown",
        accepted: true,
        accountId: resolved.accountId,
      });
      return;
    }

    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "not found" } });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.port, "0.0.0.0", () => resolve());
  });
  const addr = server.address();
  const bound = typeof addr === "object" && addr ? addr.port : deps.port;
  deps.logger.info(`HTTP hatch listening on ${bound} (GET /health, POST /v1/inbound)`);
  return server;
}
