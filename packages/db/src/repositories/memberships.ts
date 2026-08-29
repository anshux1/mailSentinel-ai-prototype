import { eq } from "drizzle-orm";

import { db, type Database } from "../client";
import { organizationMembers, organizations, type OrganizationRole } from "../schema";

export interface MembershipRecord {
	id: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	userId: string;
	role: OrganizationRole;
}

export async function listMembershipsForUser(userId: string, database: Database = db): Promise<MembershipRecord[]> {
	return database
		.select({
			id: organizationMembers.id,
			organizationId: organizations.id,
			organizationName: organizations.name,
			organizationSlug: organizations.slug,
			userId: organizationMembers.userId,
			role: organizationMembers.role,
		})
		.from(organizationMembers)
		.innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
		.where(eq(organizationMembers.userId, userId));
}
