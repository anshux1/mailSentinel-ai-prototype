export default function ProtectedLoading() {
	return (
		<div aria-busy="true" aria-live="polite" className="space-y-8">
			<div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
			<div className="h-10 w-72 animate-pulse rounded bg-slate-800" />
			<div className="h-5 w-full max-w-2xl animate-pulse rounded bg-slate-900" />
			<div className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
			<span className="sr-only">Loading workspace</span>
		</div>
	);
}
