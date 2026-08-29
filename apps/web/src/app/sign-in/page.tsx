import { resolveWorkspaceContext } from "@mailsentinel/auth/context";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignInForm } from "../../components/auth/sign-in-form";

export default async function SignInPage() {
	const resolution = await resolveWorkspaceContext(await headers());
	if (resolution?.kind === "authorized") {
		redirect("/dashboard");
	}
	if (resolution?.kind === "unauthorized") {
		redirect("/session-expired");
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
			<div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-cyan-950/20 lg:grid-cols-[1.05fr_0.95fr]">
				<section className="hidden border-r border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_42%),linear-gradient(145deg,_#0f172a,_#111827)] p-10 lg:block xl:p-14">
					<p className="text-sm font-semibold tracking-[0.22em] text-cyan-300 uppercase">MailSentinel</p>
					<h1 className="mt-20 max-w-md text-5xl font-semibold tracking-tight text-white">
						Trace the signal. Preserve the evidence.
					</h1>
					<p className="mt-6 max-w-md text-base leading-7 text-slate-400">
						A focused workspace for reviewing suspicious email infrastructure with transparent evidence and measured
						uncertainty.
					</p>
					<div className="mt-16 grid grid-cols-2 gap-3 text-xs text-slate-400">
						<div className="rounded-xl border border-slate-700/80 bg-slate-950/30 p-4">Evidence first</div>
						<div className="rounded-xl border border-slate-700/80 bg-slate-950/30 p-4">Tenant scoped</div>
					</div>
				</section>
				<section className="p-7 sm:p-10 xl:p-14">
					<p className="text-sm text-slate-400">Analyst workspace</p>
					<h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Sign in to continue</h2>
					<p className="mt-3 text-sm leading-6 text-slate-400">
						Use a provisioned MailSentinel account. Public registration is disabled for this prototype.
					</p>
					<SignInForm />
				</section>
			</div>
		</main>
	);
}
