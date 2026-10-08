// Doctor issue registry — extensible categories (Plan B13).

export type DoctorSeverity = "info" | "warn" | "error";

export interface DoctorIssue {
  id: string;
  severity: DoctorSeverity;
  message: string;
  fixable: boolean;
}

export const DOCTOR_MIGRATE_HOMECLAW_PLAN_ID = "migrate.homeclaw.plan";
