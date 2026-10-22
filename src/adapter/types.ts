/**
 * 数据适配器接口。
 *
 * 上层（React）只认这个接口，永远不知道数据来自 IndexedDB、
 * 内存，还是通过 sac-path-router 转发到 Rust 服务。
 *
 * 所有方法都是异步的 —— 既可能走本地派发，也可能走网络。
 */

import type { Person, Family, Event, Place, NodeId } from "../domain/types";

export interface Snapshot {
  persons: Person[];
  families: Family[];
  events: Event[];
  places: Place[];
}

export interface DataAdapter {
  load(): Promise<Snapshot>;

  createPerson(name: string, gender?: Person["gender"]): Promise<Person>;
  updatePerson(id: NodeId, patch: Partial<Person>): Promise<Person>;
  deletePerson(id: NodeId): Promise<void>;

  createFamily(input: Partial<Family>): Promise<Family>;
  updateFamily(id: NodeId, patch: Partial<Family>): Promise<Family>;
  deleteFamily(id: NodeId): Promise<void>;

  /** 把新人作为焦点人物的孩子。找不到合适的家庭就新建一个。 */
  ensureFamilyForChild(focusId: NodeId, childId: NodeId): Promise<Family>;
  /** 把新人作为焦点人物的父母。 */
  ensureFamilyForParent(focusId: NodeId, parentId: NodeId): Promise<Family>;
  /** 把新人和焦点人物结为配偶。 */
  ensureFamilyForSpouse(focusId: NodeId, spouseId: NodeId): Promise<Family>;

  createEvent(input: Partial<Event>): Promise<Event>;
  updateEvent(id: NodeId, patch: Partial<Event>): Promise<Event>;
  deleteEvent(id: NodeId): Promise<void>;

  createPlace(input: Partial<Place>): Promise<Place>;
  updatePlace(id: NodeId, patch: Partial<Place>): Promise<Place>;
  deletePlace(id: NodeId): Promise<void>;

  /** 种子数据导入：第一次启动时把示例家谱灌进来。 */
  seed(snapshot: Snapshot): Promise<void>;
}
