import { can } from "@mailsentinel/auth/permissions";
import { redirect } from "next/navigation";

import { NewCaseForm } from "../../../../components/cases/new-case-form";
import { env } from "../../../../server/env";
import { requireWorkspaceContext } from "../../../../server/session";

export default async function NewCasePage() {
	const context = await requireWorkspaceContext();
	if (!can(context.role, "case.create")) {
		redirect("/cases");
	}

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<header>
				<p className="text-sm font-medium text-cyan-300">Evidence intake</p>
				<h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Create a new case</h1>
				<p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
					Preserve a bounded raw email file for {context.organization.name}. The original bytes are stored privately and
					analysis will remain queued or deferred until the forensic parser is available.
				</p>
			</header>
			<section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/30">
				<NewCaseForm maxBytes={env.maxEmlBytes} />
			</section>
		</div>
	);
}
