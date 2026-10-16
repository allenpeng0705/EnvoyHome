// @envoyhome/workflows — static workflow executor (B9). DAG with linear compat.

export {
  assertSingleTriggerClass,
  assertValidWhen,
  compileWorkflowGraph,
  loadWorkflows,
  mergeWorkflows,
  parseWorkflowFile,
  triggerClasses,
  validateWorkflowYaml,
  workflowCanActuate,
  workflowToYaml,
  type TriggerClass,
  type WorkflowDef,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowStepType,
} from "./loader.js";

export {
  matchEventWorkflow,
  matchKeywordWorkflow,
  matchScheduleWorkflows,
} from "./matcher.js";

export {
  evalWhen,
  executeWorkflow,
  normalizeLlmOutput,
  resolveArgsFrom,
  type LlmRunner,
  type ToolRunner,
  type WorkflowStepHook,
  type WorkflowStepPhase,
  type WorkflowStepResult,
} from "./executor.js";
