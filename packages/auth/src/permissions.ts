import { organizationRoleValues, type OrganizationRole } from "@mailsentinel/db/schema";

export const permissionValues = [
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

export type Permission = (typeof permissionValues)[number];

export const rolePermissions: Readonly<Record<OrganizationRole, readonly Permission[]>> = {
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
	admin: [
		"case.read",
		"case.create",
		"analysis.retry",
		"note.create",
		"report.export",
		"disposition.override",
		"audit.read",
		"member.manage",
		"settings.manage",
	],
};

export function isOrganizationRole(value: string): value is OrganizationRole {
	return (organizationRoleValues as readonly string[]).includes(value);
}

export function parseOrganizationRole(value: string): OrganizationRole | null {
	return isOrganizationRole(value) ? value : null;
}

export function can(role: string, permission: string): boolean {
	if (!isOrganizationRole(role)) {
		return false;
	}
	return (rolePermissions[role] as readonly string[]).includes(permission);
}

export function requirePermission(role: OrganizationRole, permission: Permission): void {
	if (!can(role, permission)) {
		throw new Error("Permission denied");
	}
}
