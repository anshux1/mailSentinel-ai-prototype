import Link from "next/link";

export function EmptyCases({ canCreate = false }: { canCreate?: boolean }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
			<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
				<span aria-hidden="true" className="text-xl">
					+
				</span>
			</div>
			<h2 className="mt-5 text-lg font-semibold text-slate-100">No cases yet</h2>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
				{canCreate
					? "Preserve a bounded .eml file to create the first case. Forensic parsing and scoring remain deferred until a later phase."
					: "No cases are available in this workspace yet."}
			</p>
			{canCreate ? (
				<Link
					className="mt-5 inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
					href="/cases/new"
				>
					Create a case
				</Link>
			) : null}
		</div>
	);
}
