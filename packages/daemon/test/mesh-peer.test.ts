// Home mesh peer + mint mesh fields (EnvoyDev createCoderMeshPeer peer, fakes only).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToProtobuf } from "@libp2p/crypto/keys";
import {
  createHomeMeshPeer,
  homeMeshOptions,
  meshMintFields,
  loadOrCreateMeshIdentity,
  meshIdentityPath,
  homePaths,
  type HomeMeshPeerNode,
} from "../dist/index.js";

function fakeNode(peerId = "12D3KooWFakeHomePeer"): HomeMeshPeerNode {
  const multiaddrs = [`/ip4/127.0.0.1/tcp/4001/p2p/${peerId}`];
  return {
    peerId,
    multiaddrs,
    async start() {
      /* ready */
    },
    async stop() {
      /* ok */
    },
    async handleRawProtocol() {
      /* registered */
    },
    getRelayAdvertisedMultiaddrs() {
      return [
        ...multiaddrs,
        `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWrelay/p2p-circuit/p2p/${peerId}`,
      ];
    },
    getConnectedPeerIds() {
      return [];
    },
  };
}

test("homeMeshOptions: phone-facing host, no DHT/mDNS swarm", () => {
  const opts = homeMeshOptions();
  assert.equal(opts.enableDht, false);
  assert.equal(opts.enableMdns, false);
  assert.equal(opts.enableRelay, true);
  assert.equal(opts.enableDcutr, true);
  assert.ok((opts.configuredRelayAddrs?.length ?? 0) >= 1);
  assert.deepEqual(opts.bootstrapPeers, []);
});

test("createHomeMeshPeer: fake node → hosting + mint fields", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-mesh-"));
  try {
    const paths = homePaths(stateDir);
    const peer = createHomeMeshPeer({
      paths,
      sessionIdentity: {
        localScopeKey: "loopback-owner",
        resolveSession: async () => null,
      },
      dispatch: async () => ({}),
      createNode: () => fakeNode("12D3KooWTestPeer"),
    });
    const status = await peer.start();
    assert.equal(status.kind, "hosting");
    assert.equal(status.peerId, "12D3KooWTestPeer");
    assert.ok((status.multiaddrs ?? []).some((a) => a.includes("p2p-circuit")));

    const fields = meshMintFields(peer);
    assert.equal(fields.homeNodePeerId, "12D3KooWTestPeer");
    assert.ok((fields.bootstrapPeers?.length ?? 0) >= 2);

    // Idempotent second start.
    const again = await peer.start();
    assert.equal(again.kind, "hosting");
    assert.equal(again.peerId, "12D3KooWTestPeer");

    await peer.stop();
    assert.equal(peer.status().kind, "no-node");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("mesh identity: loadOrCreate is idempotent on the same path", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-mesh-id-"));
  try {
    const path = meshIdentityPath(homePaths(stateDir));
    const a = await loadOrCreateMeshIdentity(path);
    const b = await loadOrCreateMeshIdentity(path);
    assert.deepEqual(privateKeyToProtobuf(a), privateKeyToProtobuf(b));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("closeStreamsForDevice returns 0 when no proxy sessions", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-mesh-close-"));
  try {
    const peer = createHomeMeshPeer({
      paths: homePaths(stateDir),
      sessionIdentity: {
        localScopeKey: "loopback-owner",
        resolveSession: async () => null,
      },
      dispatch: async () => ({}),
      createNode: () => fakeNode(),
    });
    await peer.start();
    assert.equal(peer.closeStreamsForDevice("dev_missing"), 0);
    await peer.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
