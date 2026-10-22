/** 同进程 transport 使用真正的 internal fetch，媒体保留 FormData/Blob 字节语义。 */
import { buildInternalFetch, type DispatchableRouter } from "@leolee9086/sac-path-router";
import type { Dispatch } from "./transport";

export function createInternalDispatch(router: DispatchableRouter): Dispatch {
  const internalFetch = buildInternalFetch(router);
  return async (path, body, signal) => {
    const multipart = body instanceof FormData;
    const response = await internalFetch(path, { method: "POST", signal,
      headers: multipart ? {} : { "content-type": "application/json" },
      body: multipart ? body : JSON.stringify(body),
    });
    return { status: response.status, headers: new Headers(response.responseHeaders), body: response.body };
  };
}
