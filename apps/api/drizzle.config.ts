import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations, which wrangler applies to D1
// (`pnpm db:migrate:local` / `pnpm db:migrate:remote`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/adapters/store-d1/schema.ts",
  out: "./migrations",
});
