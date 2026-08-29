import Link from "next/link";

export default function SessionExpiredPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
			<div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl shadow-slate-950/50 sm:p-12">
				<p className="text-sm font-semibold tracking-[0.22em] text-cyan-300 uppercase">MailSentinel</p>
				<h1 className="mt-6 text-3xl font-semibold tracking-tight">Workspace access unavailable</h1>
				<p className="mt-4 text-sm leading-6 text-slate-400">
					Your session may have expired, or this account is not assigned to an analyst workspace.
				</p>
				<Link
					className="mt-8 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-900"
					href="/sign-in"
				>
					Return to sign in
				</Link>
			</div>
		</main>
	);
}
