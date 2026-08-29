import { expect, test } from "@playwright/test";

const analystEmail = process.env.E2E_ANALYST_EMAIL ?? process.env.SEED_ANALYST_EMAIL;
const analystPassword = process.env.E2E_ANALYST_PASSWORD ?? process.env.SEED_ANALYST_PASSWORD;

test.beforeEach(() => {
	if (!analystEmail || !analystPassword) {
		throw new Error("Set E2E_ANALYST_EMAIL and E2E_ANALYST_PASSWORD before running browser tests");
	}
});

test("redirects unauthenticated users and signs in an analyst", async ({ page }) => {
	await page.goto("/dashboard");
	await expect(page).toHaveURL(/\/sign-in$/);

	await page.getByLabel("Email address").fill(analystEmail as string);
	await page.getByLabel("Password").fill(analystPassword as string);
	await page.getByRole("button", { name: "Sign in" }).click();

	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByRole("heading", { name: "Investigation workspace" })).toBeVisible();
	await expect(page.getByText("analyst", { exact: true })).toBeVisible();
});

test("shows the honest empty queue and protects case details", async ({ page }) => {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(analystEmail as string);
	await page.getByLabel("Password").fill(analystPassword as string);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto("/cases");
	await expect(page.getByRole("heading", { name: "Cases", exact: true })).toBeVisible();
	await expect(page.getByText("No cases yet", { exact: true })).toBeVisible();

	await page.goto("/cases/case-that-does-not-exist");
	await expect(page.getByRole("heading", { name: "Case not found" })).toBeVisible();
});

test("signs out and removes access to protected pages", async ({ page }) => {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(analystEmail as string);
	await page.getByLabel("Password").fill(analystPassword as string);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/sign-in$/);
	await page.goto("/cases");
	await expect(page).toHaveURL(/\/sign-in$/);
});
