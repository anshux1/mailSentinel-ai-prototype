import { randomUUID } from "node:crypto";

import type { Database } from "./client";
import { cases, organizationMembers, organizations, user } from "./schema";
import type { CasePriority, CaseStatus, OrganizationRole } from "./schema";

export async function insertSyntheticUser(
	database: Database,
	input: { id?: string; email: string; name?: string },
): Promise<string> {
	const id = input.id ?? `user_test_${randomUUID()}`;
	const now = new Date();
	await database.insert(user).values({
		id,
		name: input.name ?? "Synthetic Test User",
		email: input.email,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	return id;
}

export async function insertSyntheticOrganization(
	database: Database,
	input: { id?: string; name?: string; slug?: string },
): Promise<string> {
	const id = input.id ?? `org_test_${randomUUID()}`;
	await database.insert(organizations).values({
		id,
		name: input.name ?? "Synthetic Test Organization",
		slug: input.slug ?? `test-${randomUUID()}`,
	});
	return id;
}

export async function insertSyntheticMembership(
	database: Database,
	input: { organizationId: string; userId: string; role?: OrganizationRole },
): Promise<string> {
	const id = `member_test_${randomUUID()}`;
	await database.insert(organizationMembers).values({
		id,
		organizationId: input.organizationId,
		userId: input.userId,
		role: input.role ?? "viewer",
	});
	return id;
}

export async function insertSyntheticCase(
	database: Database,
	input: {
		organizationId: string;
		id?: string;
		caseNumber?: string;
		title?: string;
		status?: CaseStatus;
		priority?: CasePriority;
	},
): Promise<string> {
	const id = input.id ?? `case_test_${randomUUID()}`;
	const now = new Date();
	await database.insert(cases).values({
		id,
		organizationId: input.organizationId,
		caseNumber: input.caseNumber ?? `TEST-${randomUUID().slice(0, 8)}`,
		title: input.title ?? "Synthetic test case",
		status: input.status ?? "queued",
		priority: input.priority ?? "normal",
		createdAt: now,
		updatedAt: now,
		retentionUntil: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
	});
	return id;
}
