// resolveObject — smart-home analogue of safeJoin (Design §5.7.3). Applies to reads too.

export interface ObjectRecord {
  sourceId: string;
  channel: string;
  channelAccount: string;
  displayName: string;
  class: string;
  accountId: string | null;
  shared: boolean;
  neverUnattended: boolean;
  actuationAllowList: string[];
  indirectionAllowList: string[];
}

export interface ResolvedObjectHandle {
  objectId: string;
  sourceId: string;
  accountId: string;
  class: string;
  displayName: string;
  neverUnattended: boolean;
  actuationAllowList: string[];
  indirectionAllowList: string[];
}

export class ObjectRegistry {
  private readonly bySource = new Map<string, ObjectRecord>();

  upsert(record: ObjectRecord): void {
    this.bySource.set(record.sourceId, record);
  }

  get(sourceId: string): ObjectRecord | undefined {
    return this.bySource.get(sourceId);
  }

  /** Household scope: every bound object is visible to every profile (Design 2026-10-16l). */
  listForAccount(_accountId: string): ObjectRecord[] {
    return [...this.bySource.values()].filter((r) => r.accountId !== null);
  }
}

/**
 * Resolve a source to a handle for the calling account.
 * Unbound / unregistered ⇒ envoyhome.object_not_bound.
 * Bound ⇒ any household profile may resolve (Design 2026-10-16l).
 */
export function resolveObject(
  registry: ObjectRegistry,
  sourceId: string,
  _callerAccountId: string,
): ResolvedObjectHandle {
  const rec = registry.get(sourceId);
  if (!rec || rec.accountId === null) {
    throw Object.assign(
      new Error(`envoyhome.object_not_bound: ${sourceId} unbound or unknown`),
      { code: "object_not_bound" },
    );
  }
  return {
    objectId: `${rec.channel}:${rec.sourceId}`,
    sourceId: rec.sourceId,
    accountId: rec.accountId,
    class: rec.class,
    displayName: rec.displayName,
    neverUnattended: rec.neverUnattended,
    actuationAllowList: [...rec.actuationAllowList],
    indirectionAllowList: [...rec.indirectionAllowList],
  };
}
