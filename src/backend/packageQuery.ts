/** 从一个一致的仓库快照导出，复用主事实源；摘要计算发生在数据库读事务结束后。 */
import type { Request } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { exportGraphPackage } from "../format/exportGraphPackage";
import type { GraphRepository } from "./repository";

export async function queryGraphPackage(repository: GraphRepository, input: Request<"exportGraph">) {
  // 当前 bootstrap 仍为全量查询；有界依赖游标查询接入后只替换这一取数步骤。
  const snapshot = await repository.bootstrap();
  if (snapshot.workspaceId !== input.workspaceId) fail("NOT_FOUND", "目标工作区不存在");
  const context = { workspaceId: snapshot.workspaceId, revision: snapshot.revision };
  const result = await exportGraphPackage(snapshot.concepts, context, input.params, input.params.maxBytes);
  return { result, ...context };
}
