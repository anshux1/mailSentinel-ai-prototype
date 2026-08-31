import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnv, type StandardSchemaV1 } from "@t3-oss/env-core";
import * as z from "zod";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(packageDirectory, "../../../.env");

// Drizzle CLI and the seed script run outside Next.js, so load the repository
// environment before handing it to T3 Env for validation.
loadDotenv({ path: rootEnvPath });

const TEST_SECRET = "test-only-secret-value-000000000000000000000000";
type AppEnvironment = "development" | "test" | "production";

function resolveAppEnvironment(runtimeEnv: NodeJS.ProcessEnv): AppEnvironment {
	const value = runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development");
	return value as AppEnvironment;
}

function postgresUrlSchema() {
	return z
		.string()
		.trim()
		.refine((value) => {
			try {
				const url = new URL(value);
				return Boolean(url.hostname) && ["postgres:", "postgresql:"].includes(url.protocol);
			} catch {
				return false;
			}
		}, "must be a valid PostgreSQL URL");
}

function urlSchema() {
	return z
		.string()
		.trim()
		.refine((value) => {
			try {
				const url = new URL(value);
				return Boolean(url.hostname) && ["http:", "https:"].includes(url.protocol);
			} catch {
				return false;
			}
		}, "must be a valid HTTP or HTTPS URL")
		.transform((value) => new URL(value).origin);
}

function secretSchema(appEnvironment: AppEnvironment) {
	return z
		.string()
		.trim()
		.min(32, "must be at least 32 characters long")
		.refine(
			(value) => appEnvironment === "test" || !value.toLowerCase().startsWith("replace-"),
			"must not be a placeholder",
		);
}

function validationError(issues: readonly StandardSchemaV1.Issue[]): never {
	const variables = issues
		.map((issue) => {
			const path = issue.path?.map((part) => String(part)).join(".") ?? "environment";
			return `${path} (${issue.message})`;
		})
		.join(", ");
	throw new Error(`Invalid environment variables: ${variables}`);
}

function createDatabaseEnv(runtimeEnv: NodeJS.ProcessEnv) {
	return createEnv({
		server: {
			DATABASE_URL: postgresUrlSchema(),
		},
		runtimeEnvStrict: {
			DATABASE_URL: runtimeEnv.DATABASE_URL,
		},
		emptyStringAsUndefined: true,
		onValidationError: validationError,
	});
}

function createSeedEnv(runtimeEnv: NodeJS.ProcessEnv): SeedEnvironmentValues {
	const appEnvironment = resolveAppEnvironment(runtimeEnv);
	const betterAuthUrl = runtimeEnv.BETTER_AUTH_URL?.trim() || "http://localhost:3000";

	return createEnv({
		server: {
			APP_ENV: z.enum(["development", "test", "production"]),
			DATABASE_URL: postgresUrlSchema(),
			BETTER_AUTH_SECRET: secretSchema(appEnvironment),
			BETTER_AUTH_URL: urlSchema(),
			SEED_ORGANIZATION_NAME: z.string().trim().min(1),
			SEED_ORGANIZATION_SLUG: z
				.string()
				.trim()
				.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must contain lowercase letters, numbers, and single hyphens"),
			SEED_ANALYST_EMAIL: z.string().trim().min(1),
			SEED_ANALYST_PASSWORD: z
				.string()
				.trim()
				.min(12)
				.refine((value) => !value.toLowerCase().startsWith("replace-"), "must not be a placeholder"),
			SEED_SUPERVISOR_EMAIL: z.string().trim().min(1),
			SEED_SUPERVISOR_PASSWORD: z
				.string()
				.trim()
				.min(12)
				.refine((value) => !value.toLowerCase().startsWith("replace-"), "must not be a placeholder"),
		},
		runtimeEnvStrict: {
			APP_ENV: runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development"),
			DATABASE_URL: runtimeEnv.DATABASE_URL,
			BETTER_AUTH_SECRET:
				runtimeEnv.BETTER_AUTH_SECRET?.trim() || (appEnvironment === "test" ? TEST_SECRET : undefined),
			BETTER_AUTH_URL: betterAuthUrl,
			SEED_ORGANIZATION_NAME: runtimeEnv.SEED_ORGANIZATION_NAME,
			SEED_ORGANIZATION_SLUG: runtimeEnv.SEED_ORGANIZATION_SLUG,
			SEED_ANALYST_EMAIL: runtimeEnv.SEED_ANALYST_EMAIL,
			SEED_ANALYST_PASSWORD: runtimeEnv.SEED_ANALYST_PASSWORD,
			SEED_SUPERVISOR_EMAIL: runtimeEnv.SEED_SUPERVISOR_EMAIL,
			SEED_SUPERVISOR_PASSWORD: runtimeEnv.SEED_SUPERVISOR_PASSWORD,
		},
		emptyStringAsUndefined: true,
		onValidationError: validationError,
	});
}

type SeedEnvironmentValues = {
	APP_ENV: AppEnvironment;
	DATABASE_URL: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	SEED_ORGANIZATION_NAME: string;
	SEED_ORGANIZATION_SLUG: string;
	SEED_ANALYST_EMAIL: string;
	SEED_ANALYST_PASSWORD: string;
	SEED_SUPERVISOR_EMAIL: string;
	SEED_SUPERVISOR_PASSWORD: string;
};

export function getDatabaseUrl(runtimeEnv: NodeJS.ProcessEnv = process.env): string {
	return createDatabaseEnv(runtimeEnv).DATABASE_URL;
}

export interface SeedEnvironment {
	organizationName: string;
	organizationSlug: string;
	analystEmail: string;
	analystPassword: string;
	supervisorEmail: string;
	supervisorPassword: string;
	authSecret: string;
	authBaseUrl: string;
}

export function getSeedEnvironment(runtimeEnv: NodeJS.ProcessEnv = process.env): SeedEnvironment {
	const parsed = createSeedEnv(runtimeEnv);
	if (parsed.SEED_ANALYST_EMAIL.toLowerCase() === parsed.SEED_SUPERVISOR_EMAIL.toLowerCase()) {
		throw new Error("SEED_ANALYST_EMAIL and SEED_SUPERVISOR_EMAIL must be different");
	}

	return {
		organizationName: parsed.SEED_ORGANIZATION_NAME,
		organizationSlug: parsed.SEED_ORGANIZATION_SLUG,
		analystEmail: parsed.SEED_ANALYST_EMAIL,
		analystPassword: parsed.SEED_ANALYST_PASSWORD,
		supervisorEmail: parsed.SEED_SUPERVISOR_EMAIL,
		supervisorPassword: parsed.SEED_SUPERVISOR_PASSWORD,
		authSecret: parsed.BETTER_AUTH_SECRET,
		authBaseUrl: parsed.BETTER_AUTH_URL,
	};
}
