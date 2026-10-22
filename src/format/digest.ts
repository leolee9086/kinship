/** 内容摘要覆盖实际字节；文本使用 UTF-8。事务期间不等待 WebCrypto。 */
export async function sha256(value: string | Blob): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : await value.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
