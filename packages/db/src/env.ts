import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(packageDirectory, "../../../.env");

loadDotenv({ path: rootEnvPath });

function requiredEnvironment(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function requiredSeedPassword(name: string): string {
	const value = requiredEnvironment(name);
	if (value.length < 12 || value.toLowerCase().startsWith("replace-")) {
		throw new Error(`${name} must be a local password with at least 12 characters`);
	}
	return value;
}

function requiredSeedSlug(name: string): string {
	const value = requiredEnvironment(name);
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
		throw new Error(`${name} must contain lowercase letters, numbers, and single hyphens`);
	}
	return value;
}

export function getDatabaseUrl(): string {
	const value = requiredEnvironment("DATABASE_URL");
	try {
		const url = new URL(value);
		if (!url.hostname || !["postgres:", "postgresql:"].includes(url.protocol)) {
			throw new Error();
		}
	} catch {
		throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
	}
	return value;
}

export interface SeedEnvironment {
	organizationName: string;
	organizationSlug: string;
	analystEmail: string;
	analystPassword: string;
	supervisorEmail: string;
	supervisorPassword: string;
}

export function getSeedEnvironment(): SeedEnvironment {
	const analystEmail = requiredEnvironment("SEED_ANALYST_EMAIL");
	const supervisorEmail = requiredEnvironment("SEED_SUPERVISOR_EMAIL");
	if (analystEmail.toLowerCase() === supervisorEmail.toLowerCase()) {
		throw new Error("SEED_ANALYST_EMAIL and SEED_SUPERVISOR_EMAIL must be different");
	}

	return {
		organizationName: requiredEnvironment("SEED_ORGANIZATION_NAME"),
		organizationSlug: requiredSeedSlug("SEED_ORGANIZATION_SLUG"),
		analystEmail,
		analystPassword: requiredSeedPassword("SEED_ANALYST_PASSWORD"),
		supervisorEmail,
		supervisorPassword: requiredSeedPassword("SEED_SUPERVISOR_PASSWORD"),
	};
}
