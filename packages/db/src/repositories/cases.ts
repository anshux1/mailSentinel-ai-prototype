import { and, count, desc, eq } from "drizzle-orm";

import { db, type Database } from "../client";
import { cases, type CasePriority, type CaseStatus } from "../schema";
import type { TenantScope } from "./types";

export interface CaseListFilters {
	status?: CaseStatus;
	priority?: CasePriority;
	limit?: number;
}

export interface CaseProjection {
	id: string;
	caseNumber: string;
	title: string;
	status: CaseStatus;
	priority: CasePriority;
	createdAt: Date;
	updatedAt: Date;
}

function caseConditions(scope: TenantScope, filters: CaseListFilters = {}) {
	return and(
		eq(cases.organizationId, scope.organizationId),
		filters.status ? eq(cases.status, filters.status) : undefined,
		filters.priority ? eq(cases.priority, filters.priority) : undefined,
	);
}

const caseProjection = {
	id: cases.id,
	caseNumber: cases.caseNumber,
	title: cases.title,
	status: cases.status,
	priority: cases.priority,
	createdAt: cases.createdAt,
	updatedAt: cases.updatedAt,
};

export async function listCases(
	scope: TenantScope,
	filters: CaseListFilters = {},
	database: Database = db,
): Promise<CaseProjection[]> {
	const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
	return database
		.select(caseProjection)
		.from(cases)
		.where(caseConditions(scope, filters))
		.orderBy(desc(cases.createdAt))
		.limit(limit);
}

export async function getCase(
	scope: TenantScope,
	caseId: string,
	database: Database = db,
): Promise<CaseProjection | null> {
	const [caseRecord] = await database
		.select(caseProjection)
		.from(cases)
		.where(and(eq(cases.id, caseId), eq(cases.organizationId, scope.organizationId)))
		.limit(1);

	return caseRecord ?? null;
}

export async function countCases(scope: TenantScope, database: Database = db): Promise<number> {
	const [result] = await database
		.select({ value: count() })
		.from(cases)
		.where(eq(cases.organizationId, scope.organizationId));

	return result?.value ?? 0;
}
