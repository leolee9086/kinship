/** 项目元数据及重放结果同一事务保存；工作区事实另由各自GraphRepository管理。 */
import type { ProjectCommand, ProjectCommandResult, ProjectSnapshot } from "../contracts/projects";
import { ProjectCommandRequestSchema, ProjectCommandResultSchema } from "../contracts/projects";
import { parse } from "../contracts/validate";
import { fail } from "../contracts/errors";
import { sha256 } from "../format/digest";
import { canonicalJSON } from "../format/json";
import { openProjectCatalog, projectSnapshot, PROJECT_STORES, type ProjectStorageOptions, type ProjectState, type StoredProject, type SavedProjectCommand } from "./projectDb";
export class ProjectRepository {
  private readonly opening: Promise<IDBDatabase>;
  constructor(private readonly options: ProjectStorageOptions = {}) { this.opening = openProjectCatalog(options); }
  async list(): Promise<ProjectSnapshot> {
    const db = await this.opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "state"], "readonly"), records = tx.objectStore("projects").getAll(), state = tx.objectStore("state").get("catalog");
      tx.oncomplete = () => resolve(projectSnapshot(state.result as ProjectState, records.result as StoredProject[]));
      tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  }
  async workspace(id: string): Promise<StoredProject> {
    const db = await this.opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readonly"), request = tx.objectStore("projects").get(id);
      tx.oncomplete = () => { try { if (!request.result) fail("NOT_FOUND", "项目不存在"); resolve(request.result as StoredProject); } catch (error) { reject(error); } };
      tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  }
  async apply(source: ProjectCommand): Promise<ProjectCommandResult> {
    const input = parse(ProjectCommandRequestSchema, source);
    const fingerprint = await sha256(canonicalJSON({ catalogId: input.catalogId, params: input.params })), db = await this.opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORES, "readwrite", { durability: "strict" });
      const state = tx.objectStore("state").get("catalog"), records = tx.objectStore("projects").getAll(), saved = tx.objectStore("commands").get(input.commandId);
      let remaining = 3, result: ProjectCommandResult, cause: unknown;
      const finish = () => { if (--remaining) return; try {
        const current = state.result as ProjectState, projects = records.result as StoredProject[], previous = saved.result as SavedProjectCommand | undefined;
        if (current.catalogId !== input.catalogId) fail("NOT_FOUND", "项目目录不存在");
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail("IDEMPOTENCY_KEY_REUSED", "同一命令ID不能用于其他项目操作");
          result = { ...previous.result, replayed: true }; return;
        }
        const op = input.params, project = projects.find(item => item.id === op.id);
        let changed = false;
        if (op.type === "project.create") {
          if (project) fail("VERSION_CONFLICT", "项目UUID已存在");
          if (projects.length >= 1000) fail("PAYLOAD_TOO_LARGE", "项目数量达到当前1000个上限");
          if (!op.name.trim()) fail("INVALID_REQUEST", "项目名称不能为空");
          const created: StoredProject = { id: op.id, name: op.name.trim(), version: 1, createdAt: new Date().toISOString(),
            databaseName: `${this.options.namespace ?? "kinship"}-project-${op.id}`, seed: "blank" };
          projects.push(created); tx.objectStore("projects").add(created); current.activeProjectId = op.id; changed = true;
        } else {
          if (!project) fail("NOT_FOUND", "项目不存在");
          if (op.type === "project.rename") {
            if (project.version !== op.expectedVersion) fail("VERSION_CONFLICT", "项目名称已被修改，请重新加载");
            if (!op.name.trim()) fail("INVALID_REQUEST", "项目名称不能为空");
            if (project.name !== op.name.trim()) { project.name = op.name.trim(); project.version++; tx.objectStore("projects").put(project); changed = true; }
          } else if (current.activeProjectId !== project.id) { current.activeProjectId = project.id; changed = true; }
        }
        if (changed) { current.revision++; tx.objectStore("state").put(current); }
        result = parse(ProjectCommandResultSchema, { snapshot: projectSnapshot(current, projects), commandId: input.commandId, replayed: false }, "INTERNAL_ERROR");
        tx.objectStore("commands").add({ id: input.commandId, fingerprint, result } satisfies SavedProjectCommand);
      } catch (error) { cause = error; tx.abort(); } };
      state.onsuccess = finish; records.onsuccess = finish; saved.onsuccess = finish;
      tx.oncomplete = () => resolve(result); tx.onerror = () => { cause ??= tx.error; }; tx.onabort = () => reject(cause ?? tx.error);
    });
  }
  async close() { (await this.opening).close(); }
}
