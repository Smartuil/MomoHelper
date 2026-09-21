export { AiClient } from './client.js'
export type {
  AiModel,
  AiClientOptions,
  ChatMessage,
  CompletionParams,
  CompletionResult
} from './client.js'
export {
  confusionResultSchema,
  forgetReasonSchema,
  analyzeConfusion,
  diagnoseForget,
  buildAskMessages
} from './tasks.js'
export type {
  ConfusionResult,
  ForgetDiagnosis,
  ForgetDiagnosisInput,
  AskContext
} from './tasks.js'
