/**
 * 键盘交互。
 *
 * 设计原则：任何操作都要能用键盘完成，鼠标只是可选加速。
 *
 * 键位：
 *   ↑ ↓ ← →    在亲属图上移动焦点（父 / 子 / 配偶）
 *   Enter      编辑当前节点姓名
 *   Insert / a 新增一个人（作为子女）
 *   p          新增父母
 *   s          新增配偶
 *   Delete / d 删除当前节点（带确认）
 *   Esc        取消编辑 / 退出输入
 *   Tab        焦点在「图」和「帮助」之间切换
 *
 * 输入框激活时不拦截按键，避免打字被吞。
 */

import { useEffect } from "react";

export interface KeyActions {
  move: (dir: "up" | "down" | "left" | "right") => void;
  edit: () => void;
  addChild: () => void;
  addParent: () => void;
  addSpouse: () => void;
  remove: () => void;
  cancel: () => void;
  help: () => void;
  /** 是否有输入框处于激活状态。 */
  isEditing: () => boolean;
}

export function useKeyboard(actions: KeyActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 输入状态下不拦截，让用户正常打字
      if (actions.isEditing()) {
        if (e.key === "Escape") {
          e.preventDefault();
          actions.cancel();
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      // 焦点在按钮等可聚焦控件上时也放行，避免和原生行为冲突
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          actions.move("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.move("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.move("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.move("right");
          break;
        case "Enter":
          e.preventDefault();
          actions.edit();
          break;
        case "Insert":
          e.preventDefault();
          actions.addChild();
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          actions.remove();
          break;
        case "?":
          e.preventDefault();
          actions.help();
          break;
        case "a":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            actions.addChild();
          }
          break;
        case "p":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            actions.addParent();
          }
          break;
        case "s":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            actions.addSpouse();
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);
}
