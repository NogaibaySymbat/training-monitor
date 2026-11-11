export type MetricKey = 'loss' | 'lr' | 'grad_norm';

export type RunStatus = 'running' | 'completed' | 'failed';

export type RunScenario =
  | 'clean'
  | 'non-finite'
  | 'duplicates'
  | 'unsorted'
  | 'gaps'
  | 'million-spike'
  | 'zero-loss'
  | 'diverging';

export interface RunDefinition {
  id: string;
  name: string;
  status: RunStatus;
  scenario: RunScenario;
  seed: number;
  pointCount: number;
  startedAt: string;
  updatedAt: string;
}

export interface RunData {
  runId: string;
  expectedStepInterval: number;
  step: Float64Array;
  loss: Float64Array;
  lr: Float64Array;
  grad_norm: Float64Array;
}