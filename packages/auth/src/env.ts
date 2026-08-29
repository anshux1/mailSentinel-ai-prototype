type AppEnvironment = "development" | "test" | "production";

const testSecret = "test-only-secret-value-000000000000000000000000";

function getAppEnvironment(): AppEnvironment {
	const value = process.env.APP_ENV?.trim() || (process.env.NODE_ENV === "test" ? "test" : "development");
	if (value === "development" || value === "test" || value === "production") {
		return value;
	}
	throw new Error("APP_ENV must be development, test, or production");
}

function getSecret(appEnvironment: AppEnvironment): string {
	const value = process.env.BETTER_AUTH_SECRET?.trim() || (appEnvironment === "test" ? testSecret : "");
	if (!value || value.length < 32 || value.toLowerCase().startsWith("replace-")) {
		throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long");
	}
	return value;
}

function getBaseUrl(): string {
	const value = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
	try {
		const url = new URL(value);
		if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
			throw new Error();
		}
		return url.origin;
	} catch {
		throw new Error("BETTER_AUTH_URL must be a valid HTTP or HTTPS URL");
	}
}

function getTrustedOrigins(baseUrl: string): string[] {
	const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	const origins = new Set([baseUrl, ...(configured ?? [])]);

	for (const origin of origins) {
		try {
			const url = new URL(origin);
			if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
				throw new Error();
			}
		} catch {
			throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must contain valid HTTP or HTTPS origins");
		}
	}

	return [...origins];
}

export interface AuthEnvironment {
	appEnvironment: AppEnvironment;
	baseUrl: string;
	secret: string;
	trustedOrigins: string[];
}

export function getAuthEnvironment(): AuthEnvironment {
	const appEnvironment = getAppEnvironment();
	const baseUrl = getBaseUrl();
	return {
		appEnvironment,
		baseUrl,
		secret: getSecret(appEnvironment),
		trustedOrigins: getTrustedOrigins(baseUrl),
	};
}

export type { AppEnvironment };
