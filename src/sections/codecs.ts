/** 存储侧的完整 CRDT codec 注册。视图实现不进入领域或后端依赖。 */
import type { CrdtCodec } from "./adapter";
import { yjsTextCodec } from "./adapters/yjsTextCodec";
const codecs = new Map<string, CrdtCodec>([["text/plain", yjsTextCodec]]);
export function crdtCodec(contentType: string): CrdtCodec {
  const codec = codecs.get(contentType);
  if (!codec) throw new Error(`未注册此内容类型的完整 CRDT：${contentType}`);
  return codec;
}
