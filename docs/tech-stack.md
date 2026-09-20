# 技术栈整理

## 总体架构

项目采用 Web + 微信小程序 + EdgeOne 后端函数 + 共享业务包的 monorepo 架构。

```text
apps/web
apps/miniprogram
        |
packages/api-client
        |
cloud-functions/api
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
- EdgeOne 负责部署前端、Cloud Functions 和轻量 Edge Functions。
- 独立服务器可作为后续扩展，用于队列、定时任务、长任务和复杂分析。

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
- 每日 / 每周 / 每月报告

说明：

- Next.js 适合部署到 EdgeOne Pages。
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

### EdgeOne Cloud Functions

推荐技术栈：

- Node.js 20
- TypeScript
- Hono 或轻量自定义路由
- Zod

用途：

- 用户鉴权
- 墨墨 Open API 代理
- AI API 调用
- 数据库访问
- Token 加密和解密
- 今日学习数据聚合
- 遗忘词分析
- 易混词诊断
- 云词本创建
- 学习计划写入
- 每日复盘生成

说明：

- Cloud Functions 是第一阶段主后端。
- 比 Edge Functions 更适合业务逻辑、数据库访问和 AI 调用。
- 后续可以把重任务迁移到独立服务器，保持 API 层不变。

### EdgeOne Edge Functions

推荐用途：

- 简单鉴权
- 请求限流
- 静态缓存
- 路由转发
- Header 处理
- 轻量 API 网关逻辑

说明：

- Edge Functions 不适合复杂 AI 分析、批量任务或数据库重操作。
- 只放轻量、低延迟、靠近用户的逻辑。

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

- 如果想快速上线，使用 Supabase 或 Neon。
- 如果更偏国内部署和稳定访问，使用腾讯云数据库或自建 PostgreSQL。
- 如果你已有独立服务器，也可以先自建 PostgreSQL。

## 缓存与队列

第一阶段：

- 可以暂时不引入队列
- 使用数据库记录任务状态
- 使用 EdgeOne KV 做轻量缓存和限流计数

后续扩展：

- Redis
- BullMQ
- 独立 Worker

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

### 第一阶段

推荐：

- EdgeOne Pages 部署 Web
- EdgeOne Cloud Functions 部署 API
- EdgeOne Edge Functions 做轻量网关能力
- PostgreSQL 使用云服务或自建

### 后续扩展

可加入：

- 独立服务器
- Redis
- Worker
- 定时任务
- 日志系统
- 监控报警

演进方式：

```text
第一阶段：
EdgeOne Pages + Cloud Functions + PostgreSQL

第二阶段：
EdgeOne 继续作为前端和 API 入口
独立服务器承载 Worker、队列、定时任务

第三阶段：
核心业务后端可迁移到独立服务器
EdgeOne 负责前端、CDN、API 网关和边缘逻辑
```

## 推荐第一版组合

第一版建议使用：

- Monorepo：pnpm workspace
- Web：Next.js 最新稳定版 + React 最新稳定版 + TypeScript 最新稳定版
- UI：Tailwind CSS 最新稳定版 + shadcn/ui
- 数据请求：TanStack Query 最新稳定版
- 小程序：Taro 最新稳定版 + React 最新稳定版 + TypeScript 最新稳定版
- 后端：EdgeOne Cloud Functions + 平台支持的最新 Node.js 运行时 + TypeScript 最新稳定版
- 路由：Hono 最新稳定版
- 校验：Zod 最新稳定版
- 数据库：PostgreSQL
- ORM：Drizzle 最新稳定版，或 Prisma 当前稳定 ORM 版本
- AI：统一封装在 `packages/ai`
- 墨墨 API：统一封装在 `packages/maimemo`

## 版本策略

项目希望所有技术栈尽量使用最新稳定版，但需要区分“依赖包最新稳定版”和“部署平台支持的最新运行时”。

建议策略：

- 应用依赖默认使用最新稳定版，不使用 alpha、beta、canary、rc，除非有明确原因。
- Node.js 本地开发优先使用当前 Active LTS。
- EdgeOne Cloud Functions 运行时以 EdgeOne 官方当前支持版本为准。
- 如果 EdgeOne Cloud Functions 的 Node.js 版本落后于 Node.js 官方 LTS，需要在本地开发和 CI 中保留兼容检查。
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
| EdgeOne Cloud Functions | 以 EdgeOne 当前支持的 `Node.js v20.x` 为准 |
| Prisma | 优先使用稳定 ORM 版本，不直接追 RC |
| Drizzle | 可作为第一版 ORM 首选，使用最新稳定版 |


