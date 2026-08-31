import {
	createCaseIntake,
	DuplicateArtifactError,
	findArtifactByHash,
	findCaseByIdempotencyKey,
	getCaseIngestionProjection,
	markAnalysisDeferred,
} from "@mailsentinel/db";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { enqueueAnalysis, AnalyzerIntakeError } from "../../../server/analyzer-client";
import { env } from "../../../server/env";
import {
	createOriginalArtifactKey,
	ArtifactIntegrityError,
	ContentLengthMismatchError,
	hashRequestBody,
	EmptyUploadError,
	ObjectStorageError,
	UploadLimitError,
	UploadTimeoutError,
	deleteObject,
	uploadOriginalArtifact,
} from "../../../server/storage/s3";
import { validateUploadHeaders, UploadValidationError } from "../../../server/upload-validation";
import { getWorkspaceResolution } from "../../../server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string, requestId: string, caseId?: string) {
	return NextResponse.json(
		{ code, message, requestId, ...(caseId ? { caseId } : {}) },
		{ status, headers: { "X-Request-ID": requestId } },
	);
}

function responseFromProjection(
	projection: NonNullable<Awaited<ReturnType<typeof getCaseIngestionProjection>>>,
	requestId: string,
) {
	return {
		caseId: projection.id,
		caseNumber: projection.caseNumber,
		analysisRunId: projection.analysisRunId,
		status: projection.analysisRunStatus,
		artifact: {
			kind: projection.artifactKind,
			sha256: projection.sha256,
			byteSize: projection.byteSize,
			contentType: projection.contentType,
			originalFilename: projection.originalFilename,
		},
		requestId,
	};
}

function mapAnalyzerFailure(error: AnalyzerIntakeError): { code: string; message: string } {
	if (error.code === "ANALYZER_REJECTED") {
		return {
			code: "ANALYZER_REJECTED",
			message: "The analyzer could not accept this case; the preserved evidence is available for retry.",
		};
	}
	if (error.code === "ANALYZER_CONTRACT_INVALID") {
		return {
			code: "ANALYZER_CONTRACT_INVALID",
			message: "The analyzer returned an invalid intake response; the preserved evidence is available for retry.",
		};
	}
	return {
		code: "QUEUE_UNAVAILABLE",
		message: "The analyzer queue is unavailable; the preserved evidence is available for retry.",
	};
}

function mapStorageFailure(error: unknown): { status: number; code: string; message: string } {
	if (error instanceof UploadLimitError) {
		return { status: 413, code: error.code, message: "The email file exceeds the configured size limit." };
	}
	if (error instanceof EmptyUploadError) {
		return { status: 400, code: error.code, message: "The email file is empty." };
	}
	if (error instanceof ContentLengthMismatchError) {
		return { status: 400, code: error.code, message: "The declared content length did not match the received bytes." };
	}
	if (error instanceof UploadTimeoutError) {
		return { status: 503, code: error.code, message: "The upload timed out before it could be preserved." };
	}
	if (error instanceof ArtifactIntegrityError) {
		return { status: 503, code: error.code, message: "The preserved evidence failed its integrity check." };
	}
	if (error instanceof ObjectStorageError) {
		return { status: 503, code: error.code, message: "Evidence storage is temporarily unavailable." };
	}
	return { status: 503, code: "STORAGE_UNAVAILABLE", message: "Evidence storage is temporarily unavailable." };
}

export async function POST(request: Request): Promise<Response> {
	const suppliedRequestId = request.headers.get("x-request-id");
	const requestId =
		suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
			? suppliedRequestId
			: `req_${randomUUID().replaceAll("-", "")}`;

	if (!request.body) {
		return errorResponse(400, "EMPTY_UPLOAD", "The email file is empty.", requestId);
	}

	let resolution: Awaited<ReturnType<typeof getWorkspaceResolution>>;
	try {
		resolution = await getWorkspaceResolution();
	} catch {
		return errorResponse(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.", requestId);
	}
	if (!resolution) {
		return errorResponse(401, "AUTH_REQUIRED", "Authentication is required.", requestId);
	}
	if (resolution.kind !== "authorized") {
		return errorResponse(403, "UPLOAD_NOT_ALLOWED", "You are not allowed to create cases.", requestId);
	}
	if (!resolution.context || !["analyst", "supervisor", "admin"].includes(resolution.context.role)) {
		return errorResponse(403, "UPLOAD_NOT_ALLOWED", "You are not allowed to create cases.", requestId);
	}

	let headers: ReturnType<typeof validateUploadHeaders>;
	try {
		headers = validateUploadHeaders(request.headers, {
			maxBytes: env.maxEmlBytes,
			allowedOrigins: env.betterAuthTrustedOrigins,
		});
	} catch (error) {
		if (error instanceof UploadValidationError) {
			const status = error.code === "ORIGIN_NOT_ALLOWED" ? 403 : error.code === "UPLOAD_TOO_LARGE" ? 413 : 400;
			return errorResponse(status, error.code, error.message, requestId);
		}
		return errorResponse(400, "INVALID_UPLOAD", "The upload request is invalid.", requestId);
	}

	if (headers.contentLength === 0) {
		return errorResponse(400, "EMPTY_UPLOAD", "The email file is empty.", headers.requestId);
	}

	const scope = { organizationId: resolution.context.organization.id };
	let existingByKey: Awaited<ReturnType<typeof findCaseByIdempotencyKey>>;
	try {
		existingByKey = await findCaseByIdempotencyKey(scope, headers.idempotencyKey);
	} catch {
		return errorResponse(
			500,
			"INTAKE_PERSISTENCE_FAILED",
			"The case could not be looked up safely.",
			headers.requestId,
		);
	}
	if (existingByKey) {
		let existingProjection: Awaited<ReturnType<typeof getCaseIngestionProjection>>;
		try {
			existingProjection = await getCaseIngestionProjection(scope, existingByKey.id);
		} catch {
			return errorResponse(
				500,
				"INTAKE_PERSISTENCE_FAILED",
				"The case could not be looked up safely.",
				headers.requestId,
			);
		}
		if (!existingProjection) {
			return errorResponse(409, "IDEMPOTENCY_CONFLICT", "The idempotency key is already in use.", headers.requestId);
		}
		if (
			existingProjection.originalFilename !== headers.originalFilename ||
			existingProjection.contentType !== headers.contentType ||
			(headers.contentLength !== undefined && existingProjection.byteSize !== headers.contentLength)
		) {
			return errorResponse(
				409,
				"IDEMPOTENCY_CONFLICT",
				"The idempotency key is already associated with different upload metadata.",
				headers.requestId,
			);
		}

		let retryHash: Awaited<ReturnType<typeof hashRequestBody>>;
		try {
			retryHash = await hashRequestBody(request.body, env.maxEmlBytes, env.uploadTimeoutMs, headers.contentLength);
		} catch (error) {
			const failure = mapStorageFailure(error);
			return errorResponse(failure.status, failure.code, failure.message, headers.requestId);
		}
		if (retryHash.sha256 !== existingProjection.sha256 || retryHash.byteSize !== existingProjection.byteSize) {
			return errorResponse(
				409,
				"IDEMPOTENCY_CONFLICT",
				"The idempotency key is already associated with different file bytes.",
				headers.requestId,
			);
		}
		return NextResponse.json(responseFromProjection(existingProjection, headers.requestId), {
			status: 200,
			headers: { "X-Request-ID": headers.requestId, "Idempotent-Replay": "true" },
		});
	}

	const caseId = `case_${randomUUID().replaceAll("-", "")}`;
	const artifactId = `artifact_${randomUUID().replaceAll("-", "")}`;
	const analysisRunId = `run_${randomUUID().replaceAll("-", "")}`;
	const objectKey = createOriginalArtifactKey(scope.organizationId, caseId, artifactId);
	let uploaded: Awaited<ReturnType<typeof uploadOriginalArtifact>>;

	try {
		uploaded = await uploadOriginalArtifact({
			key: objectKey,
			contentType: headers.contentType,
			requestBody: request.body,
			maxBytes: env.maxEmlBytes,
			timeoutMs: env.uploadTimeoutMs,
			expectedByteSize: headers.contentLength,
		});
	} catch (error) {
		const failure = mapStorageFailure(error);
		return errorResponse(failure.status, failure.code, failure.message, headers.requestId);
	}

	let duplicate: Awaited<ReturnType<typeof findArtifactByHash>>;
	try {
		duplicate = await findArtifactByHash(scope, uploaded.sha256);
	} catch {
		await deleteObject(objectKey);
		return errorResponse(
			500,
			"INTAKE_PERSISTENCE_FAILED",
			"The artifact could not be checked safely.",
			headers.requestId,
		);
	}
	if (duplicate && !headers.allowDuplicate) {
		await deleteObject(objectKey);
		return NextResponse.json(
			{
				code: "DUPLICATE_ARTIFACT",
				message: "This exact artifact already exists in this organization.",
				caseId: duplicate.caseId,
				caseNumber: duplicate.caseNumber,
				requestId: headers.requestId,
			},
			{ status: 409, headers: { "X-Request-ID": headers.requestId } },
		);
	}

	try {
		await createCaseIntake(scope, {
			case: {
				id: caseId,
				title: `Email evidence: ${headers.originalFilename}`.slice(0, 240),
				submittedBy: resolution.context.user.id,
				originalFilename: headers.originalFilename,
				messageReceivedAt: new Date(),
				retentionUntil: new Date(Date.now() + env.retentionDays * 24 * 60 * 60 * 1000),
				idempotencyKey: headers.idempotencyKey,
			},
			artifact: {
				id: artifactId,
				objectKey,
				sha256: uploaded.sha256,
				contentType: headers.contentType,
				byteSize: uploaded.byteSize,
			},
			allowDuplicate: headers.allowDuplicate,
			analysisRun: {
				id: analysisRunId,
				analysisVersion: "prototype-1",
				rulesVersion: "ingestion-v1",
				providerMode: "offline",
			},
			audit: {
				requestId: headers.requestId,
				actorType: "user",
				actorId: resolution.context.user.id,
				metadataRedacted: { contentType: headers.contentType, byteSize: uploaded.byteSize },
			},
		});
	} catch (error) {
		await deleteObject(objectKey);
		if (error instanceof DuplicateArtifactError) {
			return NextResponse.json(
				{
					code: "DUPLICATE_ARTIFACT",
					message: "This exact artifact already exists in this organization.",
					caseId: error.match.caseId,
					caseNumber: error.match.caseNumber,
					requestId: headers.requestId,
				},
				{ status: 409, headers: { "X-Request-ID": headers.requestId } },
			);
		}
		// A concurrent request may have won the tenant-scoped idempotency race.
		// Return its result instead of reporting a duplicate as an opaque 500.
		try {
			const concurrentCase = await findCaseByIdempotencyKey(scope, headers.idempotencyKey);
			const concurrentProjection = concurrentCase ? await getCaseIngestionProjection(scope, concurrentCase.id) : null;
			if (concurrentProjection) {
				if (
					concurrentProjection.originalFilename === headers.originalFilename &&
					concurrentProjection.contentType === headers.contentType &&
					concurrentProjection.sha256 === uploaded.sha256 &&
					concurrentProjection.byteSize === uploaded.byteSize
				) {
					return NextResponse.json(responseFromProjection(concurrentProjection, headers.requestId), {
						status: 200,
						headers: { "X-Request-ID": headers.requestId, "Idempotent-Replay": "true" },
					});
				}
				return errorResponse(
					409,
					"IDEMPOTENCY_CONFLICT",
					"The idempotency key is already associated with different file bytes.",
					headers.requestId,
				);
			}
		} catch {
			// Fall through to the safe persistence error when the diagnostic lookup fails.
		}
		return errorResponse(
			500,
			"INTAKE_PERSISTENCE_FAILED",
			"The case could not be persisted safely.",
			headers.requestId,
		);
	}

	try {
		await enqueueAnalysis({
			caseId,
			organizationId: scope.organizationId,
			analysisRunId,
			artifact: { objectKey, sha256: uploaded.sha256, byteSize: uploaded.byteSize },
			requestedAt: new Date().toISOString(),
			requestId: headers.requestId,
		});
	} catch (error) {
		const failure =
			error instanceof AnalyzerIntakeError
				? mapAnalyzerFailure(error)
				: {
						code: "QUEUE_UNAVAILABLE",
						message: "The analyzer queue is unavailable; the preserved evidence is available for retry.",
					};
		try {
			await markAnalysisDeferred(scope, analysisRunId, failure.code, failure.message);
		} catch {
			// Evidence is already committed; retain the case even if the deferred marker needs operational repair.
		}
		return errorResponse(503, "ANALYSIS_DEFERRED", failure.message, headers.requestId, caseId);
	}

	let projection: Awaited<ReturnType<typeof getCaseIngestionProjection>>;
	try {
		projection = await getCaseIngestionProjection(scope, caseId);
	} catch {
		return errorResponse(
			500,
			"INTAKE_PERSISTENCE_FAILED",
			"The case could not be loaded after persistence.",
			headers.requestId,
		);
	}
	if (!projection) {
		return errorResponse(
			500,
			"INTAKE_PERSISTENCE_FAILED",
			"The case could not be loaded after persistence.",
			headers.requestId,
		);
	}
	return NextResponse.json(responseFromProjection(projection, headers.requestId), {
		status: 202,
		headers: { "X-Request-ID": headers.requestId },
	});
}
