import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	insertSyntheticCase,
	insertSyntheticMembership,
	insertSyntheticOrganization,
	insertSyntheticUser,
} from "../test-utils";
import { cases, organizationMembers, organizations, user } from "../schema";

const integrationEnabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!integrationEnabled)("tenant-scoped case repositories", () => {
	let database: Awaited<typeof import("../client")>["db"];
	let pool: Awaited<typeof import("../client")>["pool"];
	let repositories: typeof import("./cases");
	let organizationA: string;
	let organizationB: string;
	let userA: string;
	let userB: string;
	let caseA: string;
	let caseB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
		const client = await import("../client");
		database = client.db;
		pool = client.pool;
		repositories = await import("./cases");

		userA = await insertSyntheticUser(database, { email: `tenant-a-${Date.now()}@example.test` });
		userB = await insertSyntheticUser(database, { email: `tenant-b-${Date.now()}@example.test` });
		organizationA = await insertSyntheticOrganization(database, { name: "Tenant A" });
		organizationB = await insertSyntheticOrganization(database, { name: "Tenant B" });
		await insertSyntheticMembership(database, { organizationId: organizationA, userId: userA, role: "analyst" });
		await insertSyntheticMembership(database, { organizationId: organizationB, userId: userB, role: "analyst" });
		caseA = await insertSyntheticCase(database, { organizationId: organizationA, title: "Tenant A case" });
		caseB = await insertSyntheticCase(database, { organizationId: organizationB, title: "Tenant B case" });
	});

	afterAll(async () => {
		if (!database || !pool) {
			return;
		}
		await database.delete(cases).where(inArray(cases.id, [caseA, caseB]));
		await database
			.delete(organizationMembers)
			.where(inArray(organizationMembers.organizationId, [organizationA, organizationB]));
		await database.delete(organizations).where(inArray(organizations.id, [organizationA, organizationB]));
		await database.delete(user).where(inArray(user.id, [userA, userB]));
		await pool.end();
	});

	it("lists only cases belonging to the supplied tenant scope", async () => {
		const records = await repositories.listCases({ organizationId: organizationA }, {}, database);
		expect(records).toHaveLength(1);
		expect(records[0]?.id).toBe(caseA);
		expect(records[0]?.title).toBe("Tenant A case");
	});

	it("does not retrieve another tenant case by ID", async () => {
		expect(await repositories.getCase({ organizationId: organizationA }, caseB, database)).toBeNull();
		expect(await repositories.getCase({ organizationId: organizationA }, "missing-case", database)).toBeNull();
	});

	it("scopes counts to the tenant", async () => {
		expect(await repositories.countCases({ organizationId: organizationA }, database)).toBe(1);
		expect(await repositories.countCases({ organizationId: organizationB }, database)).toBe(1);
	});

	it("does not allow a client filter to change the tenant predicate", async () => {
		const records = await repositories.listCases(
			{ organizationId: organizationA },
			{ status: "queued", priority: "normal" },
			database,
		);
		expect(records.map((record) => record.id)).toEqual([caseA]);
	});
});
