import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";

import { db, pool } from "./src/client";
import { getSeedEnvironment } from "./src/env";
import { account, organizationMembers, organizations, user } from "./src/schema";

const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
if (!authSecret || authSecret.length < 32) {
	throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters for seeding");
}

const seedAuth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
	secret: authSecret,
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		autoSignIn: false,
		minPasswordLength: 12,
		maxPasswordLength: 128,
	},
});

interface SeedUser {
	name: string;
	email: string;
	password: string;
}

async function ensureUser(input: SeedUser): Promise<typeof user.$inferSelect> {
	const [existing] = await db.select().from(user).where(eq(user.email, input.email)).limit(1);

	if (existing) {
		const [credentialAccount] = await db
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")))
			.limit(1);

		if (!credentialAccount) {
			throw new Error(`Seed user is missing a credential account: ${input.email}`);
		}

		if (!existing.emailVerified) {
			const [verifiedUser] = await db
				.update(user)
				.set({ emailVerified: true })
				.where(eq(user.id, existing.id))
				.returning();
			return verifiedUser ?? { ...existing, emailVerified: true };
		}

		return existing;
	}

	const result = await seedAuth.api.signUpEmail({
		body: {
			name: input.name,
			email: input.email,
			password: input.password,
		},
	});

	if (!result.user?.id) {
		throw new Error(`Seed user creation failed: ${input.email}`);
	}

	const [verifiedUser] = await db
		.update(user)
		.set({ emailVerified: true })
		.where(eq(user.id, result.user.id))
		.returning();

	if (!verifiedUser) {
		throw new Error(`Seed user verification update failed: ${input.email}`);
	}

	return verifiedUser;
}

async function seed(): Promise<void> {
	const seedEnvironment = getSeedEnvironment();
	const analyst = await ensureUser({
		name: "Demo Analyst",
		email: seedEnvironment.analystEmail,
		password: seedEnvironment.analystPassword,
	});
	const supervisor = await ensureUser({
		name: "Demo Supervisor",
		email: seedEnvironment.supervisorEmail,
		password: seedEnvironment.supervisorPassword,
	});

	await db.transaction(async (transaction) => {
		const [organization] = await transaction
			.insert(organizations)
			.values({
				id: "org_demo",
				name: seedEnvironment.organizationName,
				slug: seedEnvironment.organizationSlug,
			})
			.onConflictDoUpdate({
				target: organizations.slug,
				set: { name: seedEnvironment.organizationName },
			})
			.returning();

		if (!organization) {
			throw new Error("Demo organization could not be created");
		}

		await transaction
			.insert(organizationMembers)
			.values([
				{
					id: "member_demo_analyst",
					organizationId: organization.id,
					userId: analyst.id,
					role: "analyst",
				},
				{
					id: "member_demo_supervisor",
					organizationId: organization.id,
					userId: supervisor.id,
					role: "supervisor",
				},
			])
			.onConflictDoUpdate({
				target: [organizationMembers.organizationId, organizationMembers.userId],
				set: { role: "analyst" },
			});

		await transaction
			.update(organizationMembers)
			.set({ role: "supervisor" })
			.where(
				and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, supervisor.id)),
			);
	});

	console.log("Seeded the synthetic MailSentinel demo organization and users.");
}

try {
	await seed();
} finally {
	await pool.end();
}
