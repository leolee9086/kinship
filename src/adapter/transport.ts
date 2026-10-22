/** Transport 仅搬运 POST 请求和原始响应；RPC 校验/重试语义由上层负责。 */
export interface TransportResponse { status: number; headers: Headers; body: unknown }
export type Dispatch = (path: string, body: unknown, signal?: AbortSignal) => Promise<TransportResponse>;
