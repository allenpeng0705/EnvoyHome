/** Join provider base URL with an API path (`/v1/chat/completions`, `/v1/messages`). */

export function joinProviderUrl(baseUrl: string, apiPath: string): string {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  // Host-only or …/v1 → append the full api path under that origin.
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    // If base already ends with /v1 (or /v1/…), replace trailing segment with apiPath.
    const basePath = u.pathname.replace(/\/+$/, "") || "";
    if (basePath === "" || basePath === "/") {
      u.pathname = path;
    } else if (basePath.endsWith("/v1") || /\/v\d+$/.test(basePath)) {
      // https://api.openai.com/v1 + /v1/chat/completions → …/v1/chat/completions
      const suffix = path.replace(/^\/v\d+/, "");
      u.pathname = `${basePath}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
    } else {
      u.pathname = `${basePath}${path}`;
    }
    return u.toString();
  } catch {
    return `${trimmed}${path}`;
  }
}
