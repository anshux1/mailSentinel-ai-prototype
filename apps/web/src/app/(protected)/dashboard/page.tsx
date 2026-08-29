import { countCases } from "@mailsentinel/db";

import { EmptyCases } from "../../../components/cases/empty-cases";
import { requireWorkspaceContext } from "../../../server/session";

export default async function DashboardPage() {
	const context = await requireWorkspaceContext();
	const caseCount = await countCases({ organizationId: context.organization.id });

	return (
		<div className="space-y-10">
			<section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
				<div>
					<p className="text-sm font-medium text-cyan-300">{context.organization.name}</p>
					<h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Investigation workspace</h1>
					<p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
						Review email evidence with an explicit chain from observations to conclusions. Your current access level is{" "}
						{context.role}.
					</p>
				</div>
				<div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm">
					<p className="text-slate-500">Cases in workspace</p>
					<p className="mt-1 text-3xl font-semibold text-white">{caseCount}</p>
				</div>
			</section>
			<section>
				<div className="mb-4 flex items-center justify-between gap-4">
					<div>
						<h2 className="text-lg font-semibold text-white">Recent cases</h2>
						<p className="mt-1 text-sm text-slate-500">The queue will populate when evidence ingestion is enabled.</p>
					</div>
				</div>
				<EmptyCases />
			</section>
		</div>
	);
}
