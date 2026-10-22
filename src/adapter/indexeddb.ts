/**
 * IndexedDB 存储实现。
 *
 * 为什么现在就用 IndexedDB 而不是内存 Map：
 * 刷新不丢数据；而且它的异步形态与将来打远程服务完全一致。
 *
 * 注意一个 IndexedDB 的经典陷阱：事务在跨 await 的微任务后会“办完”，
 * 之后再拿它发请求会 InvalidStateError。所以这里每个操作都只依赖
 * “单个 request 的 onsuccess”，不靠“事务 oncomplete 时再去读结果”。
 */

import type { Person, Family, Event, Place, NodeId } from "../domain/types";
import type { Snapshot } from "./types";

const DB_NAME = "kinship";
const DB_VERSION = 2;
const S_PERSONS = "persons";
const S_FAMILIES = "families";
const S_EVENTS = "events";
const S_PLACES = "places";
const ALL = [S_PERSONS, S_FAMILIES, S_EVENTS, S_PLACES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ALL) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** 读一个 store 的全部记录。 */
async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** 读单条。 */
async function readOne<T>(store: string, id: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 写入一批记录，返回一个 request。
 * 调用方拿到 onsuccess 就说明写已落到事务里。
 */
async function writeAll(store: string, items: unknown[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    let pending = items.length;
    let failed = false;
    for (const it of items) {
      const req = os.put(it);
      req.onsuccess = () => {
        pending--;
        if (pending === 0 && !failed) resolve();
      };
      req.onerror = () => {
        failed = true;
        reject(req.error);
      };
    }
    t.onabort = () => {
      if (!failed) reject(t.error ?? new Error("aborted"));
    };
  });
}

async function deleteOne(store: string, id: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const req = t.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const rid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

/* ------------------------------- 快照 ------------------------------- */

export async function snapshot(): Promise<Snapshot> {
  const [persons, families, events, places] = await Promise.all([
    readAll<Person>(S_PERSONS),
    readAll<Family>(S_FAMILIES),
    readAll<Event>(S_EVENTS),
    readAll<Place>(S_PLACES),
  ]);
  return { persons, families, events, places };
}

export async function seed(data: Snapshot): Promise<void> {
  const existing = await readAll<Person>(S_PERSONS);
  if (existing.length > 0) return; // 只在空库时灌入
  await writeAll(S_PERSONS, data.persons ?? []);
  await writeAll(S_FAMILIES, data.families ?? []);
  await writeAll(S_EVENTS, data.events ?? []);
  await writeAll(S_PLACES, data.places ?? []);
}

/* ------------------------------- 人物 ------------------------------- */

export async function createPerson(input: { name: string; gender?: string }): Promise<Person> {
  const p: Person = {
    id: rid("p"),
    names: [{ given: input.name, primary: true }],
    gender: (input.gender as Person["gender"]) ?? "U",
    note: "",
  };
  await writeAll(S_PERSONS, [p]);
  return p;
}

export async function updatePerson(id: NodeId, patch: Partial<Person>): Promise<Person> {
  const cur = await readOne<Person>(S_PERSONS, id);
  if (!cur) throw new Error(`person not found: ${id}`);
  const next = { ...cur, ...patch, id: cur.id };
  await writeAll(S_PERSONS, [next]);
  return next;
}

export async function deletePerson(id: NodeId): Promise<void> {
  await deleteOne(S_PERSONS, id);
  const fams = await readAll<Family>(S_FAMILIES);
  for (const f of fams) {
    if (f.father === id || f.mother === id) {
      await deleteOne(S_FAMILIES, f.id);
    } else if (f.children?.includes(id)) {
      await writeAll(S_FAMILIES, [{ ...f, children: f.children.filter((c) => c !== id) }]);
    }
  }
}

/* ------------------------------- 家庭 ------------------------------- */

export async function createFamily(input: Partial<Family>): Promise<Family> {
  const f: Family = {
    id: rid("f"),
    father: input.father ?? null,
    mother: input.mother ?? null,
    children: input.children ?? [],
    eventRefs: input.eventRefs ?? [],
  };
  await writeAll(S_FAMILIES, [f]);
  return f;
}

export async function updateFamily(id: NodeId, patch: Partial<Family>): Promise<Family> {
  const cur = await readOne<Family>(S_FAMILIES, id);
  if (!cur) throw new Error(`family not found: ${id}`);
  const next = { ...cur, ...patch, id: cur.id };
  await writeAll(S_FAMILIES, [next]);
  return next;
}

export async function deleteFamily(id: NodeId): Promise<void> {
  await deleteOne(S_FAMILIES, id);
}

/* ------------------------------- 事件 ------------------------------- */

export async function createEvent(input: Partial<Event>): Promise<Event> {
  const e: Event = {
    id: rid("e"),
    type: input.type ?? "Unknown",
    date: input.date,
    place: input.place ?? null,
    description: input.description ?? "",
  };
  await writeAll(S_EVENTS, [e]);
  return e;
}

export async function updateEvent(id: NodeId, patch: Partial<Event>): Promise<Event> {
  const cur = await readOne<Event>(S_EVENTS, id);
  if (!cur) throw new Error(`event not found: ${id}`);
  const next = { ...cur, ...patch, id: cur.id };
  await writeAll(S_EVENTS, [next]);
  return next;
}

export async function deleteEvent(id: NodeId): Promise<void> {
  await deleteOne(S_EVENTS, id);
}

/* ------------------------------- 地点 ------------------------------- */

export async function createPlace(input: Partial<Place>): Promise<Place> {
  const p: Place = { id: rid("l"), title: input.title ?? "", parent: input.parent ?? null };
  await writeAll(S_PLACES, [p]);
  return p;
}

export async function updatePlace(id: NodeId, patch: Partial<Place>): Promise<Place> {
  const cur = await readOne<Place>(S_PLACES, id);
  if (!cur) throw new Error(`place not found: ${id}`);
  const next = { ...cur, ...patch, id: cur.id };
  await writeAll(S_PLACES, [next]);
  return next;
}

export async function deletePlace(id: NodeId): Promise<void> {
  await deleteOne(S_PLACES, id);
}

/* --------------------------- 关系便捷操作 --------------------------- */

async function findFamilyOf(id: NodeId, role: "parent" | "child"): Promise<Family | null> {
  const fams = await readAll<Family>(S_FAMILIES);
  for (const f of fams) {
    if (role === "child" && f.children?.includes(id)) return f;
    if (role === "parent" && (f.father === id || f.mother === id)) return f;
  }
  return null;
}

export async function ensureFamilyForChild(focusId: NodeId, childId: NodeId): Promise<Family> {
  const existing = await findFamilyOf(focusId, "parent");
  if (existing) {
    return updateFamily(existing.id, { children: [...(existing.children ?? []), childId] });
  }
  return createFamily({ father: focusId, mother: null, children: [childId] });
}

export async function ensureFamilyForParent(focusId: NodeId, parentId: NodeId): Promise<Family> {
  const existing = await findFamilyOf(focusId, "child");
  if (existing) {
    if (!existing.father) return updateFamily(existing.id, { father: parentId });
    if (!existing.mother) return updateFamily(existing.id, { mother: parentId });
  }
  return createFamily({ father: parentId, mother: null, children: [focusId] });
}

export async function ensureFamilyForSpouse(focusId: NodeId, spouseId: NodeId): Promise<Family> {
  const existing = await findFamilyOf(focusId, "parent");
  if (existing) {
    if (!existing.father) return updateFamily(existing.id, { father: spouseId });
    if (!existing.mother) return updateFamily(existing.id, { mother: spouseId });
  }
  return createFamily({ father: focusId, mother: spouseId, children: [] });
}
