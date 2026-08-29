export function EmptyCases() {
	return (
		<div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
			<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
				<span aria-hidden="true" className="text-xl">
					+
				</span>
			</div>
			<h2 className="mt-5 text-lg font-semibold text-slate-100">No cases yet</h2>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
				The workspace is ready. Evidence ingestion will be connected in the next phase, so no analysis data is shown
				here yet.
			</p>
		</div>
	);
}
