/**
 * 墨墨开放 API 封装。
 *
 * 重要：类型定义以真机实测为准，不以 .codebuddy/skills/memo-api 技能文档为准
 * （该文档已发现 4 处与线上不符）。详见 docs/api-capability-gap.md 第七节。
 *
 * 关键约束：
 * - 所有响应统一包裹在 data 中。
 * - Vocabulary 只有 id 与 spelling。
 * - StudyRecord.tags 为字符串数组。
 * - 判断单词是否存在必须判断 data.voc，不能依赖 success。
 * - 日期字段按 UTC+8 日期边界存储，展示前需转换。
 *
 * 只允许在服务器运行，保证墨墨 API 出口唯一（C9 限流成立的前提）。
 */
export {}
