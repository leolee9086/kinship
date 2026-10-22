/**
 * 基于 HTTP 语义的适配器。
 *
 * 把 DataAdapter 的每个方法翻译成 REST 请求，但「发请求」由注入的
 * dispatch 完成 —— 它可能是 sac-path-router 的 internalFetch（同进程），
 * 也可能是真 fetch（打到 Rust 服务）。
 *
 * 切换后端只改 dispatch 的实现，这一层和上层都不动。
 */

import type { DataAdapter, Snapshot } from "./types";
import type { Person, Family, Event, Place, NodeId } from "../domain/types";

export type Dispatch = (method: string, path: string, body?: unknown) => Promise<unknown>;

export function createHttpAdapter(dispatch: Dispatch): DataAdapter {
  return {
    load: () => dispatch("GET", "/api/snapshot") as Promise<Snapshot>,
    seed: (s) => dispatch("POST", "/api/seed", s) as Promise<void>,

    createPerson: (name, gender) =>
      dispatch("POST", "/api/persons", { name, gender }) as Promise<Person>,
    updatePerson: (id, patch) =>
      dispatch("PATCH", `/api/persons/${id}`, patch) as Promise<Person>,
    deletePerson: async (id: NodeId) => {
      await dispatch("DELETE", `/api/persons/${id}`);
    },

    createFamily: (input) => dispatch("POST", "/api/families", input) as Promise<Family>,
    updateFamily: (id, patch) =>
      dispatch("PATCH", `/api/families/${id}`, patch) as Promise<Family>,
    deleteFamily: async (id: NodeId) => {
      await dispatch("DELETE", `/api/families/${id}`);
    },

    ensureFamilyForChild: (focusId, childId) =>
      dispatch("POST", "/api/families/ensure-child", { focusId, childId }) as Promise<Family>,
    ensureFamilyForParent: (focusId, parentId) =>
      dispatch("POST", "/api/families/ensure-parent", { focusId, parentId }) as Promise<Family>,
    ensureFamilyForSpouse: (focusId, spouseId) =>
      dispatch("POST", "/api/families/ensure-spouse", { focusId, spouseId }) as Promise<Family>,

    createEvent: (input) => dispatch("POST", "/api/events", input) as Promise<Event>,
    updateEvent: (id, patch) =>
      dispatch("PATCH", `/api/events/${id}`, patch) as Promise<Event>,
    deleteEvent: async (id: NodeId) => {
      await dispatch("DELETE", `/api/events/${id}`);
    },

    createPlace: (input) => dispatch("POST", "/api/places", input) as Promise<Place>,
    updatePlace: (id, patch) =>
      dispatch("PATCH", `/api/places/${id}`, patch) as Promise<Place>,
    deletePlace: async (id: NodeId) => {
      await dispatch("DELETE", `/api/places/${id}`);
    },
  };
}
