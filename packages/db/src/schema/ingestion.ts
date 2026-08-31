import { relations, sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	varchar,
} from "drizzle-orm/pg-core";

import { cases, caseStatus } from "./cases";
import { organizations } from "./tenancy";

export const evidenceArtifactKindValues = ["original_eml", "attachment", "report"] as const;
export type EvidenceArtifactKind = (typeof evidenceArtifactKindValues)[number];
export const evidenceArtifactKind = pgEnum("evidence_artifact_kind", evidenceArtifactKindValues);

export const providerModeValues = ["fixture", "offline", "live"] as const;
export type ProviderMode = (typeof providerModeValues)[number];
export const providerMode = pgEnum("provider_mode", providerModeValues);

export const auditActorTypeValues = ["user", "service"] as const;
export type AuditActorType = (typeof auditActorTypeValues)[number];
export const auditActorType = pgEnum("audit_actor_type", auditActorTypeValues);

export const evidenceArtifacts = pgTable(
	"evidence_artifacts",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		caseId: text("case_id").notNull(),
		kind: evidenceArtifactKind("kind").notNull(),
		objectKey: varchar("object_key", { length: 512 }).notNull(),
		sha256: varchar("sha256", { length: 64 }).notNull(),
		contentType: varchar("content_type", { length: 128 }).notNull(),
		byteSize: integer("byte_size").notNull(),
		encryptionKeyReference: varchar("encryption_key_reference", {
			length: 255,
		}),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique("evidence_artifacts_object_key_unique").on(table.objectKey),
		index("evidence_artifacts_organization_sha256_idx").on(table.organizationId, table.sha256),
		index("evidence_artifacts_organization_case_created_at_idx").on(
			table.organizationId,
			table.caseId,
			table.createdAt,
		),
		foreignKey({
			name: "evidence_artifacts_organization_case_fk",
			columns: [table.organizationId, table.caseId],
			foreignColumns: [cases.organizationId, cases.id],
		}).onDelete("cascade"),
		check("evidence_artifacts_sha256_format_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
		check("evidence_artifacts_byte_size_non_negative_check", sql`${table.byteSize} >= 0`),
		check(
			"evidence_artifacts_original_eml_non_empty_check",
			sql`${table.kind} <> 'original_eml' or ${table.byteSize} > 0`,
		),
	],
);

export const analysisRuns = pgTable(
	"analysis_runs",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		caseId: text("case_id").notNull(),
		status: caseStatus("status").notNull().default("queued"),
		analysisVersion: varchar("analysis_version", { length: 64 }).notNull(),
		rulesVersion: varchar("rules_version", { length: 64 }).notNull(),
		modelVersion: varchar("model_version", { length: 128 }),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		failureCode: varchar("failure_code", { length: 64 }),
		failureMessageSafe: varchar("failure_message_safe", { length: 512 }),
		providerMode: providerMode("provider_mode").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique("analysis_runs_organization_case_unique").on(table.organizationId, table.caseId),
		index("analysis_runs_organization_case_created_at_idx").on(table.organizationId, table.caseId, table.createdAt),
		index("analysis_runs_status_updated_at_idx").on(table.status, table.updatedAt),
		foreignKey({
			name: "analysis_runs_organization_case_fk",
			columns: [table.organizationId, table.caseId],
			foreignColumns: [cases.organizationId, cases.id],
		}).onDelete("cascade"),
	],
);

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type AuditMetadata = { readonly [key: string]: JsonValue };

export const auditEvents = pgTable(
	"audit_events",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		actorType: auditActorType("actor_type").notNull(),
		actorId: varchar("actor_id", { length: 128 }).notNull(),
		action: varchar("action", { length: 128 }).notNull(),
		caseId: text("case_id"),
		targetType: varchar("target_type", { length: 64 }).notNull(),
		targetId: varchar("target_id", { length: 128 }),
		requestId: varchar("request_id", { length: 128 }).notNull(),
		ipAddressMasked: varchar("ip_address_masked", { length: 128 }),
		metadataRedacted: jsonb("metadata_redacted").$type<AuditMetadata>().notNull().default({}),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("audit_events_organization_created_at_idx").on(table.organizationId, table.createdAt),
		index("audit_events_organization_case_created_at_idx").on(table.organizationId, table.caseId, table.createdAt),
		foreignKey({
			name: "audit_events_organization_case_fk",
			columns: [table.organizationId, table.caseId],
			foreignColumns: [cases.organizationId, cases.id],
		}).onDelete("cascade"),
	],
);

export const evidenceArtifactsRelations = relations(evidenceArtifacts, ({ one }) => ({
	organization: one(organizations, {
		fields: [evidenceArtifacts.organizationId],
		references: [organizations.id],
	}),
	case: one(cases, {
		fields: [evidenceArtifacts.caseId, evidenceArtifacts.organizationId],
		references: [cases.id, cases.organizationId],
	}),
}));

export const analysisRunsRelations = relations(analysisRuns, ({ one }) => ({
	organization: one(organizations, {
		fields: [analysisRuns.organizationId],
		references: [organizations.id],
	}),
	case: one(cases, {
		fields: [analysisRuns.caseId, analysisRuns.organizationId],
		references: [cases.id, cases.organizationId],
	}),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
	organization: one(organizations, {
		fields: [auditEvents.organizationId],
		references: [organizations.id],
	}),
	case: one(cases, {
		fields: [auditEvents.caseId, auditEvents.organizationId],
		references: [cases.id, cases.organizationId],
	}),
}));
