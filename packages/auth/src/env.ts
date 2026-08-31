import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

type AppEnvironment = "development" | "test" | "production";

const TEST_SECRET = "test-only-secret-value-000000000000000000000000";

function resolveAppEnvironment(runtimeEnv: NodeJS.ProcessEnv): AppEnvironment {
	const value = runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development");
	return value as AppEnvironment;
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

function trustedOriginsSchema() {
	return z
		.string()
		.trim()
		.refine(
			(value) =>
				value.split(",").every((origin) => {
					const trimmed = origin.trim();
					try {
						const url = new URL(trimmed);
						return url.origin === trimmed && ["http:", "https:"].includes(url.protocol);
					} catch {
						return false;
					}
				}),
			"must contain valid HTTP or HTTPS origins",
		)
		.transform((value) => [...new Set(value.split(",").map((origin) => origin.trim()))]);
}

function createAuthEnv(runtimeEnv: NodeJS.ProcessEnv): AuthEnvironment {
	const appEnvironment = resolveAppEnvironment(runtimeEnv);
	const baseUrl = runtimeEnv.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
	const baseOrigin = (() => {
		try {
			return new URL(baseUrl).origin;
		} catch {
			return baseUrl;
		}
	})();

	const parsed = createEnv({
		server: {
			APP_ENV: z.enum(["development", "test", "production"]),
			BETTER_AUTH_SECRET: z
				.string()
				.trim()
				.min(32, "must be at least 32 characters long")
				.refine(
					(value) => appEnvironment === "test" || !value.toLowerCase().startsWith("replace-"),
					"must not be a placeholder",
				),
			BETTER_AUTH_URL: urlSchema(),
			BETTER_AUTH_TRUSTED_ORIGINS: trustedOriginsSchema(),
		},
		runtimeEnvStrict: {
			APP_ENV: runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development"),
			BETTER_AUTH_SECRET:
				runtimeEnv.BETTER_AUTH_SECRET?.trim() || (appEnvironment === "test" ? TEST_SECRET : undefined),
			BETTER_AUTH_URL: baseUrl,
			BETTER_AUTH_TRUSTED_ORIGINS: runtimeEnv.BETTER_AUTH_TRUSTED_ORIGINS?.trim() || baseOrigin,
		},
		emptyStringAsUndefined: true,
		onValidationError: (issues) => {
			const variables = issues
				.map((issue) => issue.path?.map((part) => String(part)).join(".") ?? "environment")
				.join(", ");
			throw new Error(`Invalid environment variables: ${variables}`);
		},
	});

	return {
		appEnvironment: parsed.APP_ENV,
		baseUrl: parsed.BETTER_AUTH_URL,
		secret: parsed.BETTER_AUTH_SECRET,
		trustedOrigins: parsed.BETTER_AUTH_TRUSTED_ORIGINS,
	};
}

export interface AuthEnvironment {
	appEnvironment: AppEnvironment;
	baseUrl: string;
	secret: string;
	trustedOrigins: string[];
}

export function getAuthEnvironment(runtimeEnv: NodeJS.ProcessEnv = process.env): AuthEnvironment {
	return createAuthEnv(runtimeEnv);
}

// Keep a validated, typed value available to server consumers that do not need
// to construct a custom runtime environment (for example, the auth server).
export const env = getAuthEnvironment();

export type { AppEnvironment };
