/**
 * 图数据与焦点状态。
 *
 * 所有读写都经过 DataAdapter，不直接碰存储。
 * 这一层负责：载入快照、维护焦点、把操作翻译成适配器调用。
 */

import { useCallback, useEffect, useState } from "react";
import type { DataAdapter } from "../adapter/types";
import type { Person, Family, Event, Place, NodeId } from "../domain/types";
import { displayName } from "../domain/types";

export interface GraphState {
  persons: Person[];
  families: Family[];
  events: Event[];
  places: Place[];
  focus: NodeId | null;
  loading: boolean;
  error: string | null;
}

export function useGraph(adapter: DataAdapter) {
  const [state, setState] = useState<GraphState>({
    persons: [],
    families: [],
    events: [],
    places: [],
    focus: null,
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    try {
      const snap = await adapter.load();
      setState((s) => ({
        ...s,
        persons: snap.persons,
        families: snap.families,
        events: snap.events,
        places: snap.places,
        focus: s.focus ?? snap.persons[0]?.id ?? null,
        loading: false,
      }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }, [adapter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setFocus = useCallback((id: NodeId | null) => {
    setState((s) => ({ ...s, focus: id }));
  }, []);

  /**
   * 快速新增：在焦点人物旁边造一个人并建立关系。
   * child  → 建一个 family（父亲或母亲是焦点），把新人当孩子
   * parent → 建一个 family，把新人当父亲/母亲，焦点当孩子
   * spouse → 建一个 family，把新人和焦点当夫妻
   */
  const quickAdd = useCallback(
    async (kind: "child" | "parent" | "spouse") => {
      const focus = state.focus;
      if (!focus) return;
      const p = await adapter.createPerson(kind === "spouse" ? "新配偶" : "新成员");

      if (kind === "child") {
        await adapter.ensureFamilyForChild(focus, p.id);
      } else if (kind === "parent") {
        await adapter.ensureFamilyForParent(focus, p.id);
      } else {
        await adapter.ensureFamilyForSpouse(focus, p.id);
      }

      await reload();
      setState((s) => ({ ...s, focus: p.id }));
      return p;
    },
    [adapter, reload, state.focus]
  );

  const renamePerson = useCallback(
    async (id: NodeId, name: string) => {
      const p = state.persons.find((x) => x.id === id);
      if (!p) return;
      const rest = (p.names ?? []).filter((n) => !n.primary);
      const names = [{ surname: "", given: name, primary: true }, ...rest];
      await adapter.updatePerson(id, { names });
      await reload();
    },
    [adapter, reload, state.persons]
  );

  const removePerson = useCallback(
    async (id: NodeId) => {
      await adapter.deletePerson(id);
      await reload();
      setState((s) => ({ ...s, focus: s.focus === id ? null : s.focus }));
    },
    [adapter, reload]
  );

  /** 方向键：沿关系找最近的邻居。 */
  const neighbor = useCallback(
    (id: NodeId, dir: "up" | "down" | "left" | "right"): NodeId | null => {
      const parents: NodeId[] = [];
      const children: NodeId[] = [];
      const spouses: NodeId[] = [];

      for (const f of state.families) {
        const kids = f.children ?? [];
        const isChild = kids.includes(id);
        const isFather = f.father === id;
        const isMother = f.mother === id;
        if (!isChild && !isFather && !isMother) continue;

        if (isChild) {
          if (f.father) parents.push(f.father);
          if (f.mother) parents.push(f.mother);
        }
        if (isFather || isMother) {
          spouses.push(...[f.father, f.mother].filter((x): x is NodeId => !!x && x !== id));
          children.push(...kids);
        }
      }

      if (dir === "up") return parents[0] ?? null;
      if (dir === "down") return children[0] ?? null;
      return spouses[0] ?? children[0] ?? null;
    },
    [state.families]
  );

  return {
    state,
    reload,
    setFocus,
    quickAdd,
    renamePerson,
    removePerson,
    neighbor,
    label: (p: Person) => displayName(p),
  };
}
