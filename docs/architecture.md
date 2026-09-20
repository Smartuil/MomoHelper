# 部署架构（独立服务器方案）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 文档名称 | 部署架构（独立服务器方案） |
| 版本 | v1.0 |
| 状态 | 已确认，待实施 |
| 日期 | 2026-09-20 |
| 关联文档 | `Maimemo-AI-Study-Copilot-PRD.md`、`api-capability-gap.md`、`tech-stack.md` |

---

## 1. 决策摘要

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | **全部业务部署在独立服务器**，不使用 EdgeOne | 1G 内存 + 1G swap + 200Mbps 不限流量足以支撑目标规模；少一层就少一处排查 |
| D2 | **不使用 Redis** | 单进程单出口，限流计数放进程内存即可；墨墨频控平均 9 秒 1 次，无并发压力 |
| D3 | **Node 单进程**承载 API + Queue Worker + Scheduler | 省内存；2 核本来也跑不了多少并发 |
| D4 | **PostgreSQL 18（宝塔既有实例）**，仅监听 `127.0.0.1` | 复用宝塔已装实例，1G 内存下免容器省资源；规模未到需托管的程度 |
| D5 | **AI 由服务器直连 DeepSeek** | 国内直连无网络问题，无需边缘代理 |
| D6 | **EdgeOne 不参与运行链路**，未来按需作为纯防护层接入 | 带宽充裕，CDN 与边缘计算均无必要 |
| D7 | **不引入消息队列中间件**，用 PostgreSQL 表 + 进程内调度 | 任务量与并发度都用不上 BullMQ 级别的基础设施 |

---

## 2. 服务器规格与资源预算

### 2.1 规格

| 项 | 值 |
| --- | --- |
| 实例 | 腾讯云轻量应用服务器（北京，lhins-medstvam） |
| CPU | 2 核 |
| 内存 | 1 GB（实测 957Mi），另有 1 GB swap（`/www/swap`） |
| 带宽 | 200 Mbps 峰值，不限流量（以控制台为准） |
| 操作系统 | OpenCloudOS 9.4 |
| 管理面板 | 宝塔面板（BT-Panel）已部署，Nginx / PostgreSQL / Node 均由其管理 |

实测时间 2026-09-20。注意：**实际内存为 1G 而非早前假设的 2G**，资源预算按 1G 编制。

### 2.2 内存预算

| 组件 | 预算 | 说明 |
| --- | --- | --- |
| 系统 + 宝塔面板 + 安全组件 | ~450 MB | BT-Panel、云镜 YDService、dockerd、frps 等实测已占用 |
| PostgreSQL 18（宝塔实例） | ~150 MB | `shared_buffers` 128MB |
| Node 单进程 | ~250 MB | 堆上限 384MB，实际常驻低于此 |
| Nginx | ~30 MB | 已随宝塔运行 |
| **合计** | **~880 MB / 957 MB** | **1 GB swap 兜底，队列并发固定为 1** |

### 2.3 磁盘预算

以 100 用户的增长估算：

| 表 | 年增长 |
| --- | --- |
| `daily_study_snapshots` | ~4 MB |
| `forget_events` | ~36 MB |
| `content_write_items` | ~150 MB |
| `ai_generations` | **取决于是否存全文**，见下 |
| **合计** | **~200 MB/年（不含 AI 记录）** |

**注意**：`ai_generations` 若完整存储 prompt + 输出，每行可达 2~5KB，年增长可能到 GB 级。建议：

- 只存必要的输入标识（voc_id / scene）与输出摘要
- 完整内容仅在排障时需要，可设置保留期（如 30 天）后归档或清理

实测磁盘 40 GB（已用 29%），磁盘不构成约束。

---

## 3. 架构总览

```text
┌───────────────────────────────────────────────┐
│ 客户端                                         │
│   Web 浏览器            微信小程序              │
└──────┬──────────────────────────┬─────────────┘
       │ HTTPS                    │ HTTPS
       ▼                          ▼
┌───────────────────────────────────────────────┐
│ 独立服务器（腾讯云北京 2核1G + 1G swap）          │
│                                               │
│   Nginx                                        │
│    ├─ 静态资源（Web 构建产物）+ 长缓存           │
│    ├─ /api/* → 反向代理到 Node                  │
│    ├─ TLS 终结（certbot 自动续期）               │
│    └─ limit_req 边缘限流                        │
│                                               │
│   Node 单进程                                   │
│    ├─ HTTP API      鉴权 / 数据 / AI / 墨墨代理  │
│    ├─ Queue Worker  串行写入 + 配额记账 + 频控    │
│    └─ Scheduler     node-cron 定时任务          │
│                                               │
│   PostgreSQL 18（127.0.0.1:5432）               │
└──────┬──────────────────────┬─────────────────┘
       │                      │
       ▼                      ▼
  墨墨 Open API          DeepSeek API
```

---

## 4. 组件职责

### 4.1 Nginx

| 职责 | 说明 |
| --- | --- |
| TLS 终结 | certbot 申请与自动续期，443 对外 |
| 静态资源 | 托管 Web 构建产物，带长缓存头 |
| API 反代 | `/api/*` → `127.0.0.1:3000` |
| 限流 | `limit_req` 按 IP 限速，保护源站 |
| SSE 透传 | AI 流式接口需关闭 `proxy_buffering` |
| 安全头 | `X-Frame-Options`、`X-Content-Type-Options` 等 |

**不做**：任何业务逻辑、任何数据库访问。

### 4.2 Node 单进程

一个进程内跑三个模块，由环境变量控制启停（本地开发时只开 API）。

| 模块 | 职责 |
| --- | --- |
| **HTTP API** | 用户鉴权、Token 加解密、墨墨 API 代理（唯一出口）、AI 调用、数据读写 |
| **Queue Worker** | 消费写入任务，串行执行，配额记账，频控等待，失败重试 |
| **Scheduler** | 每日快照、队列续跑、周报月报、Token 过期巡检 |

启动与关闭顺序：

```text
启动：Scheduler 注册 → Worker 启动 → HTTP Server 监听
关闭（SIGTERM）：停止 Scheduler → 等待 Worker 完成当前任务 → 关闭 HTTP Server
```

优雅关闭是必须的，否则正在写入墨墨的任务会被硬中断，产生状态不一致。

### 4.3 PostgreSQL

- 版本 18（宝塔既有实例，`/www/server/pgsql`，实测 2026-09-20）
- 仅监听 `127.0.0.1`，**绝不暴露公网**（实测已满足；轻量防火墙未放行 5432）
- 同时承担业务数据、队列表、限流辅助计数

---

## 5. 目录结构

```text
apps/
  web/                        Next.js 前端（静态导出，产物由 Nginx 托管）
  miniprogram/                Taro 小程序
  server/                     独立服务器后端
    src/
      index.ts                进程入口：启动 API + Worker + Scheduler
      config/env.ts           环境变量校验（Zod）
      http/                   Hono 应用、路由与中间件
      worker/                 队列消费
      scheduler/              定时任务
      security/crypto.ts      Token 加解密（AES-256-GCM）
      utils/request.ts        getClientIp 等工具
    config/postgresql.conf    数据库调参
    deploy/
      momohelper-api.service  Node 服务 systemd 单元（Node 用宝塔路径）
      nginx-site.conf         宝塔 Nginx 站点配置片段（合并进宝塔站点）
    .env.example              环境变量样例
packages/
  api-client/                 前后端共享的接口定义与请求封装
  ai/                         DeepSeek 调用、prompt、输出 schema
  core/                       业务逻辑（鉴权、配额记账、诊断编排）
  db/                         Drizzle schema 与迁移
  maimemo/                    墨墨 Open API 封装（仅服务器调用）
  types/                      共享类型
docs/                         产品与架构文档
package.json                  根 workspace 配置
pnpm-workspace.yaml           workspace 声明
tsconfig.base.json            共享 TS 配置
```

`apps/` 存放可独立运行的应用，`packages/` 存放被引用的库。判断标准是「能否独立跑」，不是「谁用它」——`api-client` 只给前端用，`core` 只给后端用，但两者都是库。

已移除 `cloud-functions/` 与 `edge-functions/`：纯服务器方案下不使用 EdgeOne。若未来接入，将其作为纯接入层叠加即可，无需恢复这两个目录（业务代码也无需改动，前提是遵守第 10 节）。

`packages/maimemo/dist/` 为历史编译产物（已被 `.gitignore` 忽略），实际实现放在 `src/`。

---

## 6. 部署方式

| 组件 | 方式 | 说明 |
| --- | --- | --- |
| PostgreSQL 18 | 宝塔既有实例 | 不再起容器（1G 内存下省资源）；建 `momo` 用户与 `momohelper` 库即可 |
| Node 服务 | systemd | Node 使用宝塔路径 `/www/server/nodejs/v24.21.0/bin` |
| Nginx | 宝塔管理 | 站点配置加入宝塔站点，**不得改动既有 80/443 站点** |

配置文件位置：

```text
apps/server/.env.example                        环境变量样例
apps/server/config/postgresql.conf              数据库调参（应用到宝塔 PG 实例）
apps/server/deploy/momohelper-api.service       Node 服务单元
apps/server/deploy/nginx-site.conf              宝塔站点配置片段
```

三个关键点：

1. **端口绑定 `127.0.0.1`**，不是 `0.0.0.0`。数据库实测已满足；Node 也只监听本机，即使安全组配错也无法从公网访问。
2. **`NODE_OPTIONS=--max-old-space-size=384`**（写在 systemd 单元里），1G 内存下降级，让 Node 自己 GC，而不是被系统 OOM Killer 杀掉。
3. **`TimeoutStopSec=30`** 配合 SIGTERM，给 Worker 时间写完进行中的任务，避免墨墨侧状态不一致。

Node 不放进容器的原因：monorepo 中 `packages/*` 以 TS 源码形式被 server 引用，容器内需要多阶段构建与 workspace 链接，收益低而复杂度高。systemd 直接运行更简单，也便于用 `journalctl` 查日志。

---

## 7. PostgreSQL 调参

2 核 1G 内存下的建议值（应用到宝塔 PG 18 实例的配置）：

```conf
max_connections = 30
shared_buffers = 128MB
effective_cache_size = 384MB
maintenance_work_mem = 32MB
work_mem = 4MB
wal_buffers = 8MB
min_wal_size = 128MB
max_wal_size = 512MB

random_page_cost = 1.1
effective_io_concurrency = 200
```

说明：

- `max_connections = 30`：默认 100 对 1G 内存偏高，每个连接都有固定开销。实际并发连接数远低于此值。
- `random_page_cost = 1.1` 与 `effective_io_concurrency = 200`：针对 SSD 调整，默认值是给机械盘的。
- 服务器已有 1 GB swap（`/www/swap`）。swap 不是性能方案，是防 OOM Killer 击杀 PostgreSQL 的兜底。数据库被强杀有损坏数据的风险。

---

## 8. 安全基线

| 项 | 要求 |
| --- | --- |
| 安全组 | 只开 443 与 SSH（实测端口 223）；**5432 绝不开放**（实测已满足）；建议后续收敛 3389 / 7500 / 8888 等暴露面 |
| 数据库 | 仅监听 `127.0.0.1`；`scram-sha-256` 认证；强密码 |
| Node 服务 | 仅监听 `127.0.0.1:3000`，由 Nginx 反代 |
| 对外端口 | 只有 443（Nginx） |
| HTTPS | certbot 自动续期，禁用 TLS 1.0 / 1.1 |
| 接入限流 | Nginx `limit_req`，AI 类接口单独限流 |
| 依赖更新 | 定期更新系统与容器镜像，关注安全公告 |
| 日志 | 不记录 Token 明文、不记录 AI 完整 prompt 中的敏感内容 |

---

## 9. 备份与密钥管理

### 9.1 备份

| 项 | 做法 |
| --- | --- |
| 数据库 | 每日 `pg_dump`，保留最近 7 天 |
| WAL | 开启归档，支持时间点恢复（可选，视重要性） |
| 异地 | 备份文件推送到腾讯云 COS，与服务器不同地域 |
| 备份加密 | 备份文件本身加密 |
| 恢复演练 | 每季度做一次恢复验证 |

### 9.2 密钥管理

主密钥（用于解密墨墨 Token）存放要求：

- 存放位置：服务器上的 `.env` 文件（权限 `600`），或腾讯云 SSM 凭据管理
- **绝不进代码仓库**
- **绝不进数据库备份**
- 建议保留 `key_version` 机制，支持后续轮换

这里的逻辑必须明确：数据库中存的是 Token 密文，因此**备份泄露不等于明文泄露**——前提是主密钥不在备份里。一旦两者同处一地，加密就等于白做。

密钥泄露时的处置：轮换主密钥 → 用旧密钥解密 → 用新密钥重新加密 → 更新 `key_version`。

---

## 10. 编码约定

以下约定现在遵守的成本接近零，但决定了未来接入 EdgeOne 时是「改配置」还是「大改造」。

### 10.1 客户端 IP 只能通过统一函数获取

Nginx 已有，未来接了 EdgeOne 后，`remoteAddress` 会变成边缘节点 IP 而非真实用户。若业务代码直接读 `remoteAddress`，迁移后限流、日志、风控全部失真。

```ts
export function getClientIp(req: Request): string
{
  const xff = req.headers.get('x-forwarded-for')
  if (xff)
  {
    const first = xff.split(',')[0]?.trim()
    if (first)
    {
      return first
    }
  }
  return getConnInfo(req).remote.address ?? 'unknown'
}
```

约定：

- 所有需要客户端 IP 的地方**只调 `getClientIp(req)`**
- 禁止在业务代码中直接访问 `remoteAddress` / `req.ip`
- Nginx 配置中必须设置 `X-Forwarded-For` 与 `X-Real-IP`

### 10.2 一律使用域名，禁止硬编码 IP

前端、后端配置、部署脚本中都不要出现服务器 IP。

- 前端 API base URL 用域名
- 迁移时只切换 DNS，不改代码

### 10.3 API 统一 `/api/*` 前缀

所有后端接口都在 `/api/` 下，例如 `/api/dashboard/today`。

好处：未来接入 EdgeOne 时，一条转发规则覆盖全部接口；也便于区分静态资源与接口。

### 10.4 Cookie / Session 的 domain 不写死

若后续用 Cookie 存登录态：

```ts
// 正确：跟随当前域名，不写死
{ httpOnly: true, secure: true, sameSite: 'lax' }

// 错误：迁移域名时需要改代码
{ domain: 'api.example.com' }
```

### 10.5 补充约定

| 约定 | 理由 |
| --- | --- |
| 墨墨 API 调用只允许出现在 `packages/maimemo` 内，且只在服务器运行 | 保证出口唯一（C9 限流成立） |
| 前端与小程序不得接触墨墨 Token | Token 加解密只在服务器 |
| 所有 AI 输出经 Zod 校验后才落库 | 模型输出不可信 |
| 写操作必须幂等（带业务唯一键去重） | 重试不产生重复内容 |
| 时间字段统一按 UTC+8 处理与展示 | 与墨墨 App 一致（C14） |

---

## 11. 未来接入 EdgeOne 的路径

若后续出现以下情况，可把 EdgeOne 作为**纯防护层**加在服务器前面：

- 遭遇 DDoS 或恶意刷量
- 用户量到万级，需要 CDN 分摊
- 需要多地域加速或合规要求

迁移工作量：

| 部分 | 改动 |
| --- | --- |
| 前端代码 | 0 |
| Node 业务代码 | 0（前提：遵守第 10 节） |
| 数据库 | 0 |
| Nginx 配置 | 基本不变 |
| EdgeOne 配置 | 加站点、配回源、配证书与规则 |

预计半天到一天，主要是配置与验证。

---

## 12. 待验证项

| 编号 | 项目 | 影响 |
| --- | --- | --- |
| V1 | 墨墨「600 条/天」配额是账号级还是平台级 | **影响产品形态**：账号级则各用户独立，平台级则总量受限 |
| V2 | EdgeOne 回源与 SSE 透传（仅在决定接入时） | 影响 AI 流式是否可经边缘 |
| V3 | DeepSeek 在英语词根、词源、发音相似类内容上的可靠性 | 影响 FR-5.5 / FR-8.6 / FR-4.6 是否上线 |
| V4 | DeepSeek 上下文缓存的命中条件与收益 | 影响 prompt 组织方式（固定部分前置） |
| V5 | 锐驰型服务器实际带宽与端口限制（以控制台为准） | 影响是否需要静态资源分流 |
