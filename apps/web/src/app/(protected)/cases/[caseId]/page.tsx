import { appendAuditEvent, getCase, getCaseIngestionProjection } from "@mailsentinel/db";
import { notFound } from "next/navigation";

import { IngestionStatus } from "../../../../components/cases/ingestion-status";
import { requireWorkspaceContext } from "../../../../server/session";

function statusExplanation(status: string): string {
	if (status === "queued") {
		return "The original evidence is preserved and waiting for analyzer processing.";
	}
	if (status === "analysis_deferred") {
		return "The original evidence is preserved, but analysis is deferred until the analyzer or parser is available.";
	}
	return "The analysis run could not continue; the original evidence remains preserved.";
}

export default async function CaseDetailPage(props: PageProps<"/cases/[caseId]">) {
	const { caseId } = await props.params;
	const context = await requireWorkspaceContext();
	const caseRecord = await getCase({ organizationId: context.organization.id }, caseId);

	if (!caseRecord) {
		notFound();
	}

	const ingestion = await getCaseIngestionProjection({ organizationId: context.organization.id }, caseId);
	if (ingestion) {
		await appendAuditEvent({
			organizationId: context.organization.id,
			actorType: "user",
			actorId: context.user.id,
			action: "case.viewed",
			caseId,
			targetType: "case",
			targetId: caseId,
			requestId: `view_${caseId}_${Date.now()}`.slice(0, 128),
			metadataRedacted: { status: ingestion.analysisRunStatus },
		}).catch(() => undefined);
	}

	return (
		<div className="space-y-8">
			<header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
				<div>
					<p className="text-sm font-medium text-cyan-300">Case {caseRecord.caseNumber}</p>
					<h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{caseRecord.title}</h1>
					<p className="mt-3 text-sm text-slate-500">Workspace: {context.organization.name}</p>
				</div>
				<div className="flex gap-2 text-xs font-medium uppercase">
					<span className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300">{caseRecord.status}</span>
					<span className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300">{caseRecord.priority}</span>
				</div>
			</header>
			{ingestion ? (
				<IngestionStatus
					caseId={caseId}
					initial={{
						status: ingestion.analysisRunStatus,
						statusExplanation: statusExplanation(ingestion.analysisRunStatus),
						artifact: {
							kind: ingestion.artifactKind,
							originalFilename: ingestion.originalFilename,
							contentType: ingestion.contentType,
							byteSize: ingestion.byteSize,
							sha256: ingestion.sha256,
							receivedAt: ingestion.receivedAt.toISOString(),
						},
						analysis: {
							runId: ingestion.analysisRunId,
							status: ingestion.analysisRunStatus,
							analysisVersion: ingestion.analysisVersion,
							rulesVersion: ingestion.rulesVersion,
							providerMode: ingestion.providerMode,
							failureCode: ingestion.failureCode,
							failureMessage: ingestion.failureMessageSafe,
							updatedAt: ingestion.analysisUpdatedAt.toISOString(),
						},
					}}
				/>
			) : (
				<section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
					<h2 className="text-lg font-semibold text-slate-100">Analysis not available yet</h2>
					<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
						This older case does not have a Phase 3 evidence artifact. New uploads will display preservation metadata
						and truthful queued or deferred status here.
					</p>
				</section>
			)}
		</div>
	);
}
