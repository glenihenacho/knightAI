import { z } from "zod";

// Windows are same-day spans evaluated in the site's timezone. A range that
// crosses midnight is stored as two windows (e.g. 22:00–24:00 + 00:00–06:00).
// dayOfWeek: 0 = Sunday … 6 = Saturday.
export const ScheduleWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: "endMinute must be after startMinute",
  });

export const ScheduleWindowsSchema = z.array(ScheduleWindowSchema).min(1);

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  label: z.string(),
  windows: ScheduleWindowsSchema,
});

export const CreateScheduleRequestSchema = z.object({
  label: z.string().min(1).max(120),
  windows: ScheduleWindowsSchema,
});

export const UpdateScheduleRequestSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  windows: ScheduleWindowsSchema.optional(),
});

export type ScheduleWindow = z.infer<typeof ScheduleWindowSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;
