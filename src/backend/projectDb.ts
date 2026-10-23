/** 目录只登记明确创建的项目，不扫描、迁移或重命名任何已有图谱库。 */
import type { Project, ProjectCommandResult, ProjectSnapshot } from "../contracts/projects";
import { newId } from "../domain/concepts";
export const PROJECT_STORES = ["projects", "state", "commands"];
export interface StoredProject extends Project { databaseName: string; seed: "demo" | "blank" }
export interface ProjectState { id: "catalog"; catalogId: string; revision: number; activeProjectId: string }
export interface SavedProjectCommand { id: string; fingerprint: string; result: ProjectCommandResult }
export interface ProjectStorageOptions { catalogName?: string; existingWorkspaceName?: string; namespace?: string; factory?: IDBFactory }
export function projectSnapshot(state: ProjectState, records: StoredProject[]): ProjectSnapshot {
  return { catalogId: state.catalogId, revision: state.revision, activeProjectId: state.activeProjectId,
    projects: records.map(({ databaseName: _databaseName, seed: _seed, ...project }) => project)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) };
}
export function openProjectCatalog(options: ProjectStorageOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = (options.factory ?? indexedDB).open(options.catalogName ?? "kinship-projects", 1);
    request.onupgradeneeded = () => {
      const db = request.result, projects = db.createObjectStore("projects", { keyPath: "id" });
      const state = db.createObjectStore("state", { keyPath: "id" }); db.createObjectStore("commands", { keyPath: "id" });
      const id = newId();
      projects.add({ id, name: "我的图谱", version: 1, createdAt: new Date().toISOString(),
        databaseName: options.existingWorkspaceName ?? "kinship-workspaces", seed: "demo" } satisfies StoredProject);
      state.add({ id: "catalog", catalogId: newId(), revision: 0, activeProjectId: id } satisfies ProjectState);
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error ?? new Error("无法打开项目目录"));
    request.onblocked = () => reject(new Error("项目目录被其他页面占用"));
  });
}
