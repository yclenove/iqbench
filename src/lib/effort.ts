export const EFFORTS = ["max", "xhigh", "high", "medium", "low", "minimal", "none"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_LABEL: Record<Effort, string> = {
  max: "max",
  xhigh: "xhigh",
  high: "high",
  medium: "medium",
  low: "low",
  minimal: "minimal",
  none: "不传",
};

const SLOT = /^(.*)@(max|xhigh|high|medium|low|minimal|none)$/i;
const ALIAS =
  /[-_./](max|xhigh|high|medium|mid|low|minimal)(?:[-_.](?:thinking|think|reasoning))?$/i;

export function isEffort(s: string): s is Effort {
  return (EFFORTS as readonly string[]).includes(s);
}

/** 渠道自己的 high/low 别名，级别已经写在模型名里，不要再传 reasoning。 */
export function isEffortAlias(id: string) {
  const base = id.split("/").pop() || id;
  if (SLOT.test(base)) return false;
  return ALIAS.test(base);
}

export function parseSlot(id: string): { model: string; effort: Effort } {
  const m = id.trim().match(SLOT);
  if (m) return { model: m[1], effort: m[2].toLowerCase() as Effort };
  if (isEffortAlias(id)) return { model: id, effort: "none" };
  return { model: id, effort: "xhigh" };
}

export function slotId(model: string, effort: Effort) {
  const bare = parseSlot(model).model;
  return `${bare}@${effort}`;
}

export function expandQueue(models: string[], map: Record<string, Effort[]>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    if (isEffortAlias(m)) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
      continue;
    }
    const es = (map[m]?.length ? map[m] : (["xhigh"] as Effort[])).slice().sort(
      (a, b) => EFFORTS.indexOf(a) - EFFORTS.indexOf(b),
    );
    for (const e of es) {
      const id = slotId(m, e);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function expandSlots(models: string[], efforts: Effort[]) {
  const map = Object.fromEntries(models.map((m) => [m, efforts]));
  return expandQueue(models, map);
}

export function effortRank(id: string) {
  if (isEffortAlias(id)) return 90;
  return EFFORTS.indexOf(parseSlot(id).effort);
}
