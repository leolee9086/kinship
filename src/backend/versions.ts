/** 所有资源使用同一乐观版本错误形状，不将空间提交序号充当资源锁。 */
import { fail } from "../contracts/errors";
export function checkVersion(id: string, expected: number, actual: number | null): void {
  if (expected !== actual) fail("VERSION_CONFLICT", "资源已被其他提交修改，请读取最新版本后处理冲突", { id, expectedVersion: expected, actualVersion: actual });
}
