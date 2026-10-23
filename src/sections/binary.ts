/** 传输层只做二进制与 JSON 的表示转换，不解释任何 CRDT 结构。 */
export function encodeBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
export function decodeBinary(value: string): Uint8Array {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
