/**
 * 族谱领域模型。
 *
 * 设计要点：
 * 1. 亲子通过 Family 节点表达 —— 只存「父-子」「母-子」两条边会丢失
 *    「这对父母是一对夫妻」这个信息，而它恰恰是族谱里最常被问的。
 * 2. 日期是区间 + 精度 + 原文，不是单值。家谱里的时间大多不精确，
 *    强求确定日期就是在逼人编数据。
 * 3. 姓名一人多值，可指定主名。
 * 4. 缺失是常态，任何字段都可为空 —— 界面上显示为 ?，而不是空白或报错。
 * 5. 事件与地点是一等实体，人物只是参与者。
 */

export type NodeId = string;

export type DatePrecision = "day" | "month" | "year" | "century" | "unknown";

export interface DateSpec {
  kind: "exact" | "range" | "approx" | "before" | "after" | "unknown";
  from?: string;
  to?: string;
  precision: DatePrecision;
  raw?: string;
}

export interface PersonName {
  surname?: string;
  given?: string;
  type?: string;
  primary?: boolean;
}

export type Gender = "M" | "F" | "U" | "X";

export interface Person {
  id: NodeId;
  /** Gramps 里的人类可读编号，导入数据时保留，本地新建为空。 */
  grampsId?: string;
  names: PersonName[];
  gender: Gender;
  note?: string;
  /** 是谁的孩子 / 是谁的父母，指向 family。 */
  childOf?: NodeId[];
  parentIn?: NodeId[];
  eventRefs?: NodeId[];
}

/**
 * 家庭：一对父母 + 他们的孩子。
 *
 * 这是亲子关系的载体。father 或 mother 可以为空（单亲、父不详），
 * 孩子可以为空（尚未生育或未婚）。
 */
export interface Family {
  id: NodeId;
  father?: NodeId | null;
  mother?: NodeId | null;
  children: NodeId[];
  eventRefs?: NodeId[];
}

/** 事件：出生、死亡、结婚、迁居…… 地点与时间是它的属性。 */
export interface Event {
  id: NodeId;
  type: string;
  date?: DateSpec;
  place?: NodeId | null;
  description?: string;
}

/** 地点：可层级（县属市、市属省）。 */
export interface Place {
  id: NodeId;
  title: string;
  parent?: NodeId | null;
}

export function displayName(p: Person): string {
  if (!p.names?.length) return "(无名)";
  const primary = p.names.find((n) => n.primary) ?? p.names[0];
  const s = primary.surname ?? "";
  const g = primary.given ?? "";
  if (!s && !g) return "(无名)";
  return `${s} ${g}`.trim();
}

export function displayDate(d?: DateSpec): string {
  if (!d || d.kind === "unknown") return "?";
  if (d.raw) return d.raw;
  const a = d.from ?? "?";
  const b = d.to;
  if (d.kind === "range" && b) return `${a.slice(0, 4)}–${b.slice(0, 4)}`;
  if (d.kind === "approx") return `约 ${a.slice(0, 4)}`;
  if (d.kind === "before") return `<${a.slice(0, 4)}`;
  if (d.kind === "after") return `>${a.slice(0, 4)}`;
  return a.slice(0, 4) || "?";
}

export function emptyDate(): DateSpec {
  return { kind: "unknown", precision: "unknown" };
}

/** 取某人某类事件的年份，用于节点上显示生卒。 */
export function yearOf(events: Event[], refs: NodeId[] | undefined, type: string): string {
  if (!refs?.length) return "?";
  for (const id of refs) {
    const e = events.find((x) => x.id === id);
    if (e && e.type?.toLowerCase() === type.toLowerCase()) {
      return displayDate(e.date);
    }
  }
  return "?";
}
