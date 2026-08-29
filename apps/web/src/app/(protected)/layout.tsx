import type { ReactNode } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { requireWorkspaceContext } from "../../server/session";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
	const context = await requireWorkspaceContext();
	return <AppShell context={context}>{children}</AppShell>;
}
