/** 只有内核直接依赖的语义根不可删除；模板中的人物、亲属、事件等分类均为普通数据。 */
import { C } from "./concepts";
export const coreVocabulary: ReadonlySet<string> = new Set([C.concept, C.type, C.role, C.relation, C.participant]);
