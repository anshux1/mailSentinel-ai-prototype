import "server-only";

import { resolveWorkspaceContext, type WorkspaceContext } from "@mailsentinel/auth/context";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function getWorkspaceResolution() {
	return resolveWorkspaceContext(await headers());
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
	const resolution = await getWorkspaceResolution();
	if (!resolution) {
		redirect("/sign-in");
	}
	if (resolution.kind !== "authorized") {
		redirect("/session-expired");
	}
	return resolution.context;
}
