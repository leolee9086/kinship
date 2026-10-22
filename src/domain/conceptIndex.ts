/** 面向概念的内存查询索引。只索引语义，不访问存储，也不按屏幕区域推断关系。 */
import { C, type Concept } from "./concepts";

export class ConceptIndex {
  readonly byId = new Map<string, Concept>();
  readonly byParticipant = new Map<string, Concept[]>();
  readonly byRole = new Map<string, Concept[]>();
  readonly instances = new Map<string, Concept[]>();
  readonly subtypes = new Map<string, Concept[]>();
  private ancestry = new Map<string, Set<string>>();

  constructor(readonly concepts: readonly Concept[]) {
    for (const c of concepts) {
      if (this.byId.has(c.id)) throw new Error(`重复概念 UUID：${c.id}`);
      this.byId.set(c.id, c);
      for (const type of c.types) this.push(this.instances, type, c);
      for (const parent of c.broader ?? []) this.push(this.subtypes, parent, c);
      // 同一个参与者在多个槽位出现时，索引里只加入一次关系；槽位本身仍完整保留。
      for (const participant of new Set(c.participants?.map(p => p.concept))) this.push(this.byParticipant, participant, c);
      for (const role of new Set(c.participants?.map(p => p.role))) this.push(this.byRole, role, c);
    }
  }
  private push(map: Map<string, Concept[]>, id: string, c: Concept) {
    const list = map.get(id);
    if (list) list.push(c); else map.set(id, [c]);
  }
  get(id: string): Concept {
    const c = this.byId.get(id);
    if (!c) throw new Error(`不存在的概念：${id}`);
    return c;
  }
  ancestors(id: string): Set<string> {
    const old = this.ancestry.get(id);
    if (old) return old;
    const result = new Set<string>();
    const queue = [id];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (result.has(current)) continue;
      result.add(current);
      queue.push(...(this.byId.get(current)?.broader ?? []));
    }
    this.ancestry.set(id, result);
    return result;
  }
  descends(id: string, ancestor: string): boolean { return this.ancestors(id).has(ancestor); }
  isA(c: Concept | string, type: string): boolean {
    const concept = typeof c === "string" ? this.get(c) : c;
    return concept.types.some(t => this.descends(t, type));
  }
  relations(id: string): readonly Concept[] { return this.byParticipant.get(id) ?? []; }
  typeLabel(c: Concept): string { return c.types.map(id => this.get(id).label).join(" · "); }
  roleLabel(id: string): string { return this.get(id).label; }
  isType(c: Concept): boolean { return this.isA(c, C.type); }
  isRole(c: Concept): boolean { return this.isA(c, C.role); }
  hasRelationStructure(c: Concept): boolean { return c.participants !== undefined; }
}
