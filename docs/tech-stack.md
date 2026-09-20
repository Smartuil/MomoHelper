# 技术栈整理

## 总体架构

项目采用 Web + 微信小程序 + 独立服务器后端 + 共享业务包的 monorepo 架构。

```text
apps/web
apps/miniprogram
apps/server                   （独立服务器，唯一业务后端）
        |
packages/api-client
        |
packages/maimemo
packages/ai
packages/core
packages/db
```

核心思路：

- Web 和小程序是两个前端入口。
- 后端 API 统一承载墨墨 API、AI API、数据库和权限控制。
- 业务逻辑尽量沉到 packages，避免 Web、小程序、后端各写一套。
- 独立服务器部署 Nginx、Node 单进程和 PostgreSQL，承载全部业务。
- 不使用 EdgeOne；未来需要防护或 CDN 时作为纯接入层叠加，不影响业务代码。
- 详细部署方案见 `architecture.md`。

## 前端

### Web

推荐技术栈：

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand

用途：

- 学习工作台
- 今日学习看板
- 遗忘词分析
- 易混词诊断
- 云词本管理
- AI 问词助手
- 文本生词提取
- 学习词汇词云
- 每日 / 每周 / 每月报告

说明：

- Next.js 建议使用静态导出（`output: 'export'`），构建产物由 Nginx 托管，不额外占用 Node 进程。
- TanStack Query 负责服务端数据请求、缓存和刷新。
- Zustand 负责少量本地状态，比如当前选中的词本、筛选条件、UI 状态。
- shadcn/ui 适合快速搭建干净的工具型界面。

### 微信小程序

推荐技术栈：

- Taro
- React
- TypeScript

备选：

- 原生微信小程序
- uni-app

用途：

- 今日学习进度
- 今日遗忘词
- AI 问词
- 易混词解释
- 每日复盘
- 手动添加单词
- 粘贴文本提取生词
- 一键加入云词本或学习计划

说明：

- 如果希望和 Web 共享 React/TypeScript 开发体验，优先 Taro。
- 如果后续要深度使用微信原生能力，原生小程序更稳。
- 小程序不承载复杂管理台，主要做轻量随身入口。

## 后端

### 独立服务器（唯一业务后端）

推荐技术栈：

- Node.js 24（Active LTS）
- TypeScript
- Hono
- Zod

进程模型：**单进程三模块**

| 模块 | 职责 |
| --- | --- |
| HTTP API | 用户鉴权、墨墨 Open API 代理、AI 调用、数据库访问、Token 加解密 |
| Queue Worker | 批量写入队列消费、配额记账、频控等待、失败重试 |
| Scheduler | 每日快照、队列续跑、周报月报、Token 过期巡检 |

说明：

- 一个进程内承载三模块，通过环境变量控制启停（本地开发只开 API）。
- 2 核 2G 规格下拆多进程只会浪费内存，且 2 核本来跑不了多少并发。
- 必须实现优雅关闭：SIGTERM 时先停 Scheduler，等 Worker 完成当前任务，再关 HTTP Server。
- 墨墨 API 出口、Token 解密、配额记账三者的唯一性都在此成立。

### Nginx（接入层）

推荐用途：

- TLS 终结与证书自动续期（certbot）
- 静态资源托管与长缓存
- `/api/*` 反向代理到 Node
- `limit_req` 限流保护
- SSE 透传（AI 流式接口需关闭 `proxy_buffering`）
- 安全响应头

说明：

- Nginx 不承载任何业务逻辑。
- 只对外暴露 443；Node 与 PostgreSQL 均只监听 `127.0.0.1`。

## 数据库

推荐：

- PostgreSQL
- Prisma 或 Drizzle

可选服务：

- Supabase
- Neon
- 腾讯云数据库 PostgreSQL
- 自建 PostgreSQL

用途：

- 用户表
- 墨墨 Token 加密存储
- 用户偏好设置
- AI 生成记录
- 每日复盘记录
- 易混词组记录
- 云词本映射
- 操作日志

选型建议：

- 第一版使用**独立服务器自建 PostgreSQL**，与 Worker 同机，延迟最低。
- 数据量或可用性要求提升后，再迁移到腾讯云数据库 PostgreSQL（`pg_dump` 平滑迁移）。
- 无论自建还是托管，数据库都必须仅监听本机 / 内网，不暴露公网。

## 缓存与队列

第一版：

- **不引入 Redis**：单进程单出口，限流计数放进程内存即可。
- **不引入消息队列中间件**：用 PostgreSQL 表记录任务状态，进程内串行调度。
- 队列全局并发限制为 2（保护 2 核 2G 规格）。

后续扩展：

- Redis（多进程 / 多机后才需要，用于共享限流计数与分布式锁）
- BullMQ
- 独立 Worker 进程或独立机器

适用场景：

- 批量生成例句
- 批量生成助记
- 批量分析历史学习数据
- 每日复盘定时生成
- 周报 / 月报生成
- 失败重试
- 限流和任务排队

## AI 能力

推荐封装位置：

- `packages/ai`

能力模块：

- AI 问词
- 遗忘词诊断
- 易混词分析
- 个性化释义生成
- 例句生成
- 助记生成
- 每日复盘生成
- 周报 / 月报生成

建议：

- 不要把 prompt 散落在页面或接口里。
- 将 prompt、模型调用、输入输出 schema 统一封装。
- 使用 Zod 校验 AI 返回结构。
- 预留多模型 provider，方便后续切换 OpenAI、Claude、Gemini 或国产模型。

## 墨墨 API 封装

推荐封装位置：

- `packages/maimemo`

能力模块：

- Token 校验
- 单词查询
- 今日学习进度
- 今日学习词
- 今日遗忘词
- 学习记录查询
- 云词本管理
- 添加学习计划
- 提前复习
- 自定义释义
- 例句
- 助记

建议：

- 所有墨墨 API 调用只允许从后端发起。
- 前端和小程序不要直接接触墨墨 Token。
- 对墨墨 API 做统一错误处理、重试和限流。
- 对批量操作做任务记录，避免重复写入。

## 类型与校验

推荐：

- TypeScript
- Zod

封装位置：

- `packages/types`
- `packages/core`

用途：

- 共享数据类型
- API 请求和响应类型
- AI 输出结构校验
- 墨墨 API 响应适配
- 前后端类型一致性

## API 请求层

推荐封装位置：

- `packages/api-client`

用途：

- Web 请求后端
- 小程序请求后端
- 统一错误处理
- 统一鉴权 Header
- 统一接口类型

说明：

- Web 和小程序共享 API client 的核心逻辑。
- 小程序可能需要单独适配 `wx.request`，但接口定义可以复用。

## 部署

### 第一版

- Nginx（宿主机）：TLS、静态资源、反向代理、限流
- Node 单进程（Docker）
- PostgreSQL 16（Docker，仅监听 `127.0.0.1`）
- certbot 自动续期证书
- 备份：每日 `pg_dump` 推送腾讯云 COS

### 后续扩展

可加入：

- Redis
- 独立 Worker 进程
- 日志系统
- 监控报警
- 腾讯云托管 PostgreSQL

演进方式：

```text
第一版：
单机（Nginx + Node + PostgreSQL）

第二版：
应用与数据库分离
或数据库迁移到腾讯云托管

第三版：
多实例 + 负载均衡 + Redis 共享状态
```

说明：本方案不涉及 EdgeOne。若后续需要 CDN 或攻击防护，把 EdgeOne 作为纯接入层叠加即可，业务代码无需改动（前提是遵守 `architecture.md` 第 10 节的编码约定）。

## 推荐第一版组合

第一版建议使用：

- Monorepo：pnpm workspace
- Web：Next.js 最新稳定版 + React 最新稳定版 + TypeScript 最新稳定版
- UI：Tailwind CSS 最新稳定版 + shadcn/ui
- 数据请求：TanStack Query 最新稳定版
- 小程序：Taro 最新稳定版 + React 最新稳定版 + TypeScript 最新稳定版
- 后端：独立服务器 + Node.js 24 Active LTS + TypeScript 最新稳定版
- 路由：Hono 最新稳定版
- 反向代理：Nginx 最新稳定版
- 容器：Docker + Docker Compose
- 校验：Zod 最新稳定版
- 数据库：PostgreSQL 16（本机自建）
- ORM：Drizzle 最新稳定版，或 Prisma 当前稳定 ORM 版本
- AI：统一封装在 `packages/ai`
- 墨墨 API：统一封装在 `packages/maimemo`

## 版本策略

项目希望所有技术栈尽量使用最新稳定版，但需要区分"依赖包最新稳定版"和"部署平台支持的最新运行时"。

建议策略：

- 应用依赖默认使用最新稳定版，不使用 alpha、beta、canary、rc，除非有明确原因。
- Node.js 本地开发优先使用当前 Active LTS。
- 服务器运行时使用 Node.js 当前 Active LTS，本地开发与生产保持一致。
- 不再受 FaaS 运行时版本限制，可直接使用官方 LTS，无需兼容降级。
- Prisma 需要谨慎处理版本。若 Prisma 最新 `latest` 指向 RC 或新 CLI 体系，第一版优先使用当前稳定 ORM 版本，避免迁移命令和客户端生成流程不稳定。
- 依赖版本应在 `package.json` 中锁定主版本，避免无意升级造成构建或运行时差异。

截至 2026-09-20 核对结果：

| 技术 | 当前建议 |
| --- | --- |
| Next.js | 使用 `16.x` 最新稳定版 |
| React | 使用 `19.x` 最新稳定版 |
| Taro | 使用 `4.x` 最新稳定版 |
| Tailwind CSS | 使用 `4.x` 最新稳定版 |
| TanStack Query | 使用 `5.x` 最新稳定版 |
| Hono | 使用 `4.x` 最新稳定版 |
| Zod | 使用 `4.x` 最新稳定版 |
| Node.js 本地开发 | 优先使用 `24.x` Active LTS |
| 服务器运行时 | 使用 `24.x` Active LTS，与本地开发一致 |
| Prisma | 优先使用稳定 ORM 版本，不直接追 RC |
| Drizzle | 可作为第一版 ORM 首选，使用最新稳定版 |


