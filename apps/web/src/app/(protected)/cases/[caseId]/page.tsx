import { getCase } from "@mailsentinel/db";
import { notFound } from "next/navigation";

import { requireWorkspaceContext } from "../../../../server/session";

export default async function CaseDetailPage(props: PageProps<"/cases/[caseId]">) {
	const { caseId } = await props.params;
	const context = await requireWorkspaceContext();
	const caseRecord = await getCase({ organizationId: context.organization.id }, caseId);

	if (!caseRecord) {
		notFound();
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
			<section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
				<h2 className="text-lg font-semibold text-slate-100">Analysis not available yet</h2>
				<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
					This case shell is ready for evidence ingestion. Parsed headers, observations and verdicts will appear in a
					later phase.
				</p>
			</section>
		</div>
	);
}
