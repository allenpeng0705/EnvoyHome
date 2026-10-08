/** B14 smart-home screen — bound to home.listSources / setSourceBinding RPCs. */

export interface SmarthomeViewProps {
  sources: Array<{ sourceId: string; bound: boolean; class: string }>;
  note?: string;
}

export function SmarthomeView(props: SmarthomeViewProps): string {
  const bound = props.sources.filter((s) => s.bound).length;
  const unbound = props.sources.length - bound;
  return `Smart home: ${bound} bound, ${unbound} unbound${props.note ? ` — ${props.note}` : ""}`;
}
