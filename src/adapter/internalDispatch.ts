/**
 * 同进程 HTTP transport。这里必须调用真正的 internal fetch，不能把 repository
 * 注入 React 后直接调用。FormData 保留标准上传语义，不把视频转成 JSON/base64。
 */
import { buildInternalFetch, type DispatchableRouter } from "@leolee9086/sac-path-router";
import type { Dispatch } from "./api";

export function createInternalDispatch(router: DispatchableRouter): Dispatch {
  const internalFetch = buildInternalFetch(router);
  return async (method, path, body) => {
    const native = typeof body === "string" || body instanceof Blob || body instanceof FormData;
    const response = await internalFetch(path, {
      method,
      headers: body === undefined || native ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : native ? body : JSON.stringify(body),
    });
    if (response.status >= 400) {
      const payload = response.body as { error?: string } | undefined;
      throw new Error(`${response.status} ${payload?.error ?? "资源请求失败"}`);
    }
    if (response.status === 204) return undefined;
    return response.body;
  };
}
