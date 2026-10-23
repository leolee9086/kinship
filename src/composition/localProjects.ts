/** 本地装配按固定项目ID创建适配器，活动项目变化不会重定向已有写请求。 */
import { ProjectRepository } from "../backend/projectRepository";
import { buildProjectRouter } from "../backend/projectRoutes";
import { IndexedDbRepository } from "../backend/indexeddb";
import { buildDataRouter } from "../backend/routes";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { createHttpAdapter } from "../adapter/api";
import { createProjectAdapter } from "../adapter/projects";
import type { ProjectStorageOptions } from "../backend/projectDb";
interface LocalSession { adapter: ReturnType<typeof createHttpAdapter>; repository: IndexedDbRepository }
export function createLocalProjects(options: ProjectStorageOptions = {}) {
  const catalog = new ProjectRepository(options), sessions = new Map<string, Promise<LocalSession>>();
  const adapter = createProjectAdapter(createInternalDispatch(buildProjectRouter(catalog)), async id => {
    let opening = sessions.get(id);
    if (!opening) {
      // Promise先登记，React严格模式的并发打开也只创建一个数据库连接。
      opening = (async () => {
        const project = await catalog.workspace(id);
        const repository = new IndexedDbRepository(project.databaseName, options.factory ?? indexedDB, "administrator", project.seed);
        return { repository, adapter: createHttpAdapter(createInternalDispatch(buildDataRouter(repository))) };
      })();
      sessions.set(id, opening);
    }
    try { return (await opening).adapter; }
    catch (error) { sessions.delete(id); throw error; }
  });
  return { adapter, close: async () => { for (const opening of sessions.values()) await (await opening).repository.close(); await catalog.close(); } };
}
