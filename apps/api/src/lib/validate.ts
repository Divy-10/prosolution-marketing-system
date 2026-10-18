import type { z } from "zod";
import { errors } from "./errors.ts";

/** Parses input with a Zod schema and throws a 400 with per-field messages on failure. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (details[key] ??= []).push(issue.message);
  }
  const first = result.error.issues[0];
  throw errors.validation(first ? first.message : "Check the highlighted fields.", details);
}
