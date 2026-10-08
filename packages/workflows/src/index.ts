// @envoyhome/workflows — static workflow executor (B9).

export {
  assertSingleTriggerClass,
  loadWorkflows,
  parseWorkflowFile,
  mergeWorkflows,
  triggerClasses,
  workflowToYaml,
  type TriggerClass,
  type WorkflowDef,
} from "./loader.js";

export {
  matchEventWorkflow,
  matchKeywordWorkflow,
  matchScheduleWorkflows,
} from "./matcher.js";

export {
  executeWorkflow,
  type LlmRunner,
  type ToolRunner,
  type WorkflowStepResult,
} from "./executor.js";
