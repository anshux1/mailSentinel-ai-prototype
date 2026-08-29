import { describe, expect, it } from "vitest";

import { can, isOrganizationRole, parseOrganizationRole } from "./permissions";

const permissions = [
	"case.read",
	"case.create",
	"analysis.retry",
	"note.create",
	"report.export",
	"disposition.override",
	"audit.read",
	"member.manage",
	"settings.manage",
] as const;

describe("organization permissions", () => {
	it("matches the required role matrix", () => {
		const expected: Record<string, readonly string[]> = {
			viewer: ["case.read"],
			analyst: ["case.read", "case.create", "analysis.retry", "note.create"],
			supervisor: [
				"case.read",
				"case.create",
				"analysis.retry",
				"note.create",
				"report.export",
				"disposition.override",
				"audit.read",
			],
			admin: [...permissions],
		};

		for (const [role, allowedPermissions] of Object.entries(expected)) {
			for (const permission of permissions) {
				expect(can(role, permission)).toBe(allowedPermissions.includes(permission));
			}
		}
	});

	it("fails closed for unknown roles and permissions", () => {
		expect(can("owner", "case.read")).toBe(false);
		expect(can("admin", "organization.delete")).toBe(false);
		expect(isOrganizationRole("owner")).toBe(false);
		expect(parseOrganizationRole("unknown")).toBeNull();
	});

	it("parses only application roles", () => {
		expect(parseOrganizationRole("viewer")).toBe("viewer");
		expect(parseOrganizationRole("supervisor")).toBe("supervisor");
	});
});
