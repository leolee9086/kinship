/** 导出包的来源修订必须与RPC一致性上下文吻合；摘要校验不能只信服务端声明。 */
import type { GraphPackage } from "../contracts/graphPackage";
import { fail } from "../contracts/errors";
import { readGraphPackage } from "../format/graphPackage";

export async function verifyPackageResponse(value: GraphPackage, context: { workspaceId: string; revision: number }): Promise<void> {
  if (value.source.workspaceId !== context.workspaceId || value.source.revision !== context.revision)
    fail("INTERNAL_ERROR", "图谱包的来源快照与响应上下文不一致");
  try { await readGraphPackage(value); }
  catch { fail("INTERNAL_ERROR", "图谱包未通过身份、引用或内容摘要校验"); }
}
