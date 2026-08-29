import Link from "next/link";

export default function NotFound() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
			<div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center sm:p-12">
				<p className="text-sm font-semibold tracking-[0.22em] text-cyan-300 uppercase">MailSentinel</p>
				<h1 className="mt-6 text-3xl font-semibold tracking-tight">Case not found</h1>
				<p className="mt-4 text-sm leading-6 text-slate-400">The requested case is unavailable in this workspace.</p>
				<Link
					className="mt-8 inline-flex rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-cyan-300/60 hover:text-cyan-200"
					href="/cases"
				>
					Back to cases
				</Link>
			</div>
		</main>
	);
}
