import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const organizationRoleValues = ["viewer", "analyst", "supervisor", "admin"] as const;
export type OrganizationRole = (typeof organizationRoleValues)[number];
export const organizationRole = pgEnum("organization_role", organizationRoleValues);

export const organizations = pgTable(
	"organizations",
	{
		id: text("id").primaryKey(),
		name: varchar("name", { length: 120 }).notNull(),
		slug: varchar("slug", { length: 64 }).notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("organizations_created_at_idx").on(table.createdAt)],
);

export const organizationMembers = pgTable(
	"organization_members",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		role: organizationRole("role").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique("organization_members_organization_user_unique").on(table.organizationId, table.userId),
		index("organization_members_user_id_idx").on(table.userId),
		index("organization_members_organization_role_idx").on(table.organizationId, table.role),
	],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
	organization: one(organizations, {
		fields: [organizationMembers.organizationId],
		references: [organizations.id],
	}),
	user: one(user, {
		fields: [organizationMembers.userId],
		references: [user.id],
	}),
}));
