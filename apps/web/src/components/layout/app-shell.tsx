import type { WorkspaceContext } from "@mailsentinel/auth/context";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "./sign-out-button";

interface AppShellProps {
	context: WorkspaceContext;
	children: ReactNode;
}

export function AppShell({ context, children }: AppShellProps) {
	return (
		<div className="min-h-screen bg-slate-950 text-slate-100">
			<header className="border-b border-slate-800/80 bg-slate-950/95">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
					<div className="flex min-w-0 items-center gap-8">
						<Link
							className="shrink-0 text-sm font-semibold tracking-[0.22em] text-cyan-300 uppercase"
							href="/dashboard"
						>
							MailSentinel
						</Link>
						<nav aria-label="Primary" className="hidden items-center gap-1 text-sm md:flex">
							<Link
								className="rounded-lg px-3 py-2 text-slate-400 transition hover:bg-slate-900 hover:text-slate-100"
								href="/dashboard"
							>
								Dashboard
							</Link>
							<Link
								className="rounded-lg px-3 py-2 text-slate-400 transition hover:bg-slate-900 hover:text-slate-100"
								href="/cases"
							>
								Cases
							</Link>
						</nav>
					</div>
					<div className="flex items-center gap-3">
						<div className="hidden text-right sm:block">
							<p className="truncate text-sm font-medium text-slate-200">{context.user.name}</p>
							<p className="truncate text-xs text-slate-500">{context.role}</p>
						</div>
						<SignOutButton />
					</div>
				</div>
			</header>
			<div className="border-b border-slate-900 bg-slate-900/50 md:hidden">
				<nav aria-label="Mobile" className="mx-auto flex max-w-7xl gap-1 px-6 py-2 text-sm lg:px-8">
					<Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800" href="/dashboard">
						Dashboard
					</Link>
					<Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800" href="/cases">
						Cases
					</Link>
				</nav>
			</div>
			<main className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-8">{children}</main>
		</div>
	);
}
