import { describe, expect, it } from "vitest";
import { passwordSchema } from "@prosolution/shared";
import { generateTemporaryPassword } from "./api.ts";

describe("temporary passwords", () => {
  it("always satisfy the password policy and are unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(passwordSchema.safeParse(p).success).toBe(true);
      expect(p).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
