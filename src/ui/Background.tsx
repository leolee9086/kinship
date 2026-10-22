/** 背景只消费适配器返回的资源。Object URL 是短暂显示句柄，不是持久化地址。 */
import { useEffect, useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { BackgroundSettings, MediaInfo } from "../domain/concepts";

export function Background({ adapter, settings, onError }: {
  adapter: DataAdapter; settings: BackgroundSettings; onError: (message: string) => void;
}) {
  const [resource, setResource] = useState<{ url: string; info: MediaInfo } | null>(null);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const video = useRef<HTMLVideoElement>(null);
  const report = useRef(onError); report.current = onError;
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(query.matches);
    document.addEventListener("visibilitychange", visibility); query.addEventListener("change", motion);
    return () => { document.removeEventListener("visibilitychange", visibility); query.removeEventListener("change", motion); };
  }, []);
  useEffect(() => {
    let active = true, url: string | null = null;
    setResource(null);
    if (settings.mediaId) void Promise.all([adapter.mediaInfo(settings.mediaId), adapter.mediaContent(settings.mediaId)])
      .then(([info, blob]) => {
        if (!active) return;
        url = URL.createObjectURL(blob); setResource({ url, info });
      }).catch(error => { if (active) report.current(String(error)); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [adapter, settings.mediaId]);
  useEffect(() => {
    const element = video.current;
    if (!element || !resource) return;
    if (settings.paused || reduced || hidden) element.pause();
    else void element.play().catch(error => report.current(`视频未能播放：${String(error)}`));
  }, [resource, settings.paused, reduced, hidden]);

  return <div className="scene-background" aria-hidden="true" data-media-id={settings.mediaId ?? ""}>
    <div className="background-grid" />
    {resource && <div className="background-media" style={{ opacity: settings.opacity, filter: `blur(${settings.blur}px)` }}>
      {resource.info.type.startsWith("video/")
        ? <video ref={video} src={resource.url} muted loop playsInline preload="metadata"
          onError={() => report.current("无法解码背景视频，请使用浏览器支持的 MP4 / WebM / Ogg 编码")}
          onLoadedData={() => { if (!settings.paused && !reduced && !hidden) void video.current?.play().catch(error => report.current(String(error))); }} />
        : <img src={resource.url} alt="" onError={() => report.current("无法解码背景图片")} />}
    </div>}
    <div className="background-wash" />
  </div>;
}
