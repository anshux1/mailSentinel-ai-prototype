import { eq } from "drizzle-orm";

import { db, type Database } from "../client";
import { organizations } from "../schema";
import type { TenantScope } from "./types";

export async function getOrganizationForScope(
	scope: TenantScope,
	database: Database = db,
): Promise<typeof organizations.$inferSelect | null> {
	const [organization] = await database
		.select()
		.from(organizations)
		.where(eq(organizations.id, scope.organizationId))
		.limit(1);

	return organization ?? null;
}
