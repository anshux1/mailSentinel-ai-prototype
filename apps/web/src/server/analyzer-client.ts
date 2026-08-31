import "server-only";

import type { components } from "@mailsentinel/contracts/analyzer";

import { env } from "./env";

export type AnalyzerArtifactReference = components["schemas"]["ArtifactReference"];
export type AnalyzerIntakeRequest = components["schemas"]["AnalysisIntakeRequest"];
export type AnalyzerIntakeResponse = components["schemas"]["AnalysisAcceptedResponse"];

export type AnalyzerFailureCode = "QUEUE_UNAVAILABLE" | "ANALYZER_REJECTED" | "ANALYZER_CONTRACT_INVALID";

export class AnalyzerIntakeError extends Error {
	constructor(readonly code: AnalyzerFailureCode) {
		super(code === "QUEUE_UNAVAILABLE" ? "The analyzer queue is unavailable" : "The analyzer rejected the intake");
		this.name = "AnalyzerIntakeError";
	}
}

function isAnalyzerIntakeResponse(value: unknown): value is AnalyzerIntakeResponse {
	if (!value || typeof value !== "object") {
		return false;
	}
	const response = value as Record<string, unknown>;
	return (
		typeof response.analysisRunId === "string" &&
		response.status === "queued" &&
		typeof response.acceptedAt === "string" &&
		typeof response.requestId === "string"
	);
}

export async function enqueueAnalysis(input: AnalyzerIntakeRequest): Promise<AnalyzerIntakeResponse> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), env.analyzerRequestTimeoutMs);
	try {
		const response = await fetch(new URL("/v1/analyses", env.analyzerInternalUrl), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.analyzerServiceToken}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify(input),
			signal: controller.signal,
		});

		if (response.status === 202) {
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				throw new AnalyzerIntakeError("ANALYZER_CONTRACT_INVALID");
			}
			if (!isAnalyzerIntakeResponse(body)) {
				throw new AnalyzerIntakeError("ANALYZER_CONTRACT_INVALID");
			}
			return body;
		}
		if (response.status >= 500) {
			throw new AnalyzerIntakeError("QUEUE_UNAVAILABLE");
		}
		throw new AnalyzerIntakeError("ANALYZER_REJECTED");
	} catch (error) {
		if (error instanceof AnalyzerIntakeError) {
			throw error;
		}
		throw new AnalyzerIntakeError("QUEUE_UNAVAILABLE");
	} finally {
		clearTimeout(timeout);
	}
}
