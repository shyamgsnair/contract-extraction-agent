import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  casing: "snake_case", // camelCase in TypeScript, snake_case columns in Postgres
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
