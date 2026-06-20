import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit → Cloudflare D1 (over the HTTP API).
 *
 * `generate` only reads the schema and needs no credentials. `migrate` / `push`
 * / `studio` talk to the live D1 database via the `d1-http` driver, using the
 * Cloudflare creds in .env. `CLOUDFLARE_DATABASE_ID` is printed by
 * `wrangler d1 create skip-desk-db` — paste it into .env after creating the DB.
 */
export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
  // Surface the CHECK constraints + indexes in generated migrations.
  verbose: true,
  strict: true,
})
