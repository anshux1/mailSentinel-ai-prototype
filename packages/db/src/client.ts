import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type DatabaseGlobals = {
	pool?: Pool;
	db?: Database;
};

const globals = globalThis as typeof globalThis & { __mailsentinelDb?: DatabaseGlobals };
const databaseGlobals = globals.__mailsentinelDb ?? {};
const databaseUrl = getDatabaseUrl();

export const pool =
	databaseGlobals.pool ??
	new Pool({
		connectionString: databaseUrl,
		max: 10,
		connectionTimeoutMillis: 5_000,
		idleTimeoutMillis: 30_000,
	});

export const db = databaseGlobals.db ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
	globals.__mailsentinelDb = { pool, db };
}
