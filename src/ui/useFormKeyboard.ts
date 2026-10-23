/** 表单键盘操作保留原生选择框/多行输入语义，输入法选词期间不派发导航或保存。 */
import { useRef, type KeyboardEvent } from "react";
export function useFormKeyboard(locked: boolean) {
  const composing = useRef(false);
  return {
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    onKeyDown: (event: KeyboardEvent<HTMLFormElement>) => {
      if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.key !== "Enter") return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault(); if (!locked) event.currentTarget.requestSubmit(); return;
      }
      // 单行文本的 Enter 前往下一控件；textarea换行、select确认、summary展开、button激活均由浏览器处理。
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !(event.target instanceof HTMLInputElement)
        || !["text", "search", "url", "email", "number"].includes(event.target.type)) return;
      event.preventDefault(); if (locked) return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),summary')]
        .filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0);
      items[items.indexOf(event.target) + 1]?.focus();
    },
  };
}
