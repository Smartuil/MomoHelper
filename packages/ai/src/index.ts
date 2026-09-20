/**
 * AI 能力封装（DeepSeek）。
 *
 * 约定：
 * - prompt、模型调用、输出 schema 统一在此封装，不散落到路由或页面。
 * - prompt 的固定部分放在前面，以提升 DeepSeek 上下文缓存命中率。
 * - 所有输出经 Zod 校验后才允许落库。
 * - 仅允许在服务器运行。
 */
export {}
