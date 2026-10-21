// Design §19.12 D2 — Owner opt-in for image_generate (fail-closed default off).
// Design-max Adapt (2026-10-20p) — async jobs under media-generate-jobs.json.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HomePaths } from "./home-paths.js";

/** Default daily cap when Owner enables generate (cost / bill shock). */
export const MEDIA_GENERATE_DEFAULT_DAILY_CAP = 20;

export interface MediaGenerateState {
  /** Owner must enable before image_generate may run. Default false. */
  enabled: boolean;
  /** Max successful generates per UTC day (V-P2-MEDIA-2). */
  maxPerDay: number;
  /** Successful generates counted for `dayKey` (UTC YYYY-MM-DD). */
  dayKey?: string;
  dayCount?: number;
}

export type MediaGenerateJobStatus = "pending" | "done" | "error";

export interface MediaGenerateJob {
  jobId: string;
  accountId: string;
  status: MediaGenerateJobStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  path?: string;
  mimeType?: string;
  error?: string;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export class MediaGenerateStore {
  constructor(private readonly paths: HomePaths) {}

  private pathFor(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "media-generate.json");
  }

  private jobsPathFor(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "media-generate-jobs.json");
  }

  private async readJobs(accountId: string): Promise<MediaGenerateJob[]> {
    try {
      const raw = JSON.parse(await readFile(this.jobsPathFor(accountId), "utf8")) as {
        jobs?: MediaGenerateJob[];
      };
      return Array.isArray(raw.jobs) ? raw.jobs : [];
    } catch {
      return [];
    }
  }

  private async writeJobs(accountId: string, jobs: MediaGenerateJob[]): Promise<void> {
    const path = this.jobsPathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    // Cap retained jobs to keep file small.
    const trimmed = jobs.slice(-40);
    await writeFile(path, JSON.stringify({ jobs: trimmed }, null, 2), "utf8");
  }

  async createJob(accountId: string, prompt: string): Promise<MediaGenerateJob> {
    const now = new Date().toISOString();
    const job: MediaGenerateJob = {
      jobId: `mg-${randomUUID().slice(0, 12)}`,
      accountId,
      status: "pending",
      prompt: prompt.slice(0, 2000),
      createdAt: now,
      updatedAt: now,
    };
    const jobs = await this.readJobs(accountId);
    jobs.push(job);
    await this.writeJobs(accountId, jobs);
    return job;
  }

  async getJob(accountId: string, jobId: string): Promise<MediaGenerateJob | null> {
    const jobs = await this.readJobs(accountId);
    return jobs.find((j) => j.jobId === jobId) ?? null;
  }

  async updateJob(
    accountId: string,
    jobId: string,
    patch: Partial<Pick<MediaGenerateJob, "status" | "path" | "mimeType" | "error">>,
  ): Promise<MediaGenerateJob | null> {
    const jobs = await this.readJobs(accountId);
    const idx = jobs.findIndex((j) => j.jobId === jobId);
    if (idx < 0) return null;
    const cur = jobs[idx]!;
    const next: MediaGenerateJob = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    jobs[idx] = next;
    await this.writeJobs(accountId, jobs);
    return next;
  }

  async get(accountId: string): Promise<MediaGenerateState> {
    try {
      const raw = JSON.parse(await readFile(this.pathFor(accountId), "utf8")) as MediaGenerateState;
      return {
        enabled: Boolean(raw.enabled),
        maxPerDay:
          typeof raw.maxPerDay === "number" && raw.maxPerDay > 0
            ? Math.min(200, Math.floor(raw.maxPerDay))
            : MEDIA_GENERATE_DEFAULT_DAILY_CAP,
        ...(typeof raw.dayKey === "string" ? { dayKey: raw.dayKey } : {}),
        ...(typeof raw.dayCount === "number" ? { dayCount: raw.dayCount } : {}),
      };
    } catch {
      return { enabled: false, maxPerDay: MEDIA_GENERATE_DEFAULT_DAILY_CAP };
    }
  }

  async set(
    accountId: string,
    state: Partial<MediaGenerateState> & { enabled?: boolean },
  ): Promise<MediaGenerateState> {
    const cur = await this.get(accountId);
    const path = this.pathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    const next: MediaGenerateState = {
      enabled: state.enabled !== undefined ? Boolean(state.enabled) : cur.enabled,
      maxPerDay:
        typeof state.maxPerDay === "number" && state.maxPerDay > 0
          ? Math.min(200, Math.floor(state.maxPerDay))
          : cur.maxPerDay,
      ...(cur.dayKey ? { dayKey: cur.dayKey } : {}),
      ...(cur.dayCount !== undefined ? { dayCount: cur.dayCount } : {}),
    };
    await writeFile(path, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  /** Fail closed when over daily cap; otherwise bump and persist. */
  async consumeQuota(accountId: string): Promise<MediaGenerateState> {
    const cur = await this.get(accountId);
    const today = utcDayKey();
    const count = cur.dayKey === today ? (cur.dayCount ?? 0) : 0;
    if (count >= cur.maxPerDay) {
      throw new Error(
        `envoyhome.rate_limited: image_generate daily cap (${cur.maxPerDay}) reached`,
      );
    }
    const next: MediaGenerateState = {
      enabled: cur.enabled,
      maxPerDay: cur.maxPerDay,
      dayKey: today,
      dayCount: count + 1,
    };
    const path = this.pathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}
