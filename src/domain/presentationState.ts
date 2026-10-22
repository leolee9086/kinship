/** 界面组合状态与持久化资源的映射；共享定义不包含个人焦点。 */
import type { Static } from "@sinclair/typebox";
import type { PresentationSchema, ViewStateSchema } from "../contracts/presentation";
import type { GraphSettings } from "./concepts";

export type PresentationData = Static<typeof PresentationSchema>;
export type ViewStateData = Static<typeof ViewStateSchema>;
export function splitSettings(settings: GraphSettings): { presentation: PresentationData; viewState: ViewStateData } {
  const { views, perspective, ...style } = settings;
  return {
    presentation: { views, presets: perspective.presets },
    viewState: { ...style, presetId: perspective.presetId, overrides: perspective.overrides },
  };
}
export function combineSettings(presentation: PresentationData, value: ViewStateData): GraphSettings {
  const { presetId, overrides, ...style } = value;
  return { ...style, views: presentation.views, perspective: { presetId, overrides, presets: presentation.presets } };
}
