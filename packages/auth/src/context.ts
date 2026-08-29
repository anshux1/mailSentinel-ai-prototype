import type { OrganizationRole } from "@mailsentinel/db/schema";
import { listMembershipsForUser } from "@mailsentinel/db";

import { auth, type AuthSession } from "./server";

export interface WorkspaceContext {
	session: AuthSession;
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean;
	};
	organization: {
		id: string;
		name: string;
		slug: string;
	};
	role: OrganizationRole;
}

export type WorkspaceContextResult =
	| { kind: "authorized"; context: WorkspaceContext }
	| { kind: "unauthorized"; session: AuthSession; reason: "no-membership" | "multiple-memberships" }
	| null;

export async function resolveWorkspaceContext(requestHeaders: Headers): Promise<WorkspaceContextResult> {
	const session = await auth.api.getSession({ headers: requestHeaders });
	if (!session) {
		return null;
	}

	const memberships = await listMembershipsForUser(session.user.id);
	if (memberships.length === 0) {
		return { kind: "unauthorized", session, reason: "no-membership" };
	}
	if (memberships.length !== 1) {
		return { kind: "unauthorized", session, reason: "multiple-memberships" };
	}

	const membership = memberships[0];
	if (!membership) {
		return { kind: "unauthorized", session, reason: "no-membership" };
	}

	return {
		kind: "authorized",
		context: {
			session,
			user: {
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
				emailVerified: session.user.emailVerified,
			},
			organization: {
				id: membership.organizationId,
				name: membership.organizationName,
				slug: membership.organizationSlug,
			},
			role: membership.role,
		},
	};
}
