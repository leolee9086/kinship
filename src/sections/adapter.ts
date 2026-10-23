/** 区段适配器的边界。whole-file 只看文本文件及文章内序号，不引入主体类型。 */
export interface TextFile {
  read(): Promise<string>;
  write(text: string): Promise<void>;
  /** 通知的是整个文件的新文本；版本、UUID、权限和冲突由文件实现隐藏。 */
  watch(changed: (text: string) => void): () => void;
}
export interface MountedAdapter {
  destroy(): void;
  setOrdinal(ordinal: number): void;
  /** DOM生命周期守卫：同步完成才允许卸载；不返回内容、版本或编辑器对象。 */
  prepareUnmount(): Promise<boolean>;
}
export interface WholeFileAdapter {
  readonly mode: "whole-file";
  readonly contentType: string;
  mount(element: HTMLElement, file: TextFile, ordinal: number): MountedAdapter;
}
/** CRDT 协议由适配器完整实现；主体仅提供不透明二进制同步与耐久确认。 */
export interface CrdtFile {
  load(): Promise<Uint8Array>;
  publish(update: Uint8Array): Promise<void>;
  watch(changed: (update: Uint8Array) => void): () => void;
}
/** CRDT 适配器注册的纯数据投影；不把具体共享类型或视图引擎带入主体。 */
export interface CrdtCodec {
  initialize(text: string): Uint8Array;
  merge(state: Uint8Array, update: Uint8Array): { state: Uint8Array; text: string };
  text(state: Uint8Array): string;
}
export interface CrdtAdapter {
  readonly mode: "crdt";
  readonly contentType: string;
  readonly codec: CrdtCodec;
  mount(element: HTMLElement, file: CrdtFile, ordinal: number): MountedAdapter;
}
/** 没有局部文本补丁能力字段，也没有一半 CRDT 的第三种声明。 */
export type BlockAdapter = WholeFileAdapter | CrdtAdapter;
