"use client";

import { authClient } from "@mailsentinel/auth/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SignOutButton() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function signOut() {
		startTransition(async () => {
			await authClient.signOut();
			router.replace("/sign-in");
			router.refresh();
		});
	}

	return (
		<button
			className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 disabled:cursor-wait disabled:opacity-60"
			disabled={isPending}
			onClick={signOut}
			type="button"
		>
			{isPending ? "Signing out..." : "Sign out"}
		</button>
	);
}
