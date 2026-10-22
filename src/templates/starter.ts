/** 新工作区的显式模板入口。数据只在创建时写进数据库，不参与已保存配置的读取。 */
import template from "./starter-presentation.json";
import { readPresentation } from "../format/presentation";
import type { GraphSettings } from "../domain/concepts";

export function starterSettings(): GraphSettings {
  const presentation = readPresentation(template);
  return {
    viewId: presentation.viewId, views: presentation.views, perspective: presentation.perspective,
    focusId: null, depth: 2,
    regionGaps: { up: 100, down: 100, left: 100, right: 100 },
    colorAxis: "relation", colorDepth: 2, palette: {}, dimOpacity: 0.055,
    curve: { type: "bezier", curvature: 0.52 },
    showRelationLabels: true, expandedRelations: [], regionOverrides: {},
    background: { mediaId: null, opacity: 0.28, blur: 0, paused: false },
  };
}
