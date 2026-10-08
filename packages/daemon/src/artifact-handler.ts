// GET /artifacts/{accountId}/{token} — verify HMAC + path jail (Plan B11).

import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyArtifactToken } from "./artifact-signer.js";
import type { ArtifactService } from "./artifacts.js";

export function parseArtifactRequest(url: string): { accountId: string; token: string } | null {
  const path = url.split("?")[0] ?? url;
  const prefix = "/artifacts/";
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const accountId = decodeURIComponent(rest.slice(0, slash));
  const token = rest.slice(slash + 1);
  if (!accountId || !token) return null;
  return { accountId, token };
}

export async function handleArtifactGet(
  req: IncomingMessage,
  res: ServerResponse,
  deps: {
    artifacts: ArtifactService;
    artifactSecret: () => Promise<Buffer>;
  },
): Promise<boolean> {
  const parsed = parseArtifactRequest(req.url ?? "/");
  if (!parsed) return false;

  const secret = await deps.artifactSecret();
  const verified = verifyArtifactToken(secret, parsed.token);
  if (!verified.ok) {
    const status = verified.reason === "expired" ? 403 : 403;
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(verified.reason === "expired" ? "expired" : "forbidden");
    return true;
  }
  if (verified.payload.accountId !== parsed.accountId) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return true;
  }

  let absolute: string;
  try {
    absolute = deps.artifacts.resolveArtifactPath(parsed.accountId, verified.payload.path);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return true;
  }

  res.writeHead(200, { "content-type": "application/octet-stream" });
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absolute);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
      resolve();
    });
    stream.pipe(res);
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return true;
}
