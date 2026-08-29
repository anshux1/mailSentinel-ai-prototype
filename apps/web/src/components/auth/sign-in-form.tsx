"use client";

import { authClient } from "@mailsentinel/auth/client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

const invalidCredentialsMessage = "Unable to sign in with those credentials.";

export function SignInForm() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");

		if (!email || !password) {
			setErrorMessage("Enter your email and password to continue.");
			return;
		}

		setErrorMessage(null);
		startTransition(async () => {
			const { error } = await authClient.signIn.email({ email, password, rememberMe: true });
			if (error) {
				setErrorMessage(invalidCredentialsMessage);
				return;
			}

			router.replace("/dashboard");
			router.refresh();
		});
	}

	return (
		<form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
			<div>
				<label className="block text-sm font-medium text-slate-200" htmlFor="email">
					Email address
				</label>
				<input
					className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
					autoComplete="username"
					id="email"
					inputMode="email"
					name="email"
					placeholder="analyst@example.test"
					required
					type="email"
				/>
			</div>
			<div>
				<label className="block text-sm font-medium text-slate-200" htmlFor="password">
					Password
				</label>
				<input
					className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
					autoComplete="current-password"
					id="password"
					name="password"
					required
					type="password"
				/>
			</div>
			{errorMessage ? (
				<p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200" role="alert">
					{errorMessage}
				</p>
			) : null}
			<button
				className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-wait disabled:opacity-60"
				disabled={isPending}
				type="submit"
			>
				{isPending ? "Signing in..." : "Sign in"}
			</button>
		</form>
	);
}
