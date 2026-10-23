/** 设置使用水平页签；方向键/Home/End和Tab只在当前页签继续。 */
const tabs = [{ id: "display", label: "显示" }, { id: "layout", label: "布局" }, { id: "background", label: "背景" }] as const;
export type SettingsTab = typeof tabs[number]["id"];
export function SettingsTabs({ value, onChange }: { value: SettingsTab; onChange: (value: SettingsTab) => void }) {
  return <div className="settings-tabs" role="tablist" aria-label="展示设置">{tabs.map((tab, index) => <button key={tab.id} id={`settings-tab-${tab.id}`}
    role="tab" type="button" aria-selected={value === tab.id} aria-controls={`settings-panel-${tab.id}`} tabIndex={value === tab.id ? 0 : -1}
    onClick={() => onChange(tab.id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
      if (next === undefined) return; event.preventDefault(); onChange(tabs[next].id);
      document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
    }}>{tab.label}</button>)}</div>;
}
