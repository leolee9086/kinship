/** 仅供测试定位起始模板；业务 UUID 以 JSON 为准，不由内核列举或参与运行时判断。 */
import vocabulary from "../templates/starter-vocabulary.json";
import presentation from "../templates/starter-presentation.json";
import { C as core } from "../domain/concepts";
function concept(label: string, role = false): string {
  const found = vocabulary.concepts.find(item => item.label === label && item.types.includes(role ? core.role : core.type));
  if (!found) throw new Error(`测试模板缺少概念：${label}`);
  return found.id;
}
function preset(label: string): string {
  const found = presentation.perspective.presets.find(item => item.label === label);
  if (!found) throw new Error(`测试模板缺少视角：${label}`);
  return found.id;
}
export const C = { ...core,
  person: concept("人物"), place: concept("地点"), kinship: concept("亲属关系"), social: concept("社会关系"),
  participation: concept("参与事件"), location: concept("发生于"), colleague: concept("同僚"), association: concept("关联"),
  subject: concept("主体", true), object: concept("关联对象", true),
};
export const P = { genealogy: preset("族谱"), work: preset("协作"), events: preset("事件"), all: preset("全部关系") };
