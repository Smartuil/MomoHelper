import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

/**
 * 获取客户端真实 IP。
 *
 * 编码约定（docs/architecture.md 第 10.1 节）：
 * 所有需要客户端 IP 的地方只调用本函数，禁止在业务代码中直接访问
 * remoteAddress。未来若在服务器前叠加 EdgeOne 等接入层，
 * remoteAddress 会变成接入节点 IP，届时只有本函数无需改动。
 */
export function getClientIp(c: Context): string
{
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded)
  {
    const first = forwarded.split(',')[0]?.trim()
    if (first)
    {
      return first
    }
  }

  try
  {
    return getConnInfo(c).remote.address ?? 'unknown'
  }
  catch
  {
    return 'unknown'
  }
}
