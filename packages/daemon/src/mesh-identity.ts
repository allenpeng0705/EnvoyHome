// Durable libp2p identity for EnvoyHome hosting peer (EnvoyDev mesh-identity.ts peer).
// Persisted under secrets/ so mint's homeNodePeerId survives daemon restart.

import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EnvoyMeshOptions } from "@envoymesh/network";
import type { HomePaths } from "./home-paths.js";

export type HomeMeshPrivateKey = NonNullable<EnvoyMeshOptions["libp2pPrivateKey"]>;

/** `<stateDir>/secrets/mesh-identity.json` — product-owned, not the EnvoyMesh node profile key. */
export function meshIdentityPath(paths: HomePaths): string {
  return join(paths.secretsDir, "mesh-identity.json");
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Load persisted Ed25519 key, or generate and write `0o600`. */
export async function loadOrCreateMeshIdentity(
  keyFilePath: string,
): Promise<HomeMeshPrivateKey> {
  try {
    const bytes = await readFile(keyFilePath);
    return privateKeyFromProtobuf(new Uint8Array(bytes));
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  const key = await generateKeyPair("Ed25519");
  await mkdir(dirname(keyFilePath), { recursive: true });
  await writeFile(keyFilePath, privateKeyToProtobuf(key), { mode: 0o600 });
  return key;
}
