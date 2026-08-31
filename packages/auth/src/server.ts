import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@mailsentinel/db";

import { env as environment } from "./env";

const authOptions = {
	appName: "MailSentinel",
	baseURL: environment.baseUrl,
	secret: environment.secret,
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		autoSignIn: false,
		minPasswordLength: 12,
		maxPasswordLength: 128,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		freshAge: 60 * 60,
	},
	trustedOrigins: environment.trustedOrigins,
	rateLimit: {
		enabled: true,
		window: 60,
		max: 60,
		storage: "memory",
		customRules: {
			"/sign-in/email": { window: 60, max: environment.appEnvironment === "test" ? 100 : 5 },
			"/api/auth/sign-in/email": { window: 60, max: environment.appEnvironment === "test" ? 100 : 5 },
		},
	},
	advanced: {
		useSecureCookies: environment.appEnvironment === "production",
		disableCSRFCheck: false,
		disableOriginCheck: false,
		ipAddress: {
			disableIpTracking: false,
			ipv6Subnet: 64,
		},
	},
	plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
