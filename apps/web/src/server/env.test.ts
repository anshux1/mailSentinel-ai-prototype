import { describe, expect, it } from "vitest";

import { getServerEnv } from "./env";

const developmentEnv: NodeJS.ProcessEnv = {
	NODE_ENV: "test",
	APP_ENV: "development",
	BETTER_AUTH_SECRET: "12345678901234567890123456789012",
	ANALYZER_SERVICE_TOKEN: "22345678901234567890123456789012",
	DATABASE_URL: "postgresql://mailsentinel:replace-me@localhost:5432/mailsentinel",
	BETTER_AUTH_URL: "http://localhost:3000",
	ANALYZER_INTERNAL_URL: "http://localhost:8000",
	S3_ENDPOINT: "http://localhost:9000",
	S3_REGION: "us-east-1",
	S3_BUCKET: "mailsentinel-evidence",
	S3_ACCESS_KEY_ID: "local-access-key-for-tests-1234567890",
	S3_SECRET_ACCESS_KEY: "local-secret-key-for-tests-1234567890",
	S3_FORCE_PATH_STYLE: "true",
	MAX_EML_BYTES: "26214400",
	RETENTION_DAYS: "90",
};

describe("server environment parsing", () => {
	it("allows safe secret defaults in test mode", () => {
		expect(getServerEnv({ NODE_ENV: "test", APP_ENV: "test" }).appEnv).toBe("test");
	});

	it("accepts synthetically populated development values", () => {
		expect(getServerEnv(developmentEnv).databaseUrl.hostname).toBe("localhost");
	});

	it("rejects secret-like NEXT_PUBLIC_* variables", () => {
		const env = { ...developmentEnv, NEXT_PUBLIC_SECRET_VALUE: "hidden" };
		expect(() => getServerEnv(env)).toThrowError(/NEXT_PUBLIC_/);
	});

	it("rejects malformed numeric values", () => {
		const env = { ...developmentEnv, MAX_EML_BYTES: "123junk" };
		expect(() => getServerEnv(env)).toThrowError(/MAX_EML_BYTES/);
	});

	it("rejects unsupported service URLs", () => {
		const env = {
			...developmentEnv,
			ANALYZER_INTERNAL_URL: "ftp://localhost:8000",
		};
		expect(() => getServerEnv(env)).toThrowError(/ANALYZER_INTERNAL_URL/);
	});

	it("rejects placeholder storage credentials outside tests", () => {
		const env = { ...developmentEnv, S3_ACCESS_KEY_ID: "replace-me" };
		expect(() => getServerEnv(env)).toThrowError(/S3_ACCESS_KEY_ID/);
	});
});
