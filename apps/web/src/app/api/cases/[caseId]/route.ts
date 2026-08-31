import { getCaseIngestionProjection } from "@mailsentinel/db";
import { NextResponse } from "next/server";

import { getWorkspaceResolution } from "../../../../server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
	const value = request.headers.get("x-request-id");
	return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : "req_unknown";
}

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }): Promise<Response> {
	const requestId = requestIdFrom(request);
	const { caseId } = await context.params;
	let resolution: Awaited<ReturnType<typeof getWorkspaceResolution>>;
	try {
		resolution = await getWorkspaceResolution();
	} catch {
		return NextResponse.json(
			{ code: "AUTH_UNAVAILABLE", message: "Authentication is temporarily unavailable.", requestId },
			{ status: 503, headers: { "X-Request-ID": requestId } },
		);
	}
	if (!resolution) {
		return NextResponse.json(
			{ code: "AUTH_REQUIRED", message: "Authentication is required.", requestId },
			{ status: 401, headers: { "X-Request-ID": requestId } },
		);
	}
	if (resolution.kind !== "authorized") {
		return NextResponse.json(
			{ code: "CASE_NOT_FOUND", message: "Case not found.", requestId },
			{ status: 404, headers: { "X-Request-ID": requestId } },
		);
	}

	let projection: Awaited<ReturnType<typeof getCaseIngestionProjection>>;
	try {
		projection = await getCaseIngestionProjection({ organizationId: resolution.context.organization.id }, caseId);
	} catch {
		return NextResponse.json(
			{ code: "CASE_UNAVAILABLE", message: "The case is temporarily unavailable.", requestId },
			{ status: 503, headers: { "X-Request-ID": requestId } },
		);
	}
	if (!projection) {
		return NextResponse.json(
			{ code: "CASE_NOT_FOUND", message: "Case not found.", requestId },
			{ status: 404, headers: { "X-Request-ID": requestId } },
		);
	}

	return NextResponse.json(
		{
			caseId: projection.id,
			caseNumber: projection.caseNumber,
			status: projection.analysisRunStatus,
			statusExplanation:
				projection.analysisRunStatus === "queued"
					? "The original evidence is preserved and waiting for analyzer processing."
					: projection.analysisRunStatus === "analysis_deferred"
						? "The original evidence is preserved, but analysis is deferred until the analyzer is available."
						: "The analysis run could not continue; the original evidence remains preserved.",
			artifact: {
				kind: projection.artifactKind,
				originalFilename: projection.originalFilename,
				contentType: projection.contentType,
				byteSize: projection.byteSize,
				sha256: projection.sha256,
				receivedAt: projection.receivedAt,
			},
			analysis: {
				runId: projection.analysisRunId,
				status: projection.analysisRunStatus,
				analysisVersion: projection.analysisVersion,
				rulesVersion: projection.rulesVersion,
				providerMode: projection.providerMode,
				startedAt: projection.analysisStartedAt,
				completedAt: projection.analysisCompletedAt,
				failureCode: projection.failureCode,
				failureMessage: projection.failureMessageSafe,
				updatedAt: projection.analysisUpdatedAt,
			},
			requestId,
		},
		{ headers: { "X-Request-ID": requestId } },
	);
}
