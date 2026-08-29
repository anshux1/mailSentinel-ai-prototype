import { betterAuth } from "better-auth";

// The CLI loads this config without a database connection to generate the auth schema.
export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
	},
});
