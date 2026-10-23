/** 模态框保留键盘焦点，关闭后回到入口；不依赖画布或桌面事件标识。 */
import { useEffect, useRef } from "react";
export function useDialogFocus(onEscape?: () => void) {
  const ref = useRef<HTMLElement>(null), opener = useRef(document.activeElement), escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
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
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); };
  }, []);
  return ref;
}
