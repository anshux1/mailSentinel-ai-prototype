import { resolveWorkspaceContext } from "@mailsentinel/auth/context";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
	const resolution = await resolveWorkspaceContext(await headers());
	if (resolution?.kind === "authorized") {
		redirect("/dashboard");
	}
	if (resolution?.kind === "unauthorized") {
		redirect("/session-expired");
	}
	redirect("/sign-in");
}
