/** 存储后端契约。只有路由层能调用它，前端只接触 DataAdapter。 */
import type { ConceptMutation, ConceptSnapshot, GraphSettings, MediaInfo, StoredMedia } from "../domain/concepts";
export interface GraphRepository {
  load(): Promise<ConceptSnapshot>;
  mutate(input: ConceptMutation): Promise<ConceptSnapshot>;
  saveSettings(input: GraphSettings): Promise<GraphSettings>;
  upload(file: Blob, name: string): Promise<MediaInfo>;
  media(id: string): Promise<StoredMedia>;
  removeMedia(id: string): Promise<GraphSettings>;
  close(): Promise<void>;
}
export const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif", "video/mp4", "video/webm", "video/ogg"]);
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
