"use client";

import { useTransition } from "react";

export default function ProtectedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	const [isPending, startTransition] = useTransition();

	return (
		<div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center">
			<h2 className="text-lg font-semibold text-rose-100">Workspace temporarily unavailable</h2>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-rose-200/80">
				The workspace could not load safely. Try again without exposing any message content.
			</p>
			<button
				className="mt-6 rounded-xl border border-rose-300/40 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-300/10 disabled:cursor-wait disabled:opacity-60"
				disabled={isPending}
				onClick={() => startTransition(() => reset())}
				type="button"
			>
				{isPending ? "Retrying..." : "Try again"}
			</button>
		</div>
	);
}
