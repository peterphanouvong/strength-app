import { z } from 'zod';

export const TrackingSchema = z.enum(['weighted', 'reps', 'time']);

// Payload exercises may carry an optional id — present means "this is an
// existing exercise keeping its identity (and its set logs)".
export const ExercisePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  sets: z.number().int().min(1).max(20),
  reps: z.string().min(1),
  load: z.string().optional(),
  notes: z.string().optional(),
  tracking: TrackingSchema,
  restSec: z.number().int().min(0).max(900),
});

export const DayPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  exercises: z.array(ExercisePayloadSchema).min(1).max(12),
});

export const WeekPayloadSchema = z.object({
  block: z.string().min(1),
  blockNote: z.string(),
  focus: z.string(),
  jumpsNote: z.string(),
  days: z.array(DayPayloadSchema).min(1).max(7),
});

const ExercisePatchSchema = z.object({
  name: z.string().min(1).optional(),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.string().min(1).optional(),
  load: z.string().optional(),
  notes: z.string().optional(),
  tracking: TrackingSchema.optional(),
  restSec: z.number().int().min(0).max(900).optional(),
});

export const EditOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-exercise'), exerciseId: z.string(), patch: ExercisePatchSchema }),
  z.object({
    type: z.literal('add-exercise'),
    dayId: z.string(),
    index: z.number().int().min(0).optional(),
    exercise: ExercisePayloadSchema.omit({ id: true }).strict(),
  }),
  z.object({ type: z.literal('remove-exercise'), exerciseId: z.string() }),
  z.object({ type: z.literal('reorder-exercise'), exerciseId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('update-day'), dayId: z.string(), patch: z.object({ title: z.string().min(1) }) }),
  z.object({ type: z.literal('replace-day'), dayId: z.string(), day: DayPayloadSchema }),
  z.object({
    type: z.literal('add-day'),
    weekId: z.string(),
    index: z.number().int().min(0).optional(),
    day: DayPayloadSchema.omit({ id: true }).strict(),
  }),
  z.object({ type: z.literal('remove-day'), dayId: z.string() }),
  z.object({ type: z.literal('move-day'), dayId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({
    type: z.literal('update-week'),
    weekId: z.string(),
    patch: z.object({
      block: z.string().min(1).optional(),
      blockNote: z.string().optional(),
      focus: z.string().optional(),
      jumpsNote: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal('replace-week'), weekId: z.string(), week: WeekPayloadSchema }),
  z.object({ type: z.literal('remove-week'), weekId: z.string() }),
  z.object({ type: z.literal('update-programme'), patch: z.object({ name: z.string().min(1) }) }),
  z.object({ type: z.literal('append-weeks'), weeks: z.array(WeekPayloadSchema).min(1).max(16) }),
]);

export type EditOp = z.infer<typeof EditOpSchema>;

export const EditOpsSchema = z.array(EditOpSchema).min(1).max(50);

export const ProposeEditsInputSchema = z.object({
  summary: z.string().min(1).max(500),
  ops: EditOpsSchema,
});
export type ProposeEditsInput = z.infer<typeof ProposeEditsInputSchema>;

/** JSON Schema for the Claude `propose_edits` tool — generated from the same source of truth. */
export function proposeEditsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ProposeEditsInputSchema) as Record<string, unknown>;
}
