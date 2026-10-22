/** IndexedDB 结构与创建入口。库内保存事实；模板只在新库事务中运行一次。 */
import type { ConceptRecord, Commit, PresentationRecord, ViewStateRecord } from "../contracts/commands";
import { newId, type StoredMedia } from "../domain/concepts";
import { splitSettings } from "../domain/presentationState";
import { initialSnapshot } from "../domain/ontology";
import { validateConcepts, validateSettings } from "../domain/validation";
import { ConceptIndex } from "../domain/conceptIndex";
import { validatePresentationReferences } from "../domain/presentationValidation";

export const STORES = { concepts: "concepts", state: "state", presentation: "presentation", viewState: "viewState",
  media: "media", identities: "identities", commands: "commands", events: "events" } as const;
export const WRITE_STORES = Object.values(STORES);
export interface WorkspaceState { id: "workspace"; workspaceId: string; actorId: string; revision: number }
export interface IdentityRecord { id: string; version: number; kind: "concept" | "media"; deleted: boolean }
export interface SavedCommand { actorId: string; commandId: string; fingerprint: string; commit: Commit }
export interface HistoryEntry { revision: number; commit: Commit; before: {
  concepts: ConceptRecord[]; presentation?: PresentationRecord; viewState?: ViewStateRecord; media: StoredMedia[];
} }
export type SharedPresentation = PresentationRecord & { id: "shared" };
export type ActorViewState = ViewStateRecord & { id: string };

export function openWorkspace(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const concepts = db.createObjectStore(STORES.concepts, { keyPath: "concept.id" });
      const state = db.createObjectStore(STORES.state, { keyPath: "id" });
      const presentation = db.createObjectStore(STORES.presentation, { keyPath: "id" });
      const viewState = db.createObjectStore(STORES.viewState, { keyPath: "id" });
      const identities = db.createObjectStore(STORES.identities, { keyPath: "id" });
      db.createObjectStore(STORES.media, { keyPath: "id" });
      db.createObjectStore(STORES.commands, { keyPath: ["actorId", "commandId"] });
      db.createObjectStore(STORES.events, { keyPath: "revision" }).createIndex("eventId", "commit.eventId", { unique: true });
      const initial = initialSnapshot();
      validateConcepts(initial.concepts); validateSettings(initial.settings);
      validatePresentationReferences(initial.settings, new ConceptIndex(initial.concepts));
      const actorId = newId(), workspaceId = newId(), parts = splitSettings(initial.settings);
      for (const concept of initial.concepts) {
        concepts.put({ concept, version: 1 } satisfies ConceptRecord);
        identities.put({ id: concept.id, kind: "concept", version: 1, deleted: false } satisfies IdentityRecord);
      }
      state.put({ id: "workspace", workspaceId, actorId, revision: 0 } satisfies WorkspaceState);
      presentation.put({ id: "shared", data: parts.presentation, version: 1 } satisfies SharedPresentation);
      viewState.put({ id: actorId, data: parts.viewState, version: 1 } satisfies ActorViewState);
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error ?? new Error("无法打开工作区数据库"));
    request.onblocked = () => reject(new Error("工作区数据库被其他页面占用"));
  });
}
