// Ring-buffer daemon log. home.getDaemonLog (loopback-owner) reads this.
// Default verbosity excludes object state / entity names / secrets (Design §5.7.4).

export type LogLevel = "info" | "warn" | "error";

export interface LogLine {
  at: string;
  level: LogLevel;
  message: string;
}

const MAX_LINES = 2_000;

export class DaemonLogger {
  private readonly lines: LogLine[] = [];

  log(level: LogLevel, message: string): void {
    this.lines.push({ at: new Date().toISOString(), level, message });
    if (this.lines.length > MAX_LINES) this.lines.shift();
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(`[envoyhome] ${level}: ${message}`);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }

  tail(tailLines = 200, minLevel: LogLevel = "info"): LogLine[] {
    const rank: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };
    const min = rank[minLevel];
    return this.lines.filter((l) => rank[l.level] >= min).slice(-Math.max(1, tailLines));
  }
}
