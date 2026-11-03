// Public API of the extraction agent. Callers (CLI, web app, background job) import only from here.
export { extractContract, DEFAULTS, type ExtractOptions, type ExtractOutcome, type RunRecord } from "./extract.ts";
export type { EngineName, Effort, Usage } from "./engines/types.ts";
export type { FieldCheck, QuoteStatus } from "./verify.ts";
export { ExtractionResult, fieldNames, type FieldName } from "./fields.ts";
export { PROMPT_VERSION } from "./prompt.ts";
export { checkIntake, type IntakeResult, type IntakeRejection } from "./intake.ts";
