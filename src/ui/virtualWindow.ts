/** 固定行高列表的纯窗口计算，与 DOM/React 解耦，筛选缩短时不会产生负占位。 */
export interface ListWindow { start: number; end: number; before: number; after: number }
export function virtualWindow(count: number, offset: number, height: number, rowHeight: number, overscan = 6, headerHeight = 28): ListWindow {
  const visibleRows = Math.max(1, Math.ceil(height / rowHeight));
  // 渲染发生在 scrollTop 复位之前，先把窗口限制在结果集里，避免一帧空白和超大占位。
  const requested = Math.floor(Math.max(0, offset - headerHeight) / rowHeight) - overscan;
  const start = Math.max(0, Math.min(requested, count - visibleRows));
  const end = Math.min(count, start + visibleRows + overscan * 2);
  return { start, end, before: start * rowHeight, after: (count - end) * rowHeight };
}
