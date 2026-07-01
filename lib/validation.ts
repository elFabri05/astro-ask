import { z } from "zod";

const ResolvedPlace = z.object({
  label:     z.string().min(1),
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const BirthDataInput = z.object({
  name:      z.string().min(1).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm"),
  place:     ResolvedPlace,
});

export type BirthDataInputType = z.infer<typeof BirthDataInput>;
