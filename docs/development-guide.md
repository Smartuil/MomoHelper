# 开发实施指南（AI 执行用）

## 0. 文档用途与阅读方式

**用途**：面向执行编码的 AI。读完本文档后应能直接产出可运行代码，不必反复回查其他文档。

**阅读顺序**：第 1 章（硬约束）→ 第 2~5 章（规范）→ 第 6 章（数据模型）→ 第 7~10 章（各层规格）→ 第 11 章（降级）→ 第 12 章（任务清单）→ 开始编码。

**执行方式**：第 12 章的任务按依赖顺序排列，每个任务可独立交付并自测。**一次只做一个任务，完成并自测通过后再进入下一个。**

**配套文档**（仅在需要追溯依据时查阅）：

| 文档 | 内容 |
| --- | --- |
| `Maimemo-AI-Study-Copilot-PRD.md` | 需求条目（FR-x.y）、验收标准、优先级 |
| `api-capability-gap.md` | 墨墨 API 能力核对与真机实测 |
| `architecture.md` | 部署架构、资源预算、编码约定 |
| `tech-stack.md` | 技术栈选型 |

---

## 1. 项目概览与硬约束

### 1.1 这是什么

墨墨背单词的 AI 学习副驾。**不是背词 App**，而是贴着墨墨工作流的诊断、整理、增强层。

职责边界：

- 墨墨负责：复习调度、学习计划、背词执行、认识/模糊/忘记的判定。
- 本产品负责：学习诊断、内容增强、生词整理、易混词分析、复盘建议。
- **明确不做**：模拟用户在墨墨中的作答操作、替代背词流程、记忆卡、浏览器插件、PDF 导入。

### 1.2 架构

```text
浏览器 / 微信小程序
      │ HTTPS
      ▼
Nginx（TLS 终结、静态资源、反向代理、限流）
      │ 127.0.0.1:3000
      ▼
Node 单进程
  ├─ HTTP API      鉴权 / 数据 / AI / 墨墨代理
  ├─ Queue Worker  写入队列（并发 2）
  └─ Scheduler     定时任务
      │
      ├─> PostgreSQL 18（宝塔实例 127.0.0.1:5432）
      ├─> 墨墨 Open API（唯一出口）
      └─> DeepSeek API
```

不使用 EdgeOne、不使用 Redis、不引入消息队列中间件。理由见 `architecture.md` 第 1 节。

### 1.3 硬约束（违反即为 bug）

| 编号 | 约束 | 编码影响 |
| --- | --- | --- |
| C1 | 释义/例句/助记三类接口只返回**用户自己创建**的内容，无官方词典数据 | AI 生成属于从零创作，不可宣称"改写官方释义" |
| C2 | 学习数据接口处于公测，需用户在 App 开启自动同步；当日未打开 App 时算不准 | 所有依赖学习数据的功能**必须**有降级路径 |
| C3 | 无按天历史序列，只有今日快照 + 单词级当前状态 | 趋势类功能必须由平台每日留存快照 |
| C4 | 释义 + 例句 + 助记**合计**每天最多创建 600 条 | 批量写入必须走分天队列，不可同步完成 |
| C5 | `advance_study` 需账号等级 ≥ 10，且**无等级查询接口** | 不可预检，只能调用失败后处理 |
| C6 | 无音标、词频、词根、形近词、难度、大纲标记 | 相关分析由 AI + 本地编辑距离推断，UI 必须标注「推测」 |
| C7 | 只支持向学习计划**添加**单词，不支持移除 | UI 不得提供移除入口 |
| C8 | 不支持删除云词本中**单个**单词 | 只能 GET 全量 → 修改 → 整体覆盖 |
| C9 | 频控：10 秒 20 次 / 60 秒 40 次 / 5 小时 2000 次 | 后端统一限流，墨墨调用出口唯一 |
| C10 | Token 有效期 7 天，无刷新机制 | 需过期提醒 + 重新绑定引导 |
| C11 | 更新云词本要求**全字段必填**，并发写会互相覆盖 | 需乐观锁或串行化 |
| C12 | 查不到 ≠ 报错（`success: true` 但 `data` 无 `voc`） | 判断单词存在性**必须**看 `data.voc`，不能看 `success` |
| C13 | 云词本 `content` 可能是不规范内容（实测出现过 `" 兔兔"`） | 解析必须容错，不可假设一行一词 |
| C14 | 日期字段按 UTC+8 日期边界存储 | 展示前必须转换 |

---

## 2. 技术栈（锁定）

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 包管理 | pnpm workspace | 最新稳定版 |
| 语言 | TypeScript | 最新稳定版 |
| 运行时 | Node.js | 24.x Active LTS |
| Web | Next.js | 16.x（静态导出 `output: 'export'`） |
| UI | React | 19.x |
| 样式 | Tailwind CSS | 4.x |
| 组件 | shadcn/ui | 最新稳定版 |
| 数据请求 | TanStack Query | 5.x |
| 本地状态 | Zustand | 最新稳定版 |
| 小程序 | Taro | 4.x |
| 后端框架 | Hono | 4.x |
| 校验 | Zod | 4.x |
| 数据库 | PostgreSQL | 18（宝塔既有实例） |
| ORM | Drizzle | 最新稳定版 |
| AI | DeepSeek（OpenAI 兼容协议） | `deepseek-chat` / `deepseek-reasoner` |
| 部署 | 宝塔 Nginx + systemd | OpenCloudOS 9.4，PG/Nginx/Node 复用宝塔组件 |

**版本规则**：应用依赖用最新稳定版，不用 alpha/beta/rc/canary。`package.json` 锁定主版本。

---

## 3. 仓库结构

```text
apps/
  web/                      Next.js 前端
  miniprogram/              Taro 小程序
  server/                   后端服务
    src/
      index.ts              进程入口
      config/env.ts         环境变量校验
      http/                 Hono 应用、路由、中间件
      worker/               队列消费
      scheduler/            定时任务
      security/             Token 加解密
      utils/                工具函数
    config/postgresql.conf
    deploy/
    .env.example
packages/
  types/                    共享类型
  db/                       Drizzle schema 与迁移
  maimemo/                  墨墨 API 封装
  ai/                       DeepSeek 封装
  core/                     业务逻辑（鉴权、配额、编排）
  api-client/               前后端共享接口定义
docs/
```

**规则**：不得新增顶层目录，不得在 `apps/` 下放库，不得在 `packages/` 下放可独立运行的应用。

---

## 4. 编码规范

### 4.1 通用

- TypeScript `strict: true`，禁用隐式 `any`。
- ESM：`"type": "module"`；相对导入必须带 `.js` 后缀。
- **花括号单独占一行（Allman 风格）**：

```ts
if (condition)
{
  doSomething()
}
```

- 不使用 `default export`，除非框架强制要求（Next.js 页面、Taro 页面除外）。
- 命名：
  - 文件：`kebab-case.ts`
  - 类型 / 接口：`PascalCase`
  - 函数 / 变量：`camelCase`
  - 常量：`UPPER_SNAKE_CASE`

### 4.2 注释

- 使用**中文**。
- 解释「为什么」而非「做什么」。
- 涉及硬约束的位置**必须**标注约束编号，例如：

```ts
// 判断单词是否存在必须看 data.voc，不能依赖 success（C12）
const exists = Boolean(response.data.voc?.length)
```

### 4.3 强制编码约定

来自 `architecture.md` 第 10 节，**违反会导致未来迁移成本剧增**：

| 编号 | 约定 |
| --- | --- |
| 4.3.1 | 客户端 IP 只能通过 `getClientIp(c)` 获取，禁止直接访问 `remoteAddress` / `req.ip` |
| 4.3.2 | 一律使用域名，禁止硬编码服务器 IP |
| 4.3.3 | 所有接口统一挂载在 `/api/*` 下 |
| 4.3.4 | Cookie / Session 的 `domain` 不写死 |
| 4.3.5 | 墨墨 API 调用只允许出现在 `packages/maimemo` 内，且只在服务器运行 |
| 4.3.6 | 前端与小程序不得接触墨墨 Token |
| 4.3.7 | 所有 AI 输出经 Zod 校验后才允许落库 |
| 4.3.8 | 写操作必须幂等（带业务唯一键去重） |
| 4.3.9 | 时间字段统一按 UTC+8 处理与展示 |

---

## 5. 环境变量

文件：`apps/server/.env`（权限 `600`，不进仓库）

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `NODE_ENV` | 否 | `development` | `development` / `test` / `production` |
| `PORT` | 否 | `3000` | HTTP 监听端口 |
| `DATABASE_URL` | 是 | — | PostgreSQL 连接串 |
| `MAIMEMO_TOKEN_KEY` | 是 | — | base64 编码的 32 字节密钥 |
| `MAIMEMO_TOKEN_KEY_VERSION` | 否 | `1` | 密钥轮换用 |
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | — |
| `WECHAT_APP_ID` | 是 | — | 微信开放平台 / 小程序 AppID |
| `WECHAT_APP_SECRET` | 是 | — | — |
| `SESSION_SECRET` | 是 | — | 会话签名密钥 |
| `ENABLE_API` | 否 | `true` | 本地开发可只开 API |
| `ENABLE_WORKER` | 否 | `true` | — |
| `ENABLE_SCHEDULER` | 否 | `true` | — |
| `WORKER_CONCURRENCY` | 否 | `1` | 队列并发，1G 内存机器上限 2 |

主密钥生成：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

**禁止**：主密钥写入代码仓库、写入数据库、写入备份。

---

## 6. 数据模型

使用 Drizzle ORM。文件：`packages/db/src/schema/`。

通用规则：

- 所有表含 `id`（uuid，主键）、`created_at`、`updated_at`。
- 时间字段统一 `timestamptz`。
- 用户相关表含 `user_id`，并建立索引。

### 6.1 `users`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | — |
| `union_id` | text unique | 微信 unionid |
| `open_id_web` | text unique null | Web 扫码登录 openid |
| `open_id_mp` | text unique null | 小程序 openid |
| `maimemo_sub` | text unique null | 墨墨 OIDC 用户标识（`id_token.payload.sub`），为开放平台授权登录预留；个人 token 阶段为空 |
| `nickname` | text null | — |
| `avatar_url` | text null | — |

### 6.2 `maimemo_credentials`

Token 只存密文。字段与 `apps/server/src/security/crypto.ts` 的 `EncryptedToken` 一一对应。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid PK | 一用户一条 |
| `credential_type` | text | `MANUAL`（个人 token 粘贴）/ `OIDC`（开放平台授权登录），现阶段只产生 `MANUAL` |
| `ciphertext` | text | AES-256-GCM 密文 |
| `iv` | text | 12 字节随机 nonce |
| `auth_tag` | text | 16 字节认证标签 |
| `refresh_ciphertext` | text null | refresh token 密文，仅 `OIDC` 使用，用于静默续期；`MANUAL` 为空 |
| `refresh_iv` | text null | 仅 `OIDC` |
| `refresh_auth_tag` | text null | 仅 `OIDC` |
| `key_version` | int | 密钥轮换 |
| `token_status` | text | `ACTIVE` / `EXPIRED` / `INVALID` |
| `token_expires_at` | timestamptz | `MANUAL` 按 7 天有效期记录（C10）；`OIDC` 记录 access token 过期时间，refresh 续期后同步更新 |
| `last_verified_at` | timestamptz null | 最近校验成功时间 |

OIDC 预留说明（接入墨墨开放平台后启用，当前实现只需支持 `MANUAL`）：

- access token 与 refresh token 的 AAD 分别为 `user_id + ':access'` 与 `user_id + ':refresh'`，防止两类密文互换；`crypto.ts` 现以 `user_id` 单独作 AAD，接入 OIDC 时同步扩展。
- refresh 调用失败（refresh token 已失效）→ `token_status = EXPIRED`，引导用户重新授权，不自动重试。
- 两类凭证共用同一主密钥 `MAIMEMO_TOKEN_KEY`，轮换仍靠 `key_version`。

### 6.3 `user_preferences`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `user_id` | uuid PK | — | — |
| `allow_interpretation` | boolean | `false` | 允许写入自定义释义 |
| `allow_phrase` | boolean | `false` | 允许写入例句 |
| `allow_note` | boolean | `false` | 允许写入助记 |
| `allow_notepad` | boolean | `false` | 允许创建/更新云词本 |
| `allow_study_plan` | boolean | `false` | 允许加入学习计划 |
| `daily_quota_used` | int | `0` | 当日已用配额（C4） |
| `quota_reset_date` | date | — | 配额所属日期，用于跨天重置 |

**默认全部关闭**（保守策略）。

### 6.4 `daily_study_snapshots`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `snapshot_date` | date | 北京时间日期 |
| `finished` | int | 已完成词数 |
| `total` | int | 今日应完成词数 |
| `study_time_ms` | bigint | 学习时长（毫秒） |
| `is_reliable` | boolean | 数据可信度（C2：当日未打开 App 时不可信） |
| `captured_at` | timestamptz | 采集时间 |

唯一约束：`(user_id, snapshot_date)`

### 6.5 `content_write_jobs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `job_type` | text | `INTERPRETATION` / `PHRASE` / `NOTE` |
| `scene` | text | 生成场景（`CONCISE` / `EXAM` / `TECH` 等） |
| `total_count` | int | 总条数 |
| `done_count` | int | 已完成条数 |
| `failed_count` | int | 失败条数 |
| `status` | text | `PENDING` / `RUNNING` / `PAUSED` / `DONE` / `FAILED` / `CANCELLED` |
| `quota_date` | date | 归属配额日期 |

### 6.6 `content_write_items`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `job_id` | uuid FK | — |
| `voc_id` | text | 墨墨单词 ID |
| `spelling` | text | 单词拼写 |
| `payload` | jsonb | AI 生成的结构化内容 |
| `status` | text | `PENDING` / `RUNNING` / `DONE` / `FAILED` / `SKIPPED` |
| `error` | text null | 失败原因 |
| `attempts` | int | 重试次数 |
| `written_at` | timestamptz null | 写入成功时间 |

**幂等键**：`(user_id, job_type, voc_id, scene)` 唯一，避免重复写入（4.3.8）。

### 6.7 `ai_generations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `scene` | text | 调用场景 |
| `model` | text | 使用的模型 |
| `input_digest` | text | 输入摘要（**不存完整 prompt**，控制体积） |
| `output` | jsonb | 结构化输出 |
| `prompt_tokens` | int | — |
| `completion_tokens` | int | — |
| `accepted` | boolean null | 用户是否采纳 |

**注意**：不存完整 prompt 与全文输出，只存必要字段，否则年增长可达 GB 级。

### 6.8 `confusion_groups`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `words` | text[] | 易混词组，如 `['adapt','adopt','adept']` |
| `reason` | text | 混淆类型（见 7.2 枚举） |
| `score` | numeric | 相似度评分 |
| `source` | text | 发现方式：`EDIT_DISTANCE` / `AI` |

### 6.9 `forget_events`

平台自行累积，用于「高频遗忘词」与词云难度视角（C3）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `voc_id` | text | — |
| `spelling` | text | — |
| `event_date` | date | 北京时间日期 |
| `response` | text | `FORGET` / `VAGUE` / `FAMILIAR` |
| `source` | text | `TODAY_ITEMS` / `STUDY_RECORDS` |

唯一约束：`(user_id, voc_id, event_date, source)`

### 6.10 `notepad_mappings`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `notepad_id` | text | 墨墨云词本 ID（形如 `np-...`，不做格式假设） |
| `title` | text | — |
| `tags` | text[] | 平台侧标签 |
| `content_version` | int | 乐观锁版本号（C11） |
| `last_synced_at` | timestamptz | — |

### 6.11 `daily_reviews`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `review_date` | date | — |
| `content` | jsonb | 结构化复盘内容 |
| `metrics` | jsonb | 当日指标快照 |

唯一约束：`(user_id, review_date)`，避免重复生成。

### 6.12 `periodic_reports`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `period_type` | text | `WEEKLY` / `MONTHLY` |
| `period_start` | date | — |
| `period_end` | date | — |
| `content` | jsonb | 报告内容 |
| `data_completeness` | numeric | 快照完整度，低于 0.7 时 UI 需提示 |

### 6.13 `operation_logs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | — |
| `action` | text | 操作类型 |
| `target` | text | 操作对象 |
| `result` | text | `SUCCESS` / `FAILED` |
| `detail` | jsonb null | 不含敏感信息 |
| `client_ip` | text | 来自 `getClientIp` |
| `created_at` | timestamptz | — |

---

## 7. 后端各层规格

### 7.1 `packages/maimemo` — 墨墨 API 封装

**唯一出口**，只在服务器运行。

必须实现的模块：

| 模块 | 方法 |
| --- | --- |
| `client.ts` | `MaimemoClient`，统一请求、错误映射、限流 |
| `study.ts` | `getStudyProgress`、`getTodayItems`、`queryStudyRecords`、`addWords`、`advanceStudy` |
| `vocabulary.ts` | `queryVocabulary`、`lookupSpelling` |
| `interpretations.ts` | `list` / `create` / `update` / `remove` |
| `phrases.ts` | 同上 |
| `notes.ts` | 同上 |
| `notepads.ts` | `list` / `create` / `get` / `update` / `remove` |
| `errors.ts` | 错误类型映射 |
| `time.ts` | UTC+8 日期转换 |

**必须遵守的解析规则**：

```ts
// 1. 所有响应统一包裹层
interface Envelope<T>
{
  errors: ApiError[]
  data: T
  success: boolean
}

// 2. Vocabulary 只有两个字段
interface Vocabulary
{
  id: string
  spelling: string
}

// 3. tags 是字符串数组，不是枚举字符串
interface StudyRecord
{
  voc_id: string
  voc_spelling: string
  study_count: number        // 每日最多计入 1 次
  tags: StudyRecordTag[]     // 'STICKING' | 'WELL_FAMILIAR'
  last_response?: StudyResponse
  next_study_date?: string
}
```

**限流**：进程内令牌桶，遵守 C9（10s/20、60s/40、5h/2000）。接近阈值时排队等待，不直接抛错。

**错误映射**：

| 情况 | 处理 |
| --- | --- |
| HTTP 401 / `common_unauthorized` | 抛 `MaimemoAuthError`，标记 Token 为 `INVALID` |
| HTTP 429 | 退避重试，非写操作最多 3 次 |
| 网络错误 | 抛 `MaimemoNetworkError` |
| 学习数据接口不可用 | 抛 `MaimemoStudyUnavailableError`，触发降级（C2） |

### 7.2 `packages/ai` — DeepSeek 封装

使用 OpenAI SDK，改 `baseURL`。

**prompt 组织（关键，影响成本）**：

```text
┌────────────────────────────┬──────────────┐
│ 系统提示 + 格式要求 + 示例    │  可变参数      │
│ （固定部分，放在最前面）      │ （单词等）     │
└────────────────────────────┴──────────────┘
        ↑ 自动命中 DeepSeek 上下文缓存
```

固定部分必须前置，否则缓存无法命中，成本上升数倍。

**模型分配**：

| 场景 | 模型 |
| --- | --- |
| 释义 / 例句 / 助记生成、文本生词提取、主题分类 | `deepseek-chat` |
| 遗忘原因推测、易混词深度对比 | `deepseek-reasoner` |
| AI 问词（交互式流式） | `deepseek-chat` |

**JSON 输出注意**：使用 `response_format: { type: 'json_object' }` 时，prompt 中**必须**出现 "json" 字样并给出格式示例，否则可能返回空内容。校验失败要区分「未返回 JSON」与「字段错误」，前者重试，后者降级。

**必须定义的枚举**：

```ts
// 遗忘原因（用于分类统计，必须是固定枚举）
type ForgetReason =
  | 'SPELLING_SIMILAR'      // 拼写相似
  | 'ABSTRACT_MEANING'      // 词义抽象
  | 'RARE_SENSE'            // 熟词僻义
  | 'CN_MEANING_CONFLICT'   // 中文释义混淆
  | 'COLLOCATION_WEAK'      // 搭配不熟
  | 'ROOT_DIVERGENCE'       // 词根相同但含义分叉
  | 'LACK_CONTEXT'          // 缺少真实语境

// 生成场景
type ContentScene =
  | 'CONCISE' | 'EXAM' | 'WORK' | 'TECH' | 'PAPER' | 'CONTRAST'
```

**成本记录**：每次调用写入 `ai_generations`，记录 token 消耗。

### 7.3 `packages/db`

- Drizzle schema 按表拆分为独立文件。
- 迁移文件放 `packages/db/migrations/`。
- 导出统一的 `db` 实例与类型。
- 连接串只从 `DATABASE_URL` 读取；数据库仅监听 `127.0.0.1`。

### 7.4 `packages/core`

业务逻辑，只在服务器运行。

| 模块 | 职责 |
| --- | --- |
| `auth/` | 微信登录换 session、session 校验 |
| `crypto.ts` | 已实现，Token 加解密（见 `apps/server/src/security/crypto.ts`） |
| `quota.ts` | 每日 600 条配额记账与重置（C4） |
| `similarity.ts` | 编辑距离、形近词发现（C6 的本地算法部分） |
| `diagnose.ts` | 遗忘词诊断编排 |
| `confusion.ts` | 易混词分析编排 |
| `content.ts` | 内容生成与写入编排 |
| `notepad.ts` | 云词本读改写与乐观锁（C11） |

**配额记账规格**：

```ts
// 校验与扣减必须原子，避免并发超额（C4）
async function consumeQuota(userId: string, count: number): Promise<void>
{
  // 1. 若 quota_reset_date 不是今天 → 重置为 0 并更新日期
  // 2. 若 daily_quota_used + count > 600 → 抛 QuotaExceededError
  // 3. 否则累加
  // 使用数据库事务 + FOR UPDATE 行锁
}
```

### 7.5 `apps/server/src/http` — API 层

**统一响应格式**：

```ts
// 成功
{ "data": { ... } }

// 失败
{ "error": { "code": "string", "message": "中文可读文案" } }
```

**错误码规范**：

| code | HTTP | 说明 |
| --- | --- | --- |
| `unauthorized` | 401 | 未登录 |
| `maimemo_token_invalid` | 401 | 墨墨 Token 失效，需重绑（C10） |
| `maimemo_unavailable` | 503 | 墨墨接口不可用，前端应展示降级提示（C2） |
| `permission_denied` | 403 | 对应写入权限未开启 |
| `quota_exceeded` | 429 | 配额用尽（C4） |
| `rate_limited` | 429 | 触发频控（C9） |
| `not_found` | 404 | — |
| `validation_failed` | 400 | Zod 校验失败 |
| `internal_error` | 500 | — |

**中间件顺序**：请求日志 → 会话校验 → 路由 → 统一错误处理。

### 7.6 `apps/server/src/worker` — 队列

**状态机**：

```text
PENDING → RUNNING → DONE
              ↓
           FAILED → （重试）→ RUNNING
              ↓ 超过 3 次
           SKIPPED
```

**处理单条任务的顺序**：

```text
1. 检查用户写入权限开关（未开启 → SKIPPED + 记录原因）
2. 检查当日剩余配额（不足 → 任务暂停，等次日续跑）
3. 调 AI 生成内容
4. Zod 校验 AI 输出（失败 → 重试一次 → 仍失败则 FAILED）
5. 解密用户 Token
6. 调墨墨写入接口
7. 更新任务状态，记账配额
8. 限流等待（遵守 C9）
```

**并发**：全局 `WORKER_CONCURRENCY`（默认 1），进程内串行调度。

### 7.7 `apps/server/src/scheduler` — 定时任务

| 任务 | cron | 说明 |
| --- | --- | --- |
| `daily-snapshot` | `0 10 0 * * *` | 采集所有 ACTIVE 用户的今日进度，写 `daily_study_snapshots`；采集不到或不可信时 `is_reliable = false` |
| `queue-resume` | `0 30 0 * * *` | 新的一天配额恢复，把 `PAUSED` 任务改回 `PENDING` |
| `token-check` | `0 0 8 * * *` | 检查 Token 是否临近 7 天有效期（C10） |
| `forget-accumulate` | `0 40 23 * * *` | 汇总当日遗忘事件到 `forget_events` |
| `weekly-report` | `0 0 9 * * 1` | 生成上周周报 |

**必须串行 + 限流**：快照任务是逐个用户调用墨墨接口，必须遵守 C9。

### 7.8 Token 加解密

已在 `apps/server/src/security/crypto.ts` 实现，规格：

- 算法：AES-256-GCM
- 每次写入生成新 IV（12 字节）
- 以 `user_id` 作为 AAD，防止密文跨用户替换
- 主密钥从 `MAIMEMO_TOKEN_KEY` 读取（base64，32 字节）

---

## 8. API 端点清单

所有端点以 `/api` 为前缀（约定 4.3.3）。除 `/api/health` 外均需登录。

### 8.1 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/wechat/web` | Web 扫码登录，code 换 session |
| POST | `/api/auth/wechat/mp` | 小程序 `wx.login` code 换 session |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |

### 8.2 墨墨连接（FR-1）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/maimemo/token` | 绑定 Token（校验通过才落库，AC-1.2） |
| GET | `/api/maimemo/token` | Token 状态与剩余有效期（C10） |
| DELETE | `/api/maimemo/token` | 解绑，物理删除凭据 |
| GET | `/api/maimemo/permissions` | 读写入权限 |
| PUT | `/api/maimemo/permissions` | 更新写入权限 |

### 8.3 今日看板（FR-2）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard/today` | 今日进度 + 词表聚合 |
| POST | `/api/dashboard/refresh` | 强制刷新（跳过缓存） |

**响应字段**：`total` / `finished` / `remaining` / `studyTimeMs` / `completionRate` / `newWords` / `reviewWords` / `unfinishedWords` / `forgottenWords` / `focusWords` / `dataReliable` / `capturedAt`

`total = 0` 时 `completionRate` 返回 `null`（AC-2.3）。

### 8.4 遗忘词分析（FR-3）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/forget/today` | 今日遗忘词 |
| GET | `/api/forget/range?days=7\|30` | 区间遗忘词（**近似**，响应须带 `approximate: true` 与说明文案，AC-3.2） |
| GET | `/api/forget/sticking` | 顽固词（`tags` 含 `STICKING`） |
| GET | `/api/forget/frequent` | 高频遗忘词（依赖 `forget_events`） |
| POST | `/api/forget/diagnose` | 遗忘原因诊断（AI，返回固定枚举） |
| POST | `/api/forget/notepad` | 加入顽固词本 |
| POST | `/api/forget/advance` | 提前复习（C5，失败需区分「等级不足」与「接口不可用」） |

### 8.5 易混词诊断（FR-4）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/confusion/candidates?vocId=` | 形近词候选（本地编辑距离） |
| POST | `/api/confusion/analyze` | AI 对比分析（对比解释 + 对比例句） |
| POST | `/api/confusion/notepad` | 加入易混词本 |

**注意**：候选词只能从**已知词集合**（今日词表 / 学习记录 / 用户词本）中计算，响应必须带 `scannedWordCount`（AC-4.3）。

### 8.6 AI 问词（FR-5）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/ask` | 流式问答（SSE），Content-Type: `text/event-stream` |

问答需结合真实学习数据（`study_count` / `tags` / `last_response`），不得编造（AC-5.3）。

### 8.7 内容生成与写入（FR-6 / 7 / 8）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/content/generate` | 单条生成（同步返回，不落库） |
| POST | `/api/content/jobs` | 批量生成任务，入队，立即返回 `jobId` |
| GET | `/api/content/jobs` | 任务列表 |
| GET | `/api/content/jobs/:id` | 任务进度（已写 / 剩余配额 / 待执行） |
| POST | `/api/content/jobs/:id/cancel` | 取消任务 |
| POST | `/api/content/write` | 将生成结果写入墨墨 |
| GET | `/api/content/written?type=` | 已写入内容列表 |
| DELETE | `/api/content/written/:type/:id` | 删除已写入内容 |

**写入前必须校验权限开关**（AC-6.1）；超额时返回明确文案，不静默失败（AC-6.3）。

### 8.8 云词本（FR-9）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/notepads` | 词本列表 |
| POST | `/api/notepads` | 创建 |
| GET | `/api/notepads/:id` | 详情（含容错解析后的词表，C13） |
| PUT | `/api/notepads/:id` | 更新（全字段 + 乐观锁，C11） |
| DELETE | `/api/notepads/:id` | 删除 |
| POST | `/api/notepads/:id/words` | 追加单词 |
| DELETE | `/api/notepads/:id/words` | 批量移除（GET → 修改 → 整体覆盖，C8） |
| POST | `/api/vocabulary/lookup` | 批量查词是否存在（判断 `data.voc`，C12） |
| POST | `/api/study-plan/add` | 批量加入学习计划（单次上限 1000，超出自动分批） |
| POST | `/api/notepads/merge` | 合并词本 |
| POST | `/api/notepads/:id/split` | 拆分词本 |

**禁止**：提供「删除词本中单个单词」的独立入口（C8），也不得提供「从学习计划移除单词」（C7）。

### 8.9 文本生词提取（FR-10）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/extract` | 提交文本，返回候选词表（**不直接落库**，供用户编辑，AC-10.1） |

### 8.10 学习计划辅助（FR-11）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/plan/summary` | 计划总词数（`as_count`） |
| GET | `/api/plan/pressure?days=7` | 未来复习压力 |
| GET | `/api/plan/advice` | AI 建议（必须附带数据依据，AC-11.2） |
| POST | `/api/plan/add-and-review` | 加词并立即复习（`add_words` 的 `advance`，不受等级限制） |

### 8.11 复盘与报告（FR-12 / 13）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/review/daily?date=` | 每日复盘 |
| POST | `/api/review/daily/generate` | 生成复盘（当日数据不可用则拒绝，AC-12.1） |
| GET | `/api/reports/weekly` | 周报 |
| GET | `/api/reports/monthly` | 月报 |

报告响应必须带 `dataCompleteness`，低于 0.7 时前端需提示（AC-13.1）。

### 8.12 词云（FR-16）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/wordcloud?view=&range=` | 词云数据 |

参数：

- `view`：`DIFFICULTY`（默认）/ `PROGRESS` / `STRUCTURE`
- `range`：`TODAY` / `DAYS_7` / `DAYS_30` / `ALL`
- `groupBy`：`INITIAL` / `THEME` / `ROOT`（仅 `STRUCTURE` 视角有效）

响应必须包含：

```ts
{
  view: string
  words: { text: string, weight: number, state: string, group?: string }[]
  totalScanned: number      // 扫描了多少词（AC-16.1）
  truncated: boolean        // 是否截断为 Top N（AC-16.5）
  legend: { size: string, color: string }  // 图例文案（AC-16.2）
}
```

### 8.13 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（免登录） |
| GET | `/api/system/quota` | 当日配额使用情况 |
| GET | `/api/system/tasks` | 队列与定时任务状态 |

---

## 9. 前端规格（`apps/web`）

> **视觉与交互规格见 `docs/ui-design-spec.md`，设计上下文见根目录 `.impeccable.md`。**
> 本节只定义结构与数据行为；界面长什么样、用什么颜色字号、交互如何反馈，一律以 `ui-design-spec.md` 为准。

### 9.1 基础

- Next.js 16，`output: 'export'`（静态导出，产物由 Nginx 托管）。
- 路由：App Router。
- 数据请求：TanStack Query，所有请求经 `packages/api-client`。
- 本地状态：Zustand（仅存 UI 状态与筛选条件）。
- 组件：shadcn/ui。

### 9.2 页面清单

| 路由 | 页面 | 对应需求 |
| --- | --- | --- |
| `/` | 今日看板 | FR-2 |
| `/connect` | 绑定墨墨 Token | FR-1 |
| `/forget` | 遗忘词分析 | FR-3 |
| `/confusion` | 易混词诊断 | FR-4 |
| `/ask` | AI 问词 | FR-5 |
| `/content` | 内容生成与管理 | FR-6 / 7 / 8 |
| `/notepads` | 云词本管理 | FR-9 |
| `/extract` | 文本生词提取 | FR-10 |
| `/plan` | 学习计划辅助 | FR-11 |
| `/review` | 每日复盘 | FR-12 |
| `/reports` | 周期报告 | FR-13 |
| `/wordcloud` | 学习词云 | FR-16 |
| `/settings` | 权限与设置 | FR-1 |

### 9.3 必须实现的状态

每个数据页面必须处理四种状态：**加载中 / 空数据 / 降级（数据不可信）/ 错误**（AC-14.3、AC-2.2）。

降级状态下必须展示「数据可能不是最新」提示，而非白屏或报错。

### 9.4 词云的视角切换

- 顶部提供视角切换控件（难度 / 进度 / 结构）。
- 切换视角**保留**时间范围与筛选状态（AC-16.3）。
- 每个视角展示自己的图例（AC-16.2）。
- 词数超过 200 时截断为 Top N 并提示（AC-16.5）。

---

## 10. 小程序规格（`apps/miniprogram`）

- Taro 4 + React 19 + TypeScript。
- 不承载复杂管理台，超出轻量界定的操作引导跳转 Web（AC-14.1）。
- 不直接持有墨墨 Token，全部经后端代理（4.3.6）。

### 10.1 页面清单

| 页面 | 对应需求 | 优先级 |
| --- | --- | --- |
| 今日进度 | FR-14.1 | P0 |
| 今日遗忘词 | FR-14.2 | P0 |
| AI 问词 | FR-14.3 | P0 |
| 手动添加单词 | FR-14.6 | P0 |
| 一键加入云词本 | FR-14.8 | P0 |
| 一键加入学习计划 | FR-14.9 | P0 |
| 易混词解释 | FR-14.4 | P1 |
| 每日复盘 | FR-14.5 | P1 |
| 粘贴文本提取生词 | FR-14.7 | P1 |
| 一键查看顽固词 | FR-14.10 | P1 |
| 一键查看今日重点词 | FR-14.11 | P1 |
| 学习词云（轻量版） | FR-14.12 | P2 |

---

## 11. 降级矩阵

所有依赖外部数据的场景都必须有降级路径。

| 场景 | 触发条件 | 降级行为 |
| --- | --- | --- |
| 学习数据不可用 | 墨墨公测接口报错（C2） | 展示最近一次快照 + 标注时间 + 提示「可能不是最新」 |
| 学习数据不可信 | 用户当日未打开墨墨 App | `is_reliable = false`，看板正常展示但标注；复盘拒绝生成（AC-12.1） |
| 快照缺失 | 定时任务漏采 | 周报顶部提示「数据不完整」，完整度 < 0.7 时标注 |
| Token 过期 | 401（C10） | 标记 `EXPIRED`，引导重新绑定；不重复重试 |
| 配额用尽 | 当日 600 条用完（C4） | 提示「剩余 N 条将于明日执行」，任务转 `PAUSED` |
| 频控触发 | 429（C9） | 排队等待，不直接失败 |
| AI 输出不合规 | Zod 校验失败 | 重试 1 次 → 仍失败则标记 `FAILED`，给出可读原因 |
| 云词本内容不规范 | 解析失败（C13） | 降级为原文展示，不抛异常 |
| 提前复习等级不足 | 调用失败（C5） | 提示等级不足，并推荐改用「加词并立即复习」 |
| 词云数据不可用 | 接口失败 | 展示上次缓存结果 + 标注时间（AC-16.6） |

---

## 12. 任务清单（按依赖顺序执行）

**执行规则**：一次只做一个任务，完成后自测通过再进入下一个。每个任务的验收标准见第 13 章。

### 阶段一：基础设施

| 编号 | 任务 | 交付物 |
| --- | --- | --- |
| T01 | 校验 workspace | `pnpm install` 通过，`pnpm -r typecheck` 无报错 |
| T02 | 准备 PostgreSQL | 复用宝塔 PG 18 实例：建 `momo` 用户与 `momohelper` 库，`127.0.0.1:5432` 连通，调参生效 |
| T03 | 实现 `packages/types` | 共享类型定义（API 请求响应、枚举） |
| T04 | 实现 `packages/db` | Drizzle schema（13 张表）+ 首个迁移 + `db` 实例 |
| T05 | 完善 `apps/server` 骨架 | 环境变量校验、健康检查、优雅关闭可用 |

### 阶段二：墨墨对接

| 编号 | 任务 | 交付物 |
| --- | --- | --- |
| T06 | 实现 `packages/maimemo` 客户端 | 统一请求、包裹层解析、错误映射、进程内限流 |
| T07 | 实现 study / vocabulary 模块 | 今日进度、今日词表、学习记录、加词、单词查询 |
| T08 | 实现内容类模块 | interpretations / phrases / notes / notepads |
| T09 | 实现 `packages/core/auth` | 微信登录、session |
| T10 | 实现 Token 绑定链路（FR-1） | 8.2 全部端点 + 加解密落库 |

### 阶段三：MVP 功能

| 编号 | 任务 | 交付物 |
| --- | --- | --- |
| T11 | 今日看板（FR-2） | `GET /api/dashboard/today` + 降级逻辑 |
| T12 | 快照定时任务（FR-15.1） | `daily-snapshot` 可用，`is_reliable` 正确 |
| T13 | 今日遗忘词 + 顽固词（FR-3.1 / 3.5） | 对应端点 |
| T14 | 形近词发现（FR-4.1~4.3） | 编辑距离算法 + 候选端点 |
| T15 | `packages/ai` 客户端 + prompt 骨架 | DeepSeek 调用、Zod 校验、成本记录 |
| T16 | AI 问词（FR-5） | SSE 流式端点 |
| T17 | 云词本 CRUD（FR-9.1~9.3、9.8、9.9） | 创建/更新/查词/批量加词 + 乐观锁 |
| T18 | Web 前端骨架 | Next.js 初始化、API client、布局、路由 |
| T19 | Web 看板 + 绑定页面 | FR-1 / FR-2 页面 |
| T20 | 小程序骨架 + 核心页面 | FR-14.1 ~ 14.3、14.6、14.8、14.9 |

### 阶段四：内容生成与复盘

| 编号 | 任务 | 交付物 |
| --- | --- | --- |
| T21 | 配额记账（`core/quota`） | 事务 + 行锁，并发不超额 |
| T22 | 队列 Worker | 状态机、并发控制、断点续传 |
| T23 | 单条内容生成（FR-6.1~6.9） | 释义生成 + 写入 |
| T24 | 例句生成（FR-7） | 含 `highlight` 区间校验（`end` 为开区间） |
| T25 | 助记生成（FR-8） | 含 `note_type` 映射 |
| T26 | 批量生成任务队列（FR-6.10） | 分天执行、进度可视化、失败重试 |
| T27 | 遗忘原因诊断（FR-3.6~3.9） | 固定枚举 + 分类聚合 |
| T28 | 文本生词提取（FR-10） | 候选词表 + 分类 |
| T29 | 学习计划辅助（FR-11） | 总词数、压力、建议、加词并复习 |
| T30 | 每日复盘（FR-12） | 生成 + 落库 + 去重 |
| T31 | 易混词 AI 分析（FR-4.4~4.11） | 对比解释、对比例句、写入助记 |
| T32 | 词云基础版（FR-16.1~16.9） | 难度/进度视角 + 切换 + 联动 |
| T33 | 遗忘事件累积（FR-15.5） | `forget-accumulate` 任务 |

### 阶段五：趋势与增强

| 编号 | 任务 | 交付物 |
| --- | --- | --- |
| T34 | 周报 / 月报（FR-13） | 趋势聚合 + 完整度标注 |
| T35 | 词云结构视角（FR-16.10~16.12） | 首字母 → 主题 → 词根 |
| T36 | 词本合并 / 拆分 / 标签（FR-9.11~9.13） | 整体覆盖实现 |
| T37 | 提前复习相关（FR-3.10、FR-9.10、FR-11.7） | 含等级不足降级 |
| T38 | 小程序扩展页面（FR-14.4 等） | — |

---

## 13. 自测与验收

### 13.1 每个任务的通用自测

1. `pnpm -r typecheck` 无错误。
2. 新增接口有 Zod 校验，非法输入返回 400 且文案可读。
3. 涉及外部调用的路径，手动验证降级行为（可临时改错 Token / 断网）。
4. 涉及写入的操作，验证幂等（重复提交不产生重复数据）。
5. 无 `console.log` 残留（改用日志模块）。

### 13.2 关键验收点

| 编号 | 验收内容 |
| --- | --- |
| AC-A | 未开启写入权限时，所有写入接口返回 `permission_denied` |
| AC-B | 查询不存在的拼写返回「未收录」，不是报错也不是错误结果（C12） |
| AC-C | 批量加词超过 1000 时自动分批，`added_count` 汇总正确 |
| AC-D | 并发更新同一云词本不丢内容（C11） |
| AC-E | 云词本非规范 `content` 解析不抛异常（C13） |
| AC-F | 学习数据接口报错时看板降级而非白屏（C2） |
| AC-G | `total = 0` 时完成率返回 `null` 而非异常（AC-2.3） |
| AC-H | 日期展示为北京时间（C14） |
| AC-I | 配额并发消耗不超额（C4） |
| AC-J | 所有时间字段在 UI 上按 UTC+8 渲染 |

### 13.3 MVP 上线标准

1. 用户能绑定 Token 并看到准确的今日看板。
2. 今日遗忘词可正确取出并触发 AI 诊断。
3. 易混词诊断对 `affect / effect`、`adapt / adopt / adept` 给出可读的对比解释与对比例句。
4. 诊断结果可一键加入云词本，且内容在墨墨 App 可见。
5. 批量加词超过 1000 时正确分批。
6. 未开启写入权限时所有写入被拦截。
7. 学习数据接口不可用时页面降级而非报错。

---

## 14. 禁止事项（Guardrails）

违反以下任一条视为实现错误。

### 14.1 架构

- 不得引入 Redis、消息队列中间件、微服务拆分。
- 不得把墨墨 Token 下发给前端或小程序。
- 不得让前端直连数据库。
- 不得在 `packages/maimemo` 之外发起墨墨 API 调用。
- 不得新增顶层目录。
- 不得让 Web 前端直连服务器 IP（必须用域名配置）。

### 14.2 功能

- 不得模拟用户在墨墨中的「认识 / 模糊 / 忘记」操作。
- 不得提供「从学习计划移除单词」的入口（C7）。
- 不得提供「删除云词本中单个单词」的入口（C8）。
- 不得无条件承诺提前复习能力（C5）。
- 不得宣称能读取墨墨官方词库（C1）。

### 14.3 实现

- 不得跳过 Zod 校验直接使用 AI 输出。
- 不得跳过权限开关直接写入墨墨。
- 不得在批量写入时同步等待完成（必须入队）。
- 不得在业务代码中直接访问 `remoteAddress`。
- 不得把主密钥、Token 明文写入日志。
- 不得用 `success` 字段判断单词是否存在（C12）。
- 不得对 `voc_id` / `notepad_id` 的格式做任何假设。

### 14.4 AI 相关

- 不得把 prompt 散落在路由或页面中，必须封装在 `packages/ai`。
- 不得把可变内容放在 prompt 开头（破坏缓存命中）。
- 不得把 AI 推测的结论（词根、发音相似）当作确定事实展示，必须标注「推测」（C6）。

---

## 15. 参考索引

| 需要查证 | 查阅 |
| --- | --- |
| **界面视觉、组件、交互状态** | `ui-design-spec.md` |
| **设计上下文与调性** | 根目录 `.impeccable.md` |
| 某功能的详细需求与验收标准 | `Maimemo-AI-Study-Copilot-PRD.md` 对应 FR 编号 |
| 墨墨 API 字段与实测结论 | `api-capability-gap.md` |
| 部署、调参、编码约定 | `architecture.md` |
| 技术选型与版本 | `tech-stack.md` |
| 墨墨接口用法示例 | `.codebuddy/skills/memo-api/`（**注意**：该技能文档已知 4 处与线上不符，以 `api-capability-gap.md` 第七节实测记录为准） |
