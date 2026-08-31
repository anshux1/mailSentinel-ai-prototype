import { describe, expect, it } from "vitest";

import { sanitizeOriginalFilename, validateUploadHeaders, UploadValidationError } from "./upload-validation";

const validHeaders = (overrides: Record<string, string> = {}) =>
	new Headers({
		origin: "http://localhost:3000",
		"content-type": "message/rfc822",
		"x-original-filename": "message.eml",
		"idempotency-key": "idempotency-key-1234",
		...overrides,
	});

describe("upload validation", () => {
	it("sanitizes display filenames without using them as object identity", () => {
		expect(sanitizeOriginalFilename("../invoices\\message.eml\u0000")).toBe(".._invoices_message.eml");
	});

	it("accepts bounded raw email request headers", () => {
		expect(
			validateUploadHeaders(validHeaders({ "content-length": "100" }), {
				maxBytes: 1000,
				allowedOrigins: ["http://localhost:3000"],
			}),
		).toMatchObject({
			contentType: "message/rfc822",
			originalFilename: "message.eml",
			idempotencyKey: "idempotency-key-1234",
			contentLength: 100,
		});
	});

	it("rejects unsupported content types and filenames", () => {
		expect(() =>
			validateUploadHeaders(validHeaders({ "content-type": "text/html" }), {
				maxBytes: 1000,
				allowedOrigins: ["http://localhost:3000"],
			}),
		).toThrowError(/content type/i);
		expect(() => sanitizeOriginalFilename("message.txt")).toThrowError(UploadValidationError);
	});

	it("rejects invalid origins, keys and declared sizes", () => {
		const options = { maxBytes: 1000, allowedOrigins: ["http://localhost:3000"] };
		expect(() => validateUploadHeaders(validHeaders({ origin: "https://evil.example" }), options)).toThrowError(
			/origin/i,
		);
		expect(() => validateUploadHeaders(validHeaders({ "idempotency-key": "short" }), options)).toThrowError(
			/idempotency/i,
		);
		expect(() => validateUploadHeaders(validHeaders({ "content-length": "1001" }), options)).toThrowError(/limit/i);
	});
});
