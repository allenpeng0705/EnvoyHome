// §9.5i handoff openUrl — https only + SSRF host refuse (V-OUT-23).

import { isBlockedHostname } from "./skill-remote.js";

/** Handoff Open destination — https only; same host refuse family as browser navigate. */
export function assertHandoffOpenUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw Object.assign(new Error("envoyhome.bad_params: invalid openUrl"), {
      code: "bad_params",
    });
  }
  if (url.protocol !== "https:") {
    throw Object.assign(new Error("envoyhome.unsafe: handoff openUrl must be https"), {
      code: "unsafe",
    });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("envoyhome.unsafe: openUrl must not include credentials"), {
      code: "unsafe",
    });
  }
  if (isBlockedHostname(url.hostname)) {
    throw Object.assign(new Error(`envoyhome.unsafe: openUrl host refused: ${url.hostname}`), {
      code: "unsafe",
    });
  }
  return url;
}
