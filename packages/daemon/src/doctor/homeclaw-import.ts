// HomeClaw → EnvoyHome dry-run planner (Design Appendix B).

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DoctorIssue } from "./issues.js";
import { DOCTOR_MIGRATE_HOMECLAW_PLAN_ID } from "./issues.js";

export interface HomeClawMigratePlan {
  homeClawRoot: string;
  targetStateDir: string;
  copies: Array<{ from: string; to: string; kind: string }>;
  absent: string[];
  importChat: boolean;
  skippedPolicy: string[];
}

export interface HomeClawPlanOptions {
  homeClawRoot?: string;
  targetStateDir: string;
  importChat?: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dry-run only — never writes. Surfaces absent Appendix B sources explicitly.
 */
export async function planHomeClawMigrate(
  options: HomeClawPlanOptions,
): Promise<HomeClawMigratePlan | null> {
  const root = options.homeClawRoot ?? process.env["ENVOYHOME_HOMECLAW_ROOT"];
  if (!root) return null;

  const copies: HomeClawMigratePlan["copies"] = [];
  const absent: string[] = [];

  const usersJson = join(root, "database", "users.json");
  const userYml = join(root, "config", "user.yml");
  if (await exists(usersJson)) {
    copies.push({ from: usersJson, to: join(options.targetStateDir, "accounts"), kind: "users" });
  } else if (await exists(userYml)) {
    copies.push({ from: userYml, to: join(options.targetStateDir, "accounts"), kind: "users-fallback" });
  } else {
    absent.push("database/users.json", "config/user.yml");
  }

  const profilesDir = join(root, "database", "profiles");
  if (await exists(profilesDir)) {
    copies.push({
      from: profilesDir,
      to: join(options.targetStateDir, "accounts"),
      kind: "profiles",
    });
  } else {
    absent.push("database/profiles/");
  }

  let homeclawRoot = root;
  try {
    const coreYml = await readFile(join(root, "config", "core.yml"), "utf8");
    const m = coreYml.match(/homeclaw_root:\s*['"]?([^'"\n]+)/);
    if (m?.[1]) homeclawRoot = m[1].trim();
  } catch {
    absent.push("config/core.yml (homeclaw_root)");
  }

  const shareSrc = join(homeclawRoot, "share");
  if (await exists(shareSrc)) {
    copies.push({ from: shareSrc, to: join(options.targetStateDir, "share"), kind: "share" });
  } else {
    absent.push("homeclaw_root/share/");
  }

  const skillsDir = join(root, "skills");
  if (await exists(skillsDir)) {
    copies.push({ from: skillsDir, to: join(options.targetStateDir, "skills"), kind: "skills" });
  } else {
    absent.push("skills/");
  }

  const chatDb = join(root, "database", "chats.db");
  const importChat = options.importChat === true;
  if (importChat) {
    if (await exists(chatDb)) {
      copies.push({
        from: chatDb,
        to: join(options.targetStateDir, "accounts"),
        kind: "chat-db",
      });
    } else {
      absent.push("database/chats.db");
    }
  }

  return {
    homeClawRoot: root,
    targetStateDir: options.targetStateDir,
    copies,
    absent,
    importChat,
    skippedPolicy: [
      "HomeClaw allow_all tool posture (not imported)",
      "in-memory approval defaults (not imported)",
      "CORE_API_KEY / channel tokens (prompt re-enter)",
    ],
  };
}

export function doctorHomeClawPlanIssue(plan: HomeClawMigratePlan): DoctorIssue {
  const lines = [
    `HomeClaw migrate dry-run (${plan.copies.length} planned copies, ${plan.absent.length} absent sources)`,
    ...plan.copies.map((c) => `  copy ${c.kind}: ${c.from} → ${c.to}`),
    ...(plan.absent.length > 0 ? [`  absent: ${plan.absent.join(", ")}`] : []),
    ...(plan.importChat ? [] : ["  chat import: skipped (opt-in --import-chat)"]),
    ...plan.skippedPolicy.map((s) => `  policy: ${s}`),
  ];
  return {
    id: DOCTOR_MIGRATE_HOMECLAW_PLAN_ID,
    severity: "info",
    message: lines.join("\n"),
    fixable: false,
  };
}
