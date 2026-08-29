import "server-only";

type SecretLike = string | undefined | null;
type AppEnvironment = "development" | "test" | "production";

interface ServerEnv {
	appEnv: AppEnvironment;
	databaseUrl: URL;
	betterAuthSecret: string;
	betterAuthUrl: URL;
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
} as const;

function isPlaceholder(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return normalized.startsWith("replace-") || normalized.startsWith("your-");
}

function readRequiredString(name: string, value: SecretLike): string {
	const resolved = value?.trim();
	if (!resolved) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return resolved;
}

function readEnvironment(value: SecretLike): AppEnvironment {
	const environment = (value ?? "development").trim();
	if (environment === "development" || environment === "test" || environment === "production") {
		return environment;
	}

	throw new Error("APP_ENV must be development, test, or production");
}

function readUrl(
	name: string,
	value: SecretLike,
	fallback: string | undefined,
	allowedProtocols: readonly string[],
): URL {
	const resolved = readRequiredString(name, value ?? fallback);

	try {
		const url = new URL(resolved);
		const protocol = url.protocol.slice(0, -1);
		if (!url.hostname || !allowedProtocols.includes(protocol)) {
			throw new Error();
		}
		return url;
	} catch {
		throw new Error(`Invalid URL in environment variable: ${name}`);
	}
}

function readPositiveInt(name: string, value: SecretLike): number {
	const rawValue = readRequiredString(name, value);
	if (!/^[1-9]\d*$/.test(rawValue)) {
		throw new Error(`Invalid positive integer in environment variable: ${name}`);
	}

	const parsed = Number(rawValue);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid positive integer in environment variable: ${name}`);
	}
	return parsed;
}

function readBoolean(name: string, value: SecretLike): boolean {
	const rawValue = readRequiredString(name, value);
	if (rawValue === "true" || rawValue === "false") {
		return rawValue === "true";
	}
	throw new Error(`Invalid boolean in environment variable: ${name}`);
}

function rejectPublicSecretVariables(env: NodeJS.ProcessEnv): void {
	const blockedSegments = ["SECRET", "TOKEN", "PASSWORD", "ACCESS_KEY", "PRIVATE_KEY", "CREDENTIAL", "API_KEY"];

	for (const key of Object.keys(env)) {
		if (!key.startsWith("NEXT_PUBLIC_")) {
			continue;
		}
		if (blockedSegments.some((segment) => key.includes(segment))) {
			throw new Error(`Do not expose secret-like values under NEXT_PUBLIC_*: ${key}`);
		}
	}
}

function readSecret(name: string, value: SecretLike, environment: AppEnvironment): string {
	const secret = readRequiredString(name, value ?? (environment === "test" ? TEST_SECRET : undefined));
	if (environment === "test") {
		return secret;
	}
	if (isPlaceholder(secret)) {
		throw new Error(`Placeholder secret is not valid for ${name}`);
	}
	if (secret.length < REQUIRED_MIN_LENGTH) {
		throw new Error(`Secret for ${name} must be at least ${REQUIRED_MIN_LENGTH} characters long`);
	}
	return secret;
}

function rejectPlaceholderCredential(name: string, value: string, environment: AppEnvironment): void {
	if (environment !== "test" && isPlaceholder(value)) {
		throw new Error(`Placeholder credential is not valid for ${name}`);
	}
}

export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
	rejectPublicSecretVariables(env);

	const appEnv = readEnvironment(env.APP_ENV);
	const databaseUrl = readUrl("DATABASE_URL", env.DATABASE_URL, developmentDefaults.databaseUrl, [
		"postgres",
		"postgresql",
	]);
	const betterAuthUrl = readUrl("BETTER_AUTH_URL", env.BETTER_AUTH_URL, developmentDefaults.betterAuthUrl, [
		"http",
		"https",
	]);
	const analyzerInternalUrl = readUrl(
		"ANALYZER_INTERNAL_URL",
		env.ANALYZER_INTERNAL_URL,
		developmentDefaults.analyzerInternalUrl,
		["http", "https"],
	);
	const s3Endpoint = readUrl("S3_ENDPOINT", env.S3_ENDPOINT, developmentDefaults.s3Endpoint, ["http", "https"]);
	const s3AccessKeyId = readRequiredString(
		"S3_ACCESS_KEY_ID",
		env.S3_ACCESS_KEY_ID ?? developmentDefaults.s3AccessKeyId,
	);
	const s3SecretAccessKey = readRequiredString(
		"S3_SECRET_ACCESS_KEY",
		env.S3_SECRET_ACCESS_KEY ?? developmentDefaults.s3SecretAccessKey,
	);

	rejectPlaceholderCredential("S3_ACCESS_KEY_ID", s3AccessKeyId, appEnv);
	rejectPlaceholderCredential("S3_SECRET_ACCESS_KEY", s3SecretAccessKey, appEnv);

	return {
		appEnv,
		databaseUrl,
		betterAuthSecret: readSecret("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET, appEnv),
		betterAuthUrl,
		analyzerInternalUrl,
		analyzerServiceToken: readSecret("ANALYZER_SERVICE_TOKEN", env.ANALYZER_SERVICE_TOKEN, appEnv),
		s3Endpoint,
		s3Region: readRequiredString("S3_REGION", env.S3_REGION ?? developmentDefaults.s3Region),
		s3Bucket: readRequiredString("S3_BUCKET", env.S3_BUCKET ?? developmentDefaults.s3Bucket),
		s3AccessKeyId,
		s3SecretAccessKey,
		s3ForcePathStyle: readBoolean(
			"S3_FORCE_PATH_STYLE",
			env.S3_FORCE_PATH_STYLE ?? developmentDefaults.s3ForcePathStyle,
		),
		maxEmlBytes: readPositiveInt("MAX_EML_BYTES", env.MAX_EML_BYTES ?? developmentDefaults.maxEmlBytes),
		retentionDays: readPositiveInt("RETENTION_DAYS", env.RETENTION_DAYS ?? developmentDefaults.retentionDays),
	};
}

export type { ServerEnv };
