import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	DuplicateArtifactError: class extends Error {
		readonly match = { caseId: "case_existing", caseNumber: "MS-EXISTING" };
	},
	findCaseByIdempotencyKey: vi.fn(),
	findArtifactByHash: vi.fn(),
	getCaseIngestionProjection: vi.fn(),
	createCaseIntake: vi.fn(),
	markAnalysisDeferred: vi.fn(),
	getWorkspaceResolution: vi.fn(),
	uploadOriginalArtifact: vi.fn(),
	hashRequestBody: vi.fn(),
	deleteObject: vi.fn(),
	enqueueAnalysis: vi.fn(),
}));

vi.mock("@mailsentinel/db", () => ({
	DuplicateArtifactError: mocks.DuplicateArtifactError,
	findCaseByIdempotencyKey: mocks.findCaseByIdempotencyKey,
	findArtifactByHash: mocks.findArtifactByHash,
	getCaseIngestionProjection: mocks.getCaseIngestionProjection,
	createCaseIntake: mocks.createCaseIntake,
	markAnalysisDeferred: mocks.markAnalysisDeferred,
}));
vi.mock("../../../server/session", () => ({ getWorkspaceResolution: mocks.getWorkspaceResolution }));
vi.mock("../../../server/storage/s3", async () => {
	class StorageError extends Error {}
	class UploadLimitError extends Error {
		readonly code = "UPLOAD_TOO_LARGE";
	}
	class EmptyUploadError extends Error {
		readonly code = "EMPTY_UPLOAD";
	}
	class UploadTimeoutError extends Error {
		readonly code = "UPLOAD_TIMEOUT";
	}
	class ContentLengthMismatchError extends Error {
		readonly code = "INVALID_CONTENT_LENGTH";
	}
	class ArtifactIntegrityError extends Error {
		readonly code = "ARTIFACT_INTEGRITY_MISMATCH";
	}
	return {
		ArtifactIntegrityError,
		ContentLengthMismatchError,
		EmptyUploadError,
		ObjectStorageError: StorageError,
		UploadLimitError,
		UploadTimeoutError,
		createOriginalArtifactKey: (organizationId: string, caseId: string, artifactId: string) =>
			`organizations/${organizationId}/cases/${caseId}/artifacts/${artifactId}.eml`,
		deleteObject: mocks.deleteObject,
		hashRequestBody: mocks.hashRequestBody,
		uploadOriginalArtifact: mocks.uploadOriginalArtifact,
	};
});
vi.mock("../../../server/analyzer-client", () => {
	class AnalyzerIntakeError extends Error {
		constructor(readonly code: string) {
			super(code);
		}
	}
	return { AnalyzerIntakeError, enqueueAnalysis: mocks.enqueueAnalysis };
});

import { POST } from "./route";

const projection = {
	id: "case_1",
	caseNumber: "MS-000001",
	title: "Email evidence: message.eml",
	status: "queued",
	priority: "normal",
	originalFilename: "message.eml",
	artifactKind: "original_eml",
	sha256: "a".repeat(64),
	byteSize: 5,
	contentType: "message/rfc822",
	receivedAt: new Date("2026-01-01T00:00:00.000Z"),
	artifactCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
	analysisRunId: "run_1",
	analysisRunStatus: "queued",
	analysisVersion: "prototype-1",
	rulesVersion: "ingestion-v1",
	providerMode: "offline",
	analysisStartedAt: null,
	analysisCompletedAt: null,
	failureCode: null,
	failureMessageSafe: null,
	analysisCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
	analysisUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function request(body = "hello", extraHeaders: Record<string, string> = {}): Request {
	return new Request("http://localhost:3000/api/cases", {
		method: "POST",
		body,
		headers: {
			origin: "http://localhost:3000",
			"content-type": "message/rfc822",
			"x-original-filename": "message.eml",
			"idempotency-key": "idempotency-key-1234",
			...extraHeaders,
		},
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getWorkspaceResolution.mockResolvedValue({
		kind: "authorized",
		context: {
			user: { id: "user_1" },
			organization: { id: "org_1" },
			role: "analyst",
		},
	});
	mocks.findCaseByIdempotencyKey.mockResolvedValue(null);
	mocks.findArtifactByHash.mockResolvedValue(null);
	mocks.uploadOriginalArtifact.mockResolvedValue({ byteSize: 5, sha256: "a".repeat(64) });
	mocks.createCaseIntake.mockResolvedValue({});
	mocks.enqueueAnalysis.mockResolvedValue({
		analysisRunId: "run_1",
		status: "queued",
		acceptedAt: new Date().toISOString(),
		requestId: "req_test",
	});
	mocks.getCaseIngestionProjection.mockResolvedValue(projection);
});

describe("POST /api/cases", () => {
	it("preserves a valid upload and returns a minimized queued response", async () => {
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body).toMatchObject({ caseId: "case_1", status: "queued" });
		expect(body).not.toHaveProperty("objectKey");
		expect(mocks.createCaseIntake).toHaveBeenCalledOnce();
		expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
	});

	it("rejects unauthenticated uploads before storage", async () => {
		mocks.getWorkspaceResolution.mockResolvedValue(null);
		const response = await POST(request());

		expect(response.status).toBe(401);
		expect((await response.json()).code).toBe("AUTH_REQUIRED");
		expect(mocks.uploadOriginalArtifact).not.toHaveBeenCalled();
	});

	it("cleans the temporary object and reports same-tenant duplicates", async () => {
		mocks.findArtifactByHash.mockResolvedValue({ caseId: "case_existing", caseNumber: "MS-EXISTING" });
		const response = await POST(request());

		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe("DUPLICATE_ARTIFACT");
		expect(mocks.deleteObject).toHaveBeenCalledOnce();
		expect(mocks.createCaseIntake).not.toHaveBeenCalled();
	});

	it("returns an exact idempotent replay without storing a second object", async () => {
		mocks.findCaseByIdempotencyKey.mockResolvedValue({ id: "case_1" });
		mocks.hashRequestBody.mockResolvedValue({ byteSize: 5, sha256: "a".repeat(64) });
		const response = await POST(request());

		expect(response.status).toBe(200);
		expect(response.headers.get("Idempotent-Replay")).toBe("true");
		expect((await response.json()).caseId).toBe("case_1");
		expect(mocks.uploadOriginalArtifact).not.toHaveBeenCalled();
	});

	it("preserves evidence and defers when analyzer intake is unavailable", async () => {
		const { AnalyzerIntakeError } = await import("../../../server/analyzer-client");
		mocks.enqueueAnalysis.mockRejectedValue(new AnalyzerIntakeError("QUEUE_UNAVAILABLE"));
		const response = await POST(request());
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.code).toBe("ANALYSIS_DEFERRED");
		expect(body.caseId).toMatch(/^case_/);
		expect(mocks.markAnalysisDeferred).toHaveBeenCalledWith(
			{ organizationId: "org_1" },
			expect.stringMatching(/^run_/),
			"QUEUE_UNAVAILABLE",
			expect.any(String),
		);
	});
});
