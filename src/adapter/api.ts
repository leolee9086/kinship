/** 前端唯一的数据契约。没有 Person/Family 专用 CRUD，也不暴露存储对象。 */
import type { ConceptMutation, ConceptSnapshot, GraphSettings, MediaInfo } from "../domain/concepts";

export interface DataAdapter {
  load(): Promise<ConceptSnapshot>;
  mutate(change: ConceptMutation): Promise<ConceptSnapshot>;
  saveSettings(settings: GraphSettings): Promise<GraphSettings>;
  upload(file: File): Promise<MediaInfo>;
  mediaInfo(id: string): Promise<MediaInfo>;
  mediaContent(id: string): Promise<Blob>;
  removeMedia(id: string): Promise<GraphSettings>;
}
export type Dispatch = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** 所有资源方法都变成请求，包括本地媒体：绝不由 UI 直接保存 Blob 或 URL。 */
export function createHttpAdapter(dispatch: Dispatch): DataAdapter {
  return {
    load: () => dispatch("GET", "/api/graph") as Promise<ConceptSnapshot>,
    mutate: change => dispatch("POST", "/api/concepts/mutations", change) as Promise<ConceptSnapshot>,
    saveSettings: settings => dispatch("PUT", "/api/settings", settings) as Promise<GraphSettings>,
    upload: file => {
      const form = new FormData(); form.set("file", file, file.name);
      return dispatch("POST", "/api/media", form) as Promise<MediaInfo>;
    },
    mediaInfo: id => dispatch("GET", `/api/media/${encodeURIComponent(id)}`) as Promise<MediaInfo>,
    mediaContent: id => dispatch("GET", `/api/media/${encodeURIComponent(id)}/content`) as Promise<Blob>,
    removeMedia: id => dispatch("DELETE", `/api/media/${encodeURIComponent(id)}`) as Promise<GraphSettings>,
  };
}
