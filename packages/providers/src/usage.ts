export interface UsageCounters {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

export class UsageTracker {
  private readonly byAccount = new Map<string, UsageCounters>();

  record(accountId: string, promptTokens: number, completionTokens: number): void {
    const cur = this.byAccount.get(accountId) ?? { promptTokens: 0, completionTokens: 0, calls: 0 };
    cur.promptTokens += promptTokens;
    cur.completionTokens += completionTokens;
    cur.calls += 1;
    this.byAccount.set(accountId, cur);
  }

  get(accountId: string): UsageCounters {
    return this.byAccount.get(accountId) ?? { promptTokens: 0, completionTokens: 0, calls: 0 };
  }
}
