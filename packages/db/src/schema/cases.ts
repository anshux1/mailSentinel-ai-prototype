import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, unique, varchar, boolean } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organizations } from "./tenancy";

export const caseStatusValues = [
	"queued",
	"parsing",
	"extracting",
	"enriching",
	"scoring",
	"completed",
	"parse_failed",
	"analysis_deferred",
	"enrichment_partial",
	"failed",
] as const;
export type CaseStatus = (typeof caseStatusValues)[number];

export const casePriorityValues = ["low", "normal", "high", "critical"] as const;
export type CasePriority = (typeof casePriorityValues)[number];

export const caseStatus = pgEnum("case_status", caseStatusValues);
export const casePriority = pgEnum("case_priority", casePriorityValues);

export const cases = pgTable(
	"cases",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		caseNumber: varchar("case_number", { length: 40 }).notNull(),
		title: varchar("title", { length: 240 }).notNull(),
		status: caseStatus("status").notNull().default("queued"),
		priority: casePriority("priority").notNull().default("normal"),
		submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
		originalFilename: varchar("original_filename", { length: 255 }),
		messageReceivedAt: timestamp("message_received_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
		legalHold: boolean("legal_hold").default(false).notNull(),
	},
	(table) => [
		unique("cases_organization_case_number_unique").on(table.organizationId, table.caseNumber),
		index("cases_organization_created_at_idx").on(table.organizationId, table.createdAt),
		index("cases_organization_status_created_at_idx").on(table.organizationId, table.status, table.createdAt),
		index("cases_organization_priority_created_at_idx").on(table.organizationId, table.priority, table.createdAt),
	],
);

export const casesRelations = relations(cases, ({ one }) => ({
	organization: one(organizations, {
		fields: [cases.organizationId],
		references: [organizations.id],
	}),
	submitter: one(user, {
		fields: [cases.submittedBy],
		references: [user.id],
	}),
}));
