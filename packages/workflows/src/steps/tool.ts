/** Tool step — side effects go through the caller's policy gate (Design §4.3). */
export type ToolStep = {
  type: "tool";
  name: string;
  args?: Record<string, unknown>;
  [k: string]: unknown;
};
