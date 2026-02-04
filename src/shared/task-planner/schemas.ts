import { z } from 'zod'

export const CreatePlanSchema = z.object({
  goal: z.string().describe('The goal to accomplish'),
  context: z.record(z.any()).optional().describe('Relevant context information'),
  constraints: z.object({
    maxSteps: z.number().optional().describe('Maximum number of steps (default: 10)'),
    timeout: z.string().optional().describe("Timeout duration, e.g. '1 hour'"),
    parallelize: z.array(z.string()).optional().describe('Step IDs that can run in parallel'),
  }).optional()
})

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>

export const PlanStatusSchema = z.enum([
  'pending',
  'pending_review',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
])

export type PlanStatus = z.infer<typeof PlanStatusSchema>

export const PlanStepStatusSchema = z.enum([
  'todo',
  'doing',
  'done',
  'failed',
  'skipped',
])

export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>

export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: PlanStepStatusSchema,
  dependsOn: z.array(z.string()).optional(),
  tool: z.string().optional(),
  input: z.record(z.any()).optional(),
  output: z.any().optional(),
  error: z.string().optional(),
  notes: z.string().optional(),
})

export type PlanStep = z.infer<typeof PlanStepSchema>

export const PlanSchema = z.object({
  id: z.string(),
  chatUuid: z.string().optional(),
  goal: z.string(),
  context: z.record(z.any()).optional(),
  constraints: CreatePlanSchema.shape.constraints,
  status: PlanStatusSchema,
  steps: z.array(PlanStepSchema),
  currentStepId: z.string().optional(),
  failureReason: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type Plan = z.infer<typeof PlanSchema>
