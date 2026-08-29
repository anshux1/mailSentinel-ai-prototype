import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabaseUrl, getSeedEnvironment } from "./env";

const environmentKeys = [
	"DATABASE_URL",
	"SEED_ORGANIZATION_NAME",
	"SEED_ORGANIZATION_SLUG",
	"SEED_ANALYST_EMAIL",
	"SEED_ANALYST_PASSWORD",
	"SEED_SUPERVISOR_EMAIL",
	"SEED_SUPERVISOR_PASSWORD",
] as const;

describe("database environment", () => {
	const originalValues = new Map<string, string | undefined>();

	beforeEach(() => {
		for (const key of environmentKeys) {
			originalValues.set(key, process.env[key]);
		}
		process.env.DATABASE_URL = "postgresql://mailsentinel:local-password@localhost:5432/mailsentinel";
		process.env.SEED_ORGANIZATION_NAME = "Synthetic Lab";
		process.env.SEED_ORGANIZATION_SLUG = "synthetic-lab";
		process.env.SEED_ANALYST_EMAIL = "analyst@example.test";
		process.env.SEED_ANALYST_PASSWORD = "AnalystLocalPassword!123";
		process.env.SEED_SUPERVISOR_EMAIL = "supervisor@example.test";
		process.env.SEED_SUPERVISOR_PASSWORD = "SupervisorLocalPassword!123";
	});

	afterEach(() => {
		for (const key of environmentKeys) {
			const originalValue = originalValues.get(key);
			if (originalValue === undefined) delete process.env[key];
			else process.env[key] = originalValue;
		}
		originalValues.clear();
	});

	it("accepts a PostgreSQL connection URL", () => {
		expect(getDatabaseUrl()).toContain("postgresql://");
	});

	it("rejects invalid database URLs", () => {
		process.env.DATABASE_URL = "https://not-postgres.example.test";
		expect(() => getDatabaseUrl()).toThrowError(/PostgreSQL URL/);
	});

	it("requires distinct non-placeholder seed credentials", () => {
		expect(getSeedEnvironment().organizationSlug).toBe("synthetic-lab");
		process.env.SEED_ANALYST_EMAIL = process.env.SEED_SUPERVISOR_EMAIL;
		expect(() => getSeedEnvironment()).toThrowError(/must be different/);
	});
});
