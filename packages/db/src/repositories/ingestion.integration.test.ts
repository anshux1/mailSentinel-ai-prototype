import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	analysisRuns,
	auditEvents,
	cases,
	evidenceArtifacts,
	organizationMembers,
	organizations,
	user,
} from "../schema";

const integrationEnabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!integrationEnabled)("tenant-safe evidence ingestion repositories", () => {
	let database: Awaited<typeof import("../client")>["db"];
	let pool: Awaited<typeof import("../client")>["pool"];
	let organizationA: string;
	let organizationB: string;
	let userA: string;
	let userB: string;
	let caseA: string;
	let caseB: string;
	let runA: string;
	let repositories: typeof import("./ingestion");

	beforeAll(async () => {
		process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
		const client = await import("../client");
		const testUtils = await import("../test-utils");
		repositories = await import("./ingestion");
		database = client.db;
		pool = client.pool;

		userA = await testUtils.insertSyntheticUser(database, {
			email: `ingestion-a-${Date.now()}@example.test`,
		});
		userB = await testUtils.insertSyntheticUser(database, {
			email: `ingestion-b-${Date.now()}@example.test`,
		});
		organizationA = await testUtils.insertSyntheticOrganization(database, {
			name: "Ingestion Tenant A",
		});
		organizationB = await testUtils.insertSyntheticOrganization(database, {
			name: "Ingestion Tenant B",
		});
		await testUtils.insertSyntheticMembership(database, {
			organizationId: organizationA,
			userId: userA,
			role: "analyst",
		});
		await testUtils.insertSyntheticMembership(database, {
			organizationId: organizationB,
			userId: userB,
			role: "analyst",
		});

		const intakeA = await repositories.createCaseIntake(
			{ organizationId: organizationA },
			{
				case: {
					id: "case_ingestion_a",
					caseNumber: "MS-INGEST-A",
					title: "Synthetic intake A",
					submittedBy: userA,
					originalFilename: "message.eml",
					retentionUntil: new Date("2030-01-01T00:00:00.000Z"),
					idempotencyKey: "idem-ingestion-a-0001",
				},
				artifact: {
					id: "artifact_ingestion_a",
					objectKey: "organizations/org-a/cases/case-a/artifacts/art-a.eml",
					sha256: "a".repeat(64),
					contentType: "message/rfc822",
					byteSize: 42,
				},
				analysisRun: {
					id: "run_ingestion_a",
					analysisVersion: "prototype-1",
					rulesVersion: "ingestion-only",
				},
				audit: {
					requestId: "request-ingestion-a",
					actorId: userA,
					metadataRedacted: { source: "synthetic", byteSize: 42 },
				},
			},
			database,
		);
		caseA = intakeA.case.id;
		runA = intakeA.analysisRun.id;

		const intakeB = await repositories.createCaseIntake(
			{ organizationId: organizationB },
			{
				case: {
					id: "case_ingestion_b",
					caseNumber: "MS-INGEST-B",
					title: "Synthetic intake B",
					submittedBy: userB,
					originalFilename: "message.eml",
					retentionUntil: new Date("2030-01-01T00:00:00.000Z"),
					idempotencyKey: "idem-ingestion-a-0001",
				},
				artifact: {
					id: "artifact_ingestion_b",
					objectKey: "organizations/org-b/cases/case-b/artifacts/art-b.eml",
					sha256: "a".repeat(64),
					contentType: "message/rfc822",
					byteSize: 42,
				},
				analysisRun: {
					id: "run_ingestion_b",
					analysisVersion: "prototype-1",
					rulesVersion: "ingestion-only",
				},
				audit: {
					requestId: "request-ingestion-b",
					actorId: userB,
				},
			},
			database,
		);
		caseB = intakeB.case.id;
	});

	afterAll(async () => {
		if (!database || !pool) {
			return;
		}
		await database.delete(auditEvents).where(inArray(auditEvents.caseId, [caseA, caseB]));
		await database.delete(analysisRuns).where(inArray(analysisRuns.id, [runA, "run_ingestion_b"]));
		await database
			.delete(evidenceArtifacts)
			.where(inArray(evidenceArtifacts.id, ["artifact_ingestion_a", "artifact_ingestion_b"]));
		await database.delete(cases).where(inArray(cases.id, [caseA, caseB]));
		await database
			.delete(organizationMembers)
			.where(inArray(organizationMembers.organizationId, [organizationA, organizationB]));
		await database.delete(organizations).where(inArray(organizations.id, [organizationA, organizationB]));
		await database.delete(user).where(inArray(user.id, [userA, userB]));
		await pool.end();
	});

	it("keeps idempotency and duplicate hash lookups tenant-scoped", async () => {
		const retryA = await repositories.findCaseByIdempotencyKey(
			{ organizationId: organizationA },
			"idem-ingestion-a-0001",
			database,
		);
		const retryB = await repositories.findCaseByIdempotencyKey(
			{ organizationId: organizationB },
			"idem-ingestion-a-0001",
			database,
		);
		expect(retryA?.id).toBe(caseA);
		expect(retryB?.id).toBe(caseB);
		expect(
			await repositories.findCaseByIdempotencyKey({ organizationId: organizationA }, "idem-ingestion-a-0001", database),
		).not.toEqual(retryB);

		expect(
			(await repositories.findArtifactByHash({ organizationId: organizationA }, "a".repeat(64), database))?.caseId,
		).toBe(caseA);
		expect(
			(await repositories.findArtifactByHash({ organizationId: organizationB }, "a".repeat(64), database))?.caseId,
		).toBe(caseB);
	});

	it("returns safe ingestion metadata and excludes the object key", async () => {
		const projection = await repositories.getCaseIngestionProjection(
			{ organizationId: organizationA },
			caseA,
			database,
		);
		expect(projection).toMatchObject({
			id: caseA,
			artifactKind: "original_eml",
			sha256: "a".repeat(64),
			byteSize: 42,
			analysisRunId: runA,
			analysisRunStatus: "queued",
		});
		expect(projection).not.toHaveProperty("objectKey");
		expect(
			await repositories.getCaseIngestionProjection({ organizationId: organizationA }, caseB, database),
		).toBeNull();
	});

	it("conditionally defers a queued run and prevents a second transition", async () => {
		const deferred = await repositories.markAnalysisDeferred(
			{ organizationId: organizationA },
			runA,
			"QUEUE_UNAVAILABLE",
			"Analysis is waiting for a queue worker.",
			database,
		);
		expect(deferred?.status).toBe("analysis_deferred");
		expect(
			await repositories.markAnalysisDeferred(
				{ organizationId: organizationA },
				runA,
				"OTHER_CODE",
				"Should not overwrite the first transition.",
				database,
			),
		).toBeNull();
	});

	it("appends an audit event without exposing a mutation helper", async () => {
		const event = await repositories.appendAuditEvent(
			{
				organizationId: organizationA,
				actorType: "user",
				actorId: userA,
				action: "case.viewed",
				caseId: caseA,
				targetType: "case",
				targetId: caseA,
				requestId: "request-view-a",
				metadataRedacted: { view: "initial" },
			},
			database,
		);
		expect(event.action).toBe("case.viewed");
		expect(event.metadataRedacted).toEqual({ view: "initial" });
	});
});
