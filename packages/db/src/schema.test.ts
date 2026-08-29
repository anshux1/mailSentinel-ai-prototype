import { describe, expect, it } from "vitest";

import { casePriorityValues, caseStatusValues } from "./schema/cases";
import { organizationRoleValues } from "./schema/tenancy";

describe("application schema vocabulary", () => {
	it("keeps the application roles explicit", () => {
		expect(organizationRoleValues).toEqual(["viewer", "analyst", "supervisor", "admin"]);
	});

	it("keeps future case lifecycle values in one source of truth", () => {
		expect(caseStatusValues).toEqual([
			"queued",
			"parsing",
			"extracting",
			"enriching",
			"scoring",
			"completed",
			"parse_failed",
			"analysis_deferred",
			"enrichment_partial",
			"failed",
		]);
		expect(casePriorityValues).toEqual(["low", "normal", "high", "critical"]);
	});
});
