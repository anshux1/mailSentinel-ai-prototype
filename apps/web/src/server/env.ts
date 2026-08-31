import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

type AppEnvironment = "development" | "test" | "production";

interface ServerEnv {
	appEnv: AppEnvironment;
	databaseUrl: URL;
	betterAuthSecret: string;
	betterAuthUrl: URL;
	betterAuthTrustedOrigins: string[];
	analyzerInternalUrl: URL;
	analyzerServiceToken: string;
	s3Endpoint: URL;
	s3Region: string;
	s3Bucket: string;
	s3AccessKeyId: string;
	s3SecretAccessKey: string;
	s3ForcePathStyle: boolean;
	maxEmlBytes: number;
	retentionDays: number;
	uploadTimeoutMs: number;
	analyzerRequestTimeoutMs: number;
}

const REQUIRED_MIN_LENGTH = 32;
const TEST_SECRET = "test-only-secret-value-000000000000000000000000";
const developmentDefaults = {
	databaseUrl: "postgresql://mailsentinel:replace-me@localhost:5432/mailsentinel",
	betterAuthUrl: "http://localhost:3000",
	analyzerInternalUrl: "http://localhost:8000",
	s3Endpoint: "http://localhost:9000",
	s3Region: "us-east-1",
	s3Bucket: "mailsentinel-evidence",
	s3AccessKeyId: "replace-me",
	s3SecretAccessKey: "replace-me",
	s3ForcePathStyle: "true",
	maxEmlBytes: "26214400",
	retentionDays: "90",
	uploadTimeoutMs: "120000",
	analyzerRequestTimeoutMs: "3000",
} as const;

function isPlaceholder(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return normalized.startsWith("replace-") || normalized.startsWith("your-");
}

function resolveAppEnvironment(runtimeEnv: NodeJS.ProcessEnv): AppEnvironment {
	const value = runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development");
	if (value === "development" || value === "test" || value === "production") {
		return value;
	}
	return value as AppEnvironment;
}

function urlSchema(protocols: readonly string[]) {
	return z
		.string()
		.trim()
		.refine(
			(value) => {
				try {
					const url = new URL(value);
					return Boolean(url.hostname) && protocols.includes(url.protocol.slice(0, -1));
				} catch {
					return false;
				}
			},
			{ message: `must be a valid URL using ${protocols.join(" or ")}` },
		);
}

function postgresUrlSchema() {
	return urlSchema(["postgres", "postgresql"]);
}

function positiveIntegerSchema(maximum?: number) {
	const schema = z
		.string()
		.trim()
		.regex(/^[1-9]\d*$/, "must be a positive integer")
		.transform(Number);
	return maximum === undefined ? schema : schema.pipe(z.number().max(maximum, `must be at most ${maximum}`));
}

function booleanSchema() {
	return z.enum(["true", "false"]).transform((value) => value === "true");
}

function secretSchema(appEnv: AppEnvironment) {
	return z
		.string()
		.trim()
		.min(REQUIRED_MIN_LENGTH, `must be at least ${REQUIRED_MIN_LENGTH} characters long`)
		.refine((value) => appEnv === "test" || !isPlaceholder(value), "must not be a placeholder");
}

function storageCredentialSchema(appEnv: AppEnvironment) {
	return z
		.string()
		.trim()
		.min(1)
		.refine((value) => appEnv === "test" || !isPlaceholder(value), "must not be a placeholder");
}

function trustedOriginsSchema() {
	return z
		.string()
		.trim()
		.refine(
			(value) =>
				value.split(",").every((origin) => {
					try {
						const url = new URL(origin.trim());
						return url.origin === origin.trim() && ["http:", "https:"].includes(url.protocol);
					} catch {
						return false;
					}
				}),
			"must contain valid HTTP or HTTPS origins",
		)
		.transform((value) => [...new Set(value.split(",").map((origin) => origin.trim()))]);
}

function createServerEnv(runtimeEnv: NodeJS.ProcessEnv): ServerEnv {
	const appEnv = resolveAppEnvironment(runtimeEnv);
	const betterAuthUrl = runtimeEnv.BETTER_AUTH_URL?.trim() || developmentDefaults.betterAuthUrl;
	const betterAuthOrigin = (() => {
		try {
			return new URL(betterAuthUrl).origin;
		} catch {
			return betterAuthUrl;
		}
	})();

	const parsed = createEnv({
		server: {
			APP_ENV: z.enum(["development", "test", "production"]),
			DATABASE_URL: postgresUrlSchema().transform((value) => new URL(value)),
			BETTER_AUTH_SECRET: secretSchema(appEnv),
			BETTER_AUTH_URL: urlSchema(["http", "https"]).transform((value) => new URL(value)),
			BETTER_AUTH_TRUSTED_ORIGINS: trustedOriginsSchema(),
			ANALYZER_INTERNAL_URL: urlSchema(["http", "https"]).transform((value) => new URL(value)),
			ANALYZER_SERVICE_TOKEN: secretSchema(appEnv),
			S3_ENDPOINT: urlSchema(["http", "https"]).transform((value) => new URL(value)),
			S3_REGION: z.string().trim().min(1),
			S3_BUCKET: z.string().trim().min(1),
			S3_ACCESS_KEY_ID: storageCredentialSchema(appEnv),
			S3_SECRET_ACCESS_KEY: storageCredentialSchema(appEnv),
			S3_FORCE_PATH_STYLE: booleanSchema(),
			MAX_EML_BYTES: positiveIntegerSchema(25 * 1024 * 1024),
			RETENTION_DAYS: positiveIntegerSchema(),
			UPLOAD_TIMEOUT_MS: positiveIntegerSchema(600_000),
			ANALYZER_REQUEST_TIMEOUT_MS: positiveIntegerSchema(30_000),
		},
		runtimeEnv: {
			APP_ENV: runtimeEnv.APP_ENV?.trim() || (runtimeEnv.NODE_ENV === "test" ? "test" : "development"),
			DATABASE_URL: runtimeEnv.DATABASE_URL ?? developmentDefaults.databaseUrl,
			BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET?.trim() || (appEnv === "test" ? TEST_SECRET : undefined),
			BETTER_AUTH_URL: betterAuthUrl,
			BETTER_AUTH_TRUSTED_ORIGINS: runtimeEnv.BETTER_AUTH_TRUSTED_ORIGINS?.trim() || betterAuthOrigin,
			ANALYZER_INTERNAL_URL: runtimeEnv.ANALYZER_INTERNAL_URL ?? developmentDefaults.analyzerInternalUrl,
			ANALYZER_SERVICE_TOKEN:
				runtimeEnv.ANALYZER_SERVICE_TOKEN?.trim() || (appEnv === "test" ? TEST_SECRET : undefined),
			S3_ENDPOINT: runtimeEnv.S3_ENDPOINT ?? developmentDefaults.s3Endpoint,
			S3_REGION: runtimeEnv.S3_REGION ?? developmentDefaults.s3Region,
			S3_BUCKET: runtimeEnv.S3_BUCKET ?? developmentDefaults.s3Bucket,
			S3_ACCESS_KEY_ID: runtimeEnv.S3_ACCESS_KEY_ID ?? developmentDefaults.s3AccessKeyId,
			S3_SECRET_ACCESS_KEY: runtimeEnv.S3_SECRET_ACCESS_KEY ?? developmentDefaults.s3SecretAccessKey,
			S3_FORCE_PATH_STYLE: runtimeEnv.S3_FORCE_PATH_STYLE ?? developmentDefaults.s3ForcePathStyle,
			MAX_EML_BYTES: runtimeEnv.MAX_EML_BYTES ?? developmentDefaults.maxEmlBytes,
			RETENTION_DAYS: runtimeEnv.RETENTION_DAYS ?? developmentDefaults.retentionDays,
			UPLOAD_TIMEOUT_MS: runtimeEnv.UPLOAD_TIMEOUT_MS ?? developmentDefaults.uploadTimeoutMs,
			ANALYZER_REQUEST_TIMEOUT_MS:
				runtimeEnv.ANALYZER_REQUEST_TIMEOUT_MS ?? developmentDefaults.analyzerRequestTimeoutMs,
		},
		emptyStringAsUndefined: true,
		onValidationError: (issues) => {
			const variables = issues
				.map((issue) => {
					const path = issue.path?.map((part) => String(part)).join(".") ?? "environment";
					return `${path} (${issue.message})`;
				})
				.join(", ");
			throw new Error(`Invalid environment variables: ${variables}`);
		},
	});

	return {
		appEnv: parsed.APP_ENV,
		databaseUrl: parsed.DATABASE_URL,
		betterAuthSecret: parsed.BETTER_AUTH_SECRET,
		betterAuthUrl: parsed.BETTER_AUTH_URL,
		betterAuthTrustedOrigins: parsed.BETTER_AUTH_TRUSTED_ORIGINS,
		analyzerInternalUrl: parsed.ANALYZER_INTERNAL_URL,
		analyzerServiceToken: parsed.ANALYZER_SERVICE_TOKEN,
		s3Endpoint: parsed.S3_ENDPOINT,
		s3Region: parsed.S3_REGION,
		s3Bucket: parsed.S3_BUCKET,
		s3AccessKeyId: parsed.S3_ACCESS_KEY_ID,
		s3SecretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
		s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE,
		maxEmlBytes: parsed.MAX_EML_BYTES,
		retentionDays: parsed.RETENTION_DAYS,
		uploadTimeoutMs: parsed.UPLOAD_TIMEOUT_MS,
		analyzerRequestTimeoutMs: parsed.ANALYZER_REQUEST_TIMEOUT_MS,
	};
}

function rejectPublicSecretVariables(runtimeEnv: NodeJS.ProcessEnv): void {
	const blockedSegments = ["SECRET", "TOKEN", "PASSWORD", "ACCESS_KEY", "PRIVATE_KEY", "CREDENTIAL", "API_KEY"];
	const publicSecret = Object.keys(runtimeEnv).find(
		(key) => key.startsWith("NEXT_PUBLIC_") && blockedSegments.some((segment) => key.includes(segment)),
	);
	if (publicSecret) {
		throw new Error(`Do not expose secret-like values under NEXT_PUBLIC_*: ${publicSecret}`);
	}
}

export function getServerEnv(runtimeEnv: NodeJS.ProcessEnv = process.env): ServerEnv {
	rejectPublicSecretVariables(runtimeEnv);
	return createServerEnv(runtimeEnv);
}

// Importing this module validates the production/build environment. Tests can use
// getServerEnv with an explicit runtime object without relying on global mutation.
export const env = getServerEnv();

export type { ServerEnv };
