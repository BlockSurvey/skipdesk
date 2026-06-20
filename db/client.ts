/**
 * D1 client factory for Workers. Bind a D1 database as `DB` in wrangler.toml,
 * then in a Worker:
 *
 *   import { createDb } from '../db/client'
 *   const db = createDb(env.DB)
 *   const rows = await db.query.calls.findMany({ where: ... })
 *
 * `schema` is passed so Drizzle's relational query API (`db.query.*`) works.
 */
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import * as schema from './schema'

export type Db = DrizzleD1Database<typeof schema>

export const createDb = (binding: D1Database): Db => drizzle(binding, { schema })

export { schema }
