import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle our workspace packages (they ship TypeScript source); keep npm deps external.
  noExternal: [/^@prosolution\//],
});
