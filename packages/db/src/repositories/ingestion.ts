import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { db, type Database } from "../client";
import {
	auditEvents,
	analysisRuns,
	cases,
	evidenceArtifacts,
	type AuditActorType,
	type AuditMetadata,
	type EvidenceArtifactKind,
	type ProviderMode,
} from "../schema";
import type { TenantScope } from "./types";

export interface CaseIdempotencyRecord {
	id: string;
	caseNumber: string;
	title: string;
	status: (typeof cases.status.enumValues)[number];
	priority: (typeof cases.priority.enumValues)[number];
	originalFilename: string | null;
	idempotencyKey: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ArtifactHashMatch {
	id: string;
	caseId: string;
	caseNumber: string;
	kind: EvidenceArtifactKind;
	sha256: string;
	byteSize: number;
	contentType: string;
	createdAt: Date;
}

export interface CaseIngestionProjection {
	id: string;
	caseNumber: string;
	title: string;
	status: (typeof cases.status.enumValues)[number];
	priority: (typeof cases.priority.enumValues)[number];
	originalFilename: string | null;
	artifactKind: EvidenceArtifactKind;
	sha256: string;
	byteSize: number;
	contentType: string;
	receivedAt: Date;
	artifactCreatedAt: Date;
	analysisRunId: string;
	analysisRunStatus: (typeof cases.status.enumValues)[number];
	analysisVersion: string;
	rulesVersion: string;
	providerMode: ProviderMode;
	analysisStartedAt: Date | null;
	analysisCompletedAt: Date | null;
	failureCode: string | null;
	failureMessageSafe: string | null;
	analysisCreatedAt: Date;
	analysisUpdatedAt: Date;
}

export class DuplicateArtifactError extends Error {
	constructor(readonly match: ArtifactHashMatch) {
		super("The artifact already exists in this organization");
		this.name = "DuplicateArtifactError";
	}
}

export interface CreateCaseIntakeInput {
	case: {
		id?: string;
		caseNumber?: string;
		title: string;
		priority?: (typeof cases.priority.enumValues)[number];
		submittedBy?: string | null;
		originalFilename: string;
		messageReceivedAt?: Date;
		retentionUntil: Date;
		idempotencyKey: string;
	};
	artifact: {
		id?: string;
		kind?: EvidenceArtifactKind;
		objectKey: string;
		sha256: string;
		contentType: string;
		byteSize: number;
		encryptionKeyReference?: string | null;
	};
	allowDuplicate?: boolean;
	analysisRun: {
		id?: string;
		analysisVersion: string;
		rulesVersion: string;
		modelVersion?: string | null;
		providerMode?: ProviderMode;
	};
	audit: {
		requestId: string;
		actorId: string;
		actorType?: AuditActorType;
		ipAddressMasked?: string | null;
		metadataRedacted?: AuditMetadata;
	};
}

export interface AppendAuditEventInput {
	id?: string;
	organizationId: string;
	actorType: AuditActorType;
	actorId: string;
	action: string;
	caseId?: string | null;
	targetType: string;
	targetId?: string | null;
	requestId: string;
	ipAddressMasked?: string | null;
	metadataRedacted: AuditMetadata;
}

const idempotencyProjection = {
	id: cases.id,
	caseNumber: cases.caseNumber,
	title: cases.title,
	status: cases.status,
	priority: cases.priority,
	originalFilename: cases.originalFilename,
	idempotencyKey: cases.idempotencyKey,
	createdAt: cases.createdAt,
	updatedAt: cases.updatedAt,
};

const artifactHashProjection = {
	id: evidenceArtifacts.id,
	caseId: evidenceArtifacts.caseId,
	caseNumber: cases.caseNumber,
	kind: evidenceArtifacts.kind,
	sha256: evidenceArtifacts.sha256,
	byteSize: evidenceArtifacts.byteSize,
	contentType: evidenceArtifacts.contentType,
	createdAt: evidenceArtifacts.createdAt,
};

const ingestionProjection = {
	id: cases.id,
	caseNumber: cases.caseNumber,
	title: cases.title,
	status: cases.status,
	priority: cases.priority,
	originalFilename: cases.originalFilename,
	artifactKind: evidenceArtifacts.kind,
	sha256: evidenceArtifacts.sha256,
	byteSize: evidenceArtifacts.byteSize,
	contentType: evidenceArtifacts.contentType,
	receivedAt: evidenceArtifacts.createdAt,
	artifactCreatedAt: evidenceArtifacts.createdAt,
	analysisRunId: analysisRuns.id,
	analysisRunStatus: analysisRuns.status,
	analysisVersion: analysisRuns.analysisVersion,
	rulesVersion: analysisRuns.rulesVersion,
	providerMode: analysisRuns.providerMode,
	analysisStartedAt: analysisRuns.startedAt,
	analysisCompletedAt: analysisRuns.completedAt,
	failureCode: analysisRuns.failureCode,
	failureMessageSafe: analysisRuns.failureMessageSafe,
	analysisCreatedAt: analysisRuns.createdAt,
	analysisUpdatedAt: analysisRuns.updatedAt,
};

/** Look up an intake retry only inside the trusted organization scope. */
export async function findCaseByIdempotencyKey(
	scope: TenantScope,
	key: string,
	database: Database = db,
): Promise<CaseIdempotencyRecord | null> {
	const [record] = await database
		.select(idempotencyProjection)
		.from(cases)
		.where(and(eq(cases.organizationId, scope.organizationId), eq(cases.idempotencyKey, key)))
		.limit(1);

	return record ?? null;
}

/** Find a same-tenant artifact without returning its private object key. */
export async function findArtifactByHash(
	scope: TenantScope,
	sha256: string,
	database: Database = db,
): Promise<ArtifactHashMatch | null> {
	const [record] = await database
		.select(artifactHashProjection)
		.from(evidenceArtifacts)
		.innerJoin(
			cases,
			and(eq(evidenceArtifacts.caseId, cases.id), eq(evidenceArtifacts.organizationId, cases.organizationId)),
		)
		.where(and(eq(evidenceArtifacts.organizationId, scope.organizationId), eq(evidenceArtifacts.sha256, sha256)))
		.orderBy(asc(evidenceArtifacts.createdAt))
		.limit(1);

	return record ?? null;
}

/**
 * Persist the case, original artifact, analysis run and initial audit records
 * atomically. Organization IDs are deliberately taken from scope, never from
 * input supplied by a caller.
 */
export async function createCaseIntake(scope: TenantScope, input: CreateCaseIntakeInput, database: Database = db) {
	const caseId = input.case.id ?? `case_${randomUUID()}`;
	const artifactId = input.artifact.id ?? `artifact_${randomUUID()}`;
	const analysisRunId = input.analysisRun.id ?? `run_${randomUUID()}`;
	const caseNumber = input.case.caseNumber ?? `MS-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
	const now = new Date();
	const actorType = input.audit.actorType ?? "user";
	const metadata = input.audit.metadataRedacted ?? {};

	return database.transaction(async (transaction) => {
		// Serialize same-tenant uploads of the same bytes across the hash lookup
		// and metadata transaction. Explicit duplicate confirmation can still opt
		// into a second case without weakening the default race protection.
		await transaction.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:${input.artifact.sha256}`}, 0))`,
		);
		const [existingArtifact] = await transaction
			.select(artifactHashProjection)
			.from(evidenceArtifacts)
			.innerJoin(
				cases,
				and(eq(evidenceArtifacts.caseId, cases.id), eq(evidenceArtifacts.organizationId, cases.organizationId)),
			)
			.where(
				and(
					eq(evidenceArtifacts.organizationId, scope.organizationId),
					eq(evidenceArtifacts.sha256, input.artifact.sha256),
				),
			)
			.orderBy(asc(evidenceArtifacts.createdAt))
			.limit(1);
		if (existingArtifact && !input.allowDuplicate) {
			throw new DuplicateArtifactError(existingArtifact);
		}

		const [caseRecord] = await transaction
			.insert(cases)
			.values({
				id: caseId,
				organizationId: scope.organizationId,
				caseNumber,
				title: input.case.title,
				status: "queued",
				priority: input.case.priority ?? "normal",
				submittedBy: input.case.submittedBy,
				originalFilename: input.case.originalFilename,
				messageReceivedAt: input.case.messageReceivedAt ?? now,
				createdAt: now,
				updatedAt: now,
				retentionUntil: input.case.retentionUntil,
				idempotencyKey: input.case.idempotencyKey,
			})
			.returning();

		if (!caseRecord) {
			throw new Error("Case intake did not return the inserted case");
		}

		const [artifactRecord] = await transaction
			.insert(evidenceArtifacts)
			.values({
				id: artifactId,
				organizationId: scope.organizationId,
				caseId,
				kind: input.artifact.kind ?? "original_eml",
				objectKey: input.artifact.objectKey,
				sha256: input.artifact.sha256,
				contentType: input.artifact.contentType,
				byteSize: input.artifact.byteSize,
				encryptionKeyReference: input.artifact.encryptionKeyReference,
				createdAt: now,
			})
			.returning();

		if (!artifactRecord) {
			throw new Error("Case intake did not return the inserted artifact");
		}

		const [analysisRunRecord] = await transaction
			.insert(analysisRuns)
			.values({
				id: analysisRunId,
				organizationId: scope.organizationId,
				caseId,
				status: "queued",
				analysisVersion: input.analysisRun.analysisVersion,
				rulesVersion: input.analysisRun.rulesVersion,
				modelVersion: input.analysisRun.modelVersion,
				providerMode: input.analysisRun.providerMode ?? "offline",
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		if (!analysisRunRecord) {
			throw new Error("Case intake did not return the inserted analysis run");
		}

		const auditRows = await transaction
			.insert(auditEvents)
			.values([
				{
					id: `audit_${randomUUID()}`,
					organizationId: scope.organizationId,
					actorType,
					actorId: input.audit.actorId,
					action: "case.created",
					caseId,
					targetType: "case",
					targetId: caseId,
					requestId: input.audit.requestId,
					ipAddressMasked: input.audit.ipAddressMasked,
					metadataRedacted: { ...metadata, caseId, status: "queued" },
				},
				{
					id: `audit_${randomUUID()}`,
					organizationId: scope.organizationId,
					actorType,
					actorId: input.audit.actorId,
					action: "evidence.uploaded",
					caseId,
					targetType: "evidence_artifact",
					targetId: artifactId,
					requestId: input.audit.requestId,
					ipAddressMasked: input.audit.ipAddressMasked,
					metadataRedacted: {
						...metadata,
						artifactId,
						kind: input.artifact.kind ?? "original_eml",
						sha256: input.artifact.sha256,
						byteSize: input.artifact.byteSize,
					},
				},
			])
			.returning();

		return {
			case: caseRecord,
			artifact: artifactRecord,
			analysisRun: analysisRunRecord,
			auditEvents: auditRows,
		};
	});
}

/** Return only safe metadata needed by the case page; object_key is excluded. */
export async function getCaseIngestionProjection(
	scope: TenantScope,
	caseId: string,
	database: Database = db,
): Promise<CaseIngestionProjection | null> {
	const [record] = await database
		.select(ingestionProjection)
		.from(cases)
		.innerJoin(
			evidenceArtifacts,
			and(eq(evidenceArtifacts.caseId, cases.id), eq(evidenceArtifacts.organizationId, cases.organizationId)),
		)
		.innerJoin(
			analysisRuns,
			and(eq(analysisRuns.caseId, cases.id), eq(analysisRuns.organizationId, cases.organizationId)),
		)
		.where(and(eq(cases.id, caseId), eq(cases.organizationId, scope.organizationId)))
		.limit(1);

	return record ?? null;
}

/**
 * Move a queued run and its case to the truthful deferred state atomically.
 * A second worker cannot apply the transition because the run predicate is
 * conditional on status = queued.
 */
export async function markAnalysisDeferred(
	scope: TenantScope,
	runId: string,
	failureCode: string,
	safeMessage: string,
	database: Database = db,
) {
	return database.transaction(async (transaction) => {
		const now = new Date();
		const [run] = await transaction
			.update(analysisRuns)
			.set({
				status: "analysis_deferred",
				failureCode,
				failureMessageSafe: safeMessage,
				updatedAt: now,
			})
			.where(
				and(
					eq(analysisRuns.id, runId),
					eq(analysisRuns.organizationId, scope.organizationId),
					eq(analysisRuns.status, "queued"),
				),
			)
			.returning();

		if (!run) {
			return null;
		}

		const [updatedCase] = await transaction
			.update(cases)
			.set({ status: "analysis_deferred", updatedAt: now })
			.where(and(eq(cases.id, run.caseId), eq(cases.organizationId, scope.organizationId), eq(cases.status, "queued")))
			.returning({ id: cases.id });

		if (!updatedCase) {
			throw new Error("Unable to defer analysis because the related case is not queued");
		}

		return run;
	});
}

/** Append-only audit insertion; callers must provide already-redacted metadata. */
export async function appendAuditEvent(input: AppendAuditEventInput, database: Database = db) {
	const [event] = await database
		.insert(auditEvents)
		.values({
			id: input.id ?? `audit_${randomUUID()}`,
			organizationId: input.organizationId,
			actorType: input.actorType,
			actorId: input.actorId,
			action: input.action,
			caseId: input.caseId,
			targetType: input.targetType,
			targetId: input.targetId,
			requestId: input.requestId,
			ipAddressMasked: input.ipAddressMasked,
			metadataRedacted: input.metadataRedacted,
		})
		.returning();

	if (!event) {
		throw new Error("Audit event insert did not return an event");
	}

	return event;
}
