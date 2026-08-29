import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { organizationMembers, organizations, user } from "@mailsentinel/db/schema";

const integrationEnabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!integrationEnabled)("Better Auth server integration", () => {
	let database: Awaited<typeof import("@mailsentinel/db")>["db"];
	let pool: Awaited<typeof import("@mailsentinel/db")>["pool"];
	let runtimeAuth: (typeof import("./server"))["auth"];
	let testUserId: string;
	let testOrganizationId: string;
	let sessionCookie: string;

	beforeAll(async () => {
		process.env.APP_ENV = "test";
		process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
		process.env.BETTER_AUTH_SECRET = "test-auth-secret-value-000000000000000000000000";
		process.env.BETTER_AUTH_URL = "http://localhost:3000";

		const dbModule = await import("@mailsentinel/db");
		database = dbModule.db;
		pool = dbModule.pool;

		const seedAuth = betterAuth({
			baseURL: "http://localhost:3000",
			secret: process.env.BETTER_AUTH_SECRET,
			database: drizzleAdapter(database, { provider: "pg" }),
			emailAndPassword: {
				enabled: true,
				disableSignUp: false,
				autoSignIn: false,
				minPasswordLength: 12,
			},
		});

		const email = `auth-${randomUUID()}@example.test`;
		const result = await seedAuth.api.signUpEmail({
			body: {
				name: "Auth Integration User",
				email,
				password: "AuthIntegrationPassword!123",
			},
		});
		if (!result.user?.id) {
			throw new Error("Could not create the auth integration user");
		}
		testUserId = result.user.id;
		await database.update(user).set({ emailVerified: true }).where(eq(user.id, testUserId));

		testOrganizationId = `org_auth_test_${randomUUID()}`;
		await database.insert(organizations).values({
			id: testOrganizationId,
			name: "Auth Integration Organization",
			slug: `auth-${randomUUID()}`,
		});
		await database.insert(organizationMembers).values({
			id: `member_auth_test_${randomUUID()}`,
			organizationId: testOrganizationId,
			userId: testUserId,
			role: "analyst",
		});

		runtimeAuth = (await import("./server")).auth;
	});

	afterAll(async () => {
		if (!database || !pool) {
			return;
		}
		if (testOrganizationId) {
			await database.delete(organizations).where(eq(organizations.id, testOrganizationId));
		}
		if (testUserId) {
			await database.delete(user).where(eq(user.id, testUserId));
		}
		await pool.end();
	});

	it("creates a session for valid credentials", async () => {
		const [testAccount] = await database
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, testUserId))
			.limit(1);
		const validResponse = await runtimeAuth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testAccount?.email,
					password: "AuthIntegrationPassword!123",
				}),
			}),
		);

		expect(validResponse.status).toBe(200);
		const cookie = validResponse.headers.get("set-cookie");
		expect(cookie).toContain("session_token");
		sessionCookie = cookie?.split(";")[0] ?? "";
		expect(sessionCookie).not.toBe("");

		const { resolveWorkspaceContext } = await import("./context");
		const resolution = await resolveWorkspaceContext(new Headers({ cookie: sessionCookie }));
		expect(resolution?.kind).toBe("authorized");
		if (resolution?.kind === "authorized") {
			expect(resolution.context.organization.id).toBe(testOrganizationId);
			expect(resolution.context.role).toBe("analyst");
		}
	});

	it("returns a generic error for invalid credentials", async () => {
		const response = await runtimeAuth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: "unknown@example.test",
					password: "WrongPassword!123",
				}),
			}),
		);
		const body = await response.text();

		expect(response.status).toBe(401);
		expect(body).not.toContain("unknown@example.test");
		expect(body).not.toContain("user not found");
	});

	it("rejects public sign-up and signs out a valid session", async () => {
		const [testAccount] = await database
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, testUserId))
			.limit(1);
		const signUpResponse = await runtimeAuth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					name: "Should Not Exist",
					email: `blocked-${randomUUID()}@example.test`,
					password: "BlockedSignupPassword!123",
				}),
			}),
		);
		expect(signUpResponse.status).toBe(400);

		if (!sessionCookie) {
			throw new Error(`Expected a session cookie for ${testAccount?.email ?? "the test user"}`);
		}
		const signOutResponse = await runtimeAuth.handler(
			new Request("http://localhost:3000/api/auth/sign-out", {
				method: "POST",
				headers: {
					cookie: sessionCookie,
					origin: "http://localhost:3000",
				},
			}),
		);
		expect(signOutResponse.status).toBe(200);
	});
});
