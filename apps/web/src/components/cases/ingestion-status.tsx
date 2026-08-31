"use client";

import { useEffect, useState } from "react";

interface IngestionStatusProps {
	caseId: string;
	initial: {
		status: string;
		statusExplanation: string;
		artifact: {
			kind: string;
			originalFilename: string | null;
			contentType: string;
			byteSize: number;
			sha256: string;
			receivedAt: string;
		};
		analysis: {
			runId: string;
			status: string;
			analysisVersion: string;
			rulesVersion: string;
			providerMode: string;
			failureCode: string | null;
			failureMessage: string | null;
			updatedAt: string;
		};
	};
}

interface ProjectionResponse {
	status?: string;
	statusExplanation?: string;
	artifact?: IngestionStatusProps["initial"]["artifact"];
	analysis?: IngestionStatusProps["initial"]["analysis"];
}

function formatBytes(bytes: number): string {
	return bytes < 1024 * 1024
		? `${Math.max(1, Math.round(bytes / 1024))} KB`
		: `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? "Unknown" : date.toISOString();
}

function isProjectionResponse(value: unknown): value is ProjectionResponse {
	return Boolean(value && typeof value === "object" && typeof (value as ProjectionResponse).status === "string");
}

export function IngestionStatus({ caseId, initial }: IngestionStatusProps) {
	const [projection, setProjection] = useState(initial);
	const [pollError, setPollError] = useState(false);

	useEffect(() => {
		if (projection.status !== "queued") {
			return;
		}

		let stopped = false;
		let delay = 2500;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			if (stopped) {
				return;
			}
			if (document.visibilityState === "hidden") {
				timer = setTimeout(poll, delay);
				return;
			}
			try {
				const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { cache: "no-store" });
				if (!response.ok) {
					throw new Error("Status request failed");
				}
				const body: unknown = await response.json();
				if (isProjectionResponse(body) && body.artifact && body.analysis && body.statusExplanation) {
					setProjection((current) => ({
						...current,
						status: body.status ?? current.status,
						statusExplanation: body.statusExplanation ?? current.statusExplanation,
						artifact: body.artifact ?? current.artifact,
						analysis: body.analysis ?? current.analysis,
					}));
				}
				setPollError(false);
				delay = 2500;
			} catch {
				setPollError(true);
				delay = Math.min(delay * 2, 15_000);
			}
			if (!stopped) {
				timer = setTimeout(poll, delay);
			}
		};

		void poll();
		return () => {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
			}
		};
	}, [caseId, projection.status]);

	return (
		<section aria-live="polite" className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
				<div>
					<p className="text-sm font-medium text-cyan-300">Evidence preservation</p>
					<h2 className="mt-2 text-xl font-semibold text-white">{projection.status}</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{projection.statusExplanation}</p>
				</div>
				<div className="rounded-lg border border-slate-700 px-3 py-2 text-right text-xs text-slate-400">
					<p>Analyzer state</p>
					<p className="mt-1 font-medium text-slate-200">{projection.analysis.status}</p>
				</div>
			</div>

			{pollError && projection.status === "queued" ? (
				<p className="rounded-lg border border-amber-800/80 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
					The latest status could not be loaded. Showing the last known state and retrying with backoff.
				</p>
			) : null}

			<dl className="grid gap-4 text-sm sm:grid-cols-2">
				<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
					<dt className="text-slate-500">Original filename</dt>
					<dd className="mt-1 break-all text-slate-200">{projection.artifact.originalFilename || "Not supplied"}</dd>
				</div>
				<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
					<dt className="text-slate-500">Artifact</dt>
					<dd className="mt-1 text-slate-200">
						{projection.artifact.kind} · {formatBytes(projection.artifact.byteSize)}
					</dd>
				</div>
				<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 sm:col-span-2">
					<dt className="text-slate-500">SHA-256</dt>
					<dd className="mt-1 break-all font-mono text-xs text-cyan-200">{projection.artifact.sha256}</dd>
				</div>
				<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
					<dt className="text-slate-500">Received</dt>
					<dd className="mt-1 text-slate-200">{formatDate(projection.artifact.receivedAt)}</dd>
				</div>
				<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
					<dt className="text-slate-500">Provider mode</dt>
					<dd className="mt-1 text-slate-200">{projection.analysis.providerMode}</dd>
				</div>
			</dl>

			{projection.analysis.failureCode ? (
				<div className="rounded-lg border border-amber-800/80 bg-amber-950/20 p-4 text-sm">
					<p className="font-medium text-amber-200">{projection.analysis.failureCode}</p>
					{projection.analysis.failureMessage ? (
						<p className="mt-1 text-amber-100/80">{projection.analysis.failureMessage}</p>
					) : null}
				</div>
			) : null}
			<p className="text-xs leading-5 text-slate-500">
				Forensic parsing, enrichment and scoring have not run in this phase. The original email body and object storage
				path are intentionally not displayed.
			</p>
		</section>
	);
}
