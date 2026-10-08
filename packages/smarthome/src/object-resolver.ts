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

  listForAccount(accountId: string): ObjectRecord[] {
    return [...this.bySource.values()].filter(
      (r) => r.accountId === accountId || (r.shared && r.accountId !== null),
    );
  }
}

/**
 * Resolve a source to a handle for the calling account.
 * Foreign / unbound / unregistered ⇒ envoyhome.object_not_bound.
 */
export function resolveObject(
  registry: ObjectRegistry,
  sourceId: string,
  callerAccountId: string,
): ResolvedObjectHandle {
  const rec = registry.get(sourceId);
  if (!rec || rec.accountId === null) {
    throw Object.assign(
      new Error(`envoyhome.object_not_bound: ${sourceId} unbound or unknown`),
      { code: "object_not_bound" },
    );
  }
  const allowed =
    rec.accountId === callerAccountId ||
    (rec.shared && !["lock", "alarm", "camera", "presence"].includes(rec.class));
  if (!allowed) {
    throw Object.assign(
      new Error(`envoyhome.object_not_bound: ${sourceId} not bound to ${callerAccountId}`),
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
