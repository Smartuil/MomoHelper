/**
 * 墨墨 Open API 浏览器直连代理（EdgeOne Edge Functions）。
 *
 * 为什么需要：墨墨 open.maimemo.com 对「带 Origin 头的跨域请求」统一返回
 * 403 common_permission_denied（预检 OPTIONS 放行、实际请求拒绝），浏览器
 * 无法直接调用。本函数在同源域名下提供一个转发层：前端请求走 /api/memo/*，
 * 由边缘节点以「无 Origin」的方式转发给墨墨，绕过跨域限制。
 *
 * 路由：/api/memo/** → https://open.maimemo.com/open/api/v1/memo/**
 * 例如 /api/memo/study/get_study_progress → 墨墨的 /open/api/v1/memo/study/get_study_progress
 *
 * 鉴权：前端把墨墨 Token 放在 Authorization 头，本函数原样透传给墨墨。
 * Token 仍只存在于用户浏览器 localStorage，不在本函数落地、不入日志。
 */

const MAIMEMO_BASE = 'https://open.maimemo.com/open/api/v1/memo'

export default async function onRequest(context) {
  const { request } = context

  // 只处理 /api/memo 下的路径；其余（静态资源、其它 API）交给平台默认路由
  const url = new URL(request.url)
  const path = url.pathname

  if (!path.startsWith('/api/memo')) {
    // 不匹配则返回 404，让上层自行处理
    return new Response('Not found', { status: 404 })
  }

  // 去掉 /api/memo 前缀，拼接墨墨真实路径；保留 query 参数
  const memoPath = path.replace(/^\/api\/memo/, '')
  const targetUrl = `${MAIMEMO_BASE}${memoPath}${url.search}`

  // 透传请求体（POST/PUT 等有 body 的请求）
  const method = request.method
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text().catch(() => undefined)
  }

  // 只透传必要头，避免把浏览器的 Origin/Referer 等跨域头带给墨墨
  const headers = new Headers()
  const auth = request.headers.get('Authorization')
  if (auth) {
    headers.set('Authorization', auth)
  }
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  // 以「无 Origin」方式转发（服务器间请求天然不带 Origin），绕过跨域限制
  let upstream
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body
    })
  } catch (error) {
    // 网络层失败：返回 502，附可读信息
    return new Response(
      JSON.stringify({
        errors: [{ code: 'proxy_network_error', msg: '墨墨接口网络错误' }],
        success: false
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  // 原样透传墨墨的响应体与状态码（保留墨墨的 Envelope 结构，前端解析逻辑不变）
  const upstreamBody = await upstream.text()
  const upstreamHeaders = new Headers()
  upstreamHeaders.set('Content-Type', 'application/json')
  upstreamHeaders.set('Access-Control-Allow-Origin', url.origin)
  upstreamHeaders.set('Vary', 'Origin')

  return new Response(upstreamBody, {
    status: upstream.status,
    headers: upstreamHeaders
  })
}
