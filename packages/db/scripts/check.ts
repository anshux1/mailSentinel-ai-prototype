import { sql } from "drizzle-orm";

import { db, pool } from "../src/client";

try {
	await db.execute(sql`select 1`);
	console.log("Database connection is healthy.");
} finally {
	await pool.end();
}
