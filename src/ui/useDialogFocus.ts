/** 模态框保留键盘焦点，关闭后回到入口；不依赖画布或桌面事件标识。 */
import { useEffect, useRef } from "react";
export function useDialogFocus(onEscape?: () => void) {
  const ref = useRef<HTMLElement>(null), opener = useRef(document.activeElement), escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // 从全局快捷键打开时入口可能是body；关闭后回到仍存在的工作区焦点容器。
    const fallback = dialog.parentElement?.closest<HTMLElement>('[tabindex="-1"]');
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')]
      .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && element.checkVisibility());
    if (!dialog.contains(document.activeElement)) focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      // Escape也用于取消中文输入法候选，组合期间不能把它解释成关闭模态框。
      if (event.isComposing || event.keyCode === 229) return;
      // 保存时按钮被禁用会让焦点短暂退到body；Escape仍属于当前模态框。
      if (event.key === "Escape" && escape.current) { event.preventDefault(); event.stopPropagation(); escape.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    };
    document.addEventListener("keydown", trap, true);
    return () => { document.removeEventListener("keydown", trap, true);
      if (opener.current instanceof HTMLElement && opener.current !== document.body && opener.current.isConnected) opener.current.focus();
      else if (fallback?.isConnected) fallback.focus(); };
  }, []);
  return ref;
}
