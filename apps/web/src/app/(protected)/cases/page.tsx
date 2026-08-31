import { can } from "@mailsentinel/auth/permissions";
import { listCases } from "@mailsentinel/db";
import Link from "next/link";

import { EmptyCases } from "../../../components/cases/empty-cases";
import { requireWorkspaceContext } from "../../../server/session";

export default async function CasesPage() {
	const context = await requireWorkspaceContext();
	const caseRecords = await listCases({ organizationId: context.organization.id });

	return (
		<div className="space-y-8">
			<header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
				<div>
					<p className="text-sm font-medium text-cyan-300">Case queue</p>
					<h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Cases</h1>
					<p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
						Only case metadata belonging to {context.organization.name} is visible in this workspace.
					</p>
				</div>
				{can(context.role, "case.create") ? (
					<Link
						className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
						href="/cases/new"
					>
						New case
					</Link>
				) : null}
			</header>

			{caseRecords.length === 0 ? (
				<EmptyCases canCreate={can(context.role, "case.create")} />
			) : (
				<div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[680px] text-left text-sm">
							<thead className="border-b border-slate-800 bg-slate-950/50 text-xs tracking-wide text-slate-500 uppercase">
								<tr>
									<th className="px-6 py-4 font-medium" scope="col">
										Case
									</th>
									<th className="px-6 py-4 font-medium" scope="col">
										Filename
									</th>
									<th className="px-6 py-4 font-medium" scope="col">
										Status
									</th>
									<th className="px-6 py-4 font-medium" scope="col">
										Priority
									</th>
									<th className="px-6 py-4 font-medium" scope="col">
										Updated
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800">
								{caseRecords.map((caseRecord) => (
									<tr className="transition hover:bg-slate-800/40" key={caseRecord.id}>
										<td className="px-6 py-4">
											<Link
												className="font-medium text-cyan-200 hover:text-cyan-100"
												href={`/cases/${encodeURIComponent(caseRecord.id)}`}
											>
												{caseRecord.caseNumber}
											</Link>
											<p className="mt-1 text-slate-400">{caseRecord.title}</p>
										</td>
										<td className="max-w-[220px] truncate px-6 py-4 text-slate-400">
											{caseRecord.originalFilename || "—"}
										</td>
										<td className="px-6 py-4 text-slate-300">{caseRecord.status}</td>
										<td className="px-6 py-4 text-slate-300">{caseRecord.priority}</td>
										<td className="px-6 py-4 text-slate-400">{caseRecord.updatedAt.toISOString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
