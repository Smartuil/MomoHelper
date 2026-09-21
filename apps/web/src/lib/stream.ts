/** SSE 场景的 API base（与 api-client 保持一致的同源策略） */
export function baseUrl(): string
{
  return globalThis.__MOMO_API_BASE__ ?? ''
}
