import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAuthEnvironment } from "./env";

describe("Better Auth environment", () => {
	const originalEnvironment = process.env.APP_ENV;
	const originalSecret = process.env.BETTER_AUTH_SECRET;
	const originalUrl = process.env.BETTER_AUTH_URL;
	const originalOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS;

	beforeEach(() => {
		process.env.APP_ENV = "test";
		delete process.env.BETTER_AUTH_SECRET;
		delete process.env.BETTER_AUTH_URL;
		delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
	});

	afterEach(() => {
		if (originalEnvironment === undefined) delete process.env.APP_ENV;
		else process.env.APP_ENV = originalEnvironment;
		if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
		else process.env.BETTER_AUTH_SECRET = originalSecret;
		if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL;
		else process.env.BETTER_AUTH_URL = originalUrl;
		if (originalOrigins === undefined) delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
		else process.env.BETTER_AUTH_TRUSTED_ORIGINS = originalOrigins;
	});

	it("provides a safe test secret and local base URL", () => {
		const environment = getAuthEnvironment();
		expect(environment.appEnvironment).toBe("test");
		expect(environment.secret.length).toBeGreaterThanOrEqual(32);
		expect(environment.baseUrl).toBe("http://localhost:3000");
	});

	it("rejects malformed trusted origins", () => {
		process.env.BETTER_AUTH_TRUSTED_ORIGINS = "not-an-origin";

		expect(() => getAuthEnvironment()).toThrowError(/TRUSTED_ORIGINS/);
	});
});
