/** 概念库只读目录：预计算检索文本、分类和字母顺序，避免每次按键重新排序全库。 */
import type { Concept, PerspectiveSettings } from "./concepts";
import type { ConceptIndex } from "./conceptIndex";
import { displayMode } from "./perspectives";

export type CatalogCategory = "instances" | "types" | "roles";
export type CatalogLifecycle = "active" | "forgotten" | "all";
interface CatalogEntry { concept: Concept; category: CatalogCategory; text: string }
type Groups = Record<CatalogCategory, CatalogEntry[]>;
const emptyGroups = (): Groups => ({ instances: [], types: [], roles: [] });
const searchable = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

export class ConceptCatalog {
  private readonly entries: CatalogEntry[];
  private readonly ranked = new WeakMap<PerspectiveSettings, Groups>();

  constructor(private readonly index: ConceptIndex) {
    const collator = new Intl.Collator("zh", { numeric: true, sensitivity: "base" });
    this.entries = index.concepts.map(concept => ({
      concept,
      category: index.isType(concept) ? "types" as const : index.isRole(concept) ? "roles" as const : "instances" as const,
      text: searchable([concept.label, concept.description ?? "", ...(concept.aliases ?? []), index.typeLabel(concept)].join(" ")),
    })).sort((a, b) => collator.compare(a.concept.label, b.concept.label) || a.concept.id.localeCompare(b.concept.id));
  }

  /** 视角变化才重新分主轴组；同类型组合只解析一次继承，不在比较器里遍历层级。 */
  private groups(perspective: PerspectiveSettings): Groups {
    const cached = this.ranked.get(perspective);
    if (cached) return cached;
    const primary = emptyGroups(), rest = emptyGroups(), modes = new Map<string, boolean>();
    for (const entry of this.entries) {
      const c = entry.concept, scope = c.participants ? "relations" : "concepts";
      const signature = `${scope}:${[...c.types].sort().join(",")}`;
      let main = modes.get(signature);
      if (main === undefined) {
        main = displayMode(this.index, c, scope, perspective) === "main";
        modes.set(signature, main);
      }
      (main ? primary : rest)[entry.category].push(entry);
    }
    const result: Groups = {
      instances: primary.instances.concat(rest.instances),
      types: primary.types.concat(rest.types),
      roles: primary.roles.concat(rest.roles),
    };
    this.ranked.set(perspective, result);
    return result;
  }

  search(category: CatalogCategory, query: string, perspective: PerspectiveSettings, lifecycle: CatalogLifecycle = "active"): Concept[] {
    const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
    return this.groups(perspective)[category].filter(entry =>
      (lifecycle === "all" || (entry.concept.forgotten === true) === (lifecycle === "forgotten"))
      && terms.every(term => entry.text.includes(term))).map(entry => entry.concept);
  }
}
