import { randomUUID } from "node:crypto";

export const acceptedUploadContentTypes = ["message/rfc822", "application/octet-stream", "text/plain"] as const;

export class UploadValidationError extends Error {
	constructor(
		readonly code:
			| "INVALID_FILENAME"
			| "INVALID_CONTENT_TYPE"
			| "INVALID_IDEMPOTENCY_KEY"
			| "INVALID_CONTENT_LENGTH"
			| "INVALID_REQUEST_ID"
			| "UPLOAD_TOO_LARGE"
			| "EMPTY_UPLOAD"
			| "ORIGIN_NOT_ALLOWED",
		message: string,
	) {
		super(message);
		this.name = "UploadValidationError";
	}
}

export interface ValidatedUploadHeaders {
	contentType: (typeof acceptedUploadContentTypes)[number];
	originalFilename: string;
	idempotencyKey: string;
	requestId: string;
	allowDuplicate: boolean;
	contentLength: number | undefined;
}

export function createRequestId(): string {
	return `req_${randomUUID().replaceAll("-", "")}`;
}

export function sanitizeOriginalFilename(value: string | null): string {
	if (!value) {
		throw new UploadValidationError("INVALID_FILENAME", "An .eml filename is required.");
	}

	const sanitized = Array.from(value.normalize("NFKC"))
		.filter((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return !(codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
		})
		.join("")
		.replace(/[\\/]/g, "_")
		.trim();
	if (!sanitized || Array.from(sanitized).length > 255 || !/\.eml$/iu.test(sanitized)) {
		throw new UploadValidationError("INVALID_FILENAME", "The original filename must be a valid .eml filename.");
	}
	return sanitized;
}

function validateIdempotencyKey(value: string | null): string {
	if (!value || !/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/.test(value)) {
		throw new UploadValidationError("INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
	}
	return value;
}

function validateRequestId(value: string | null): string {
	if (!value) {
		return createRequestId();
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
		throw new UploadValidationError("INVALID_REQUEST_ID", "The request ID is invalid.");
	}
	return value;
}

function validateContentLength(value: string | null, maxBytes: number): number | undefined {
	if (value === null) {
		return undefined;
	}
	if (!/^\d+$/.test(value)) {
		throw new UploadValidationError("INVALID_CONTENT_LENGTH", "The content length is invalid.");
	}
	const contentLength = Number(value);
	if (!Number.isSafeInteger(contentLength)) {
		throw new UploadValidationError("INVALID_CONTENT_LENGTH", "The content length is invalid.");
	}
	if (contentLength > maxBytes) {
		throw new UploadValidationError("UPLOAD_TOO_LARGE", "The email file exceeds the configured size limit.");
	}
	return contentLength;
}

export function validateUploadHeaders(
	headers: Headers,
	options: { maxBytes: number; allowedOrigins: readonly string[] },
): ValidatedUploadHeaders {
	const origin = headers.get("origin");
	if (!origin || !options.allowedOrigins.includes(origin)) {
		throw new UploadValidationError("ORIGIN_NOT_ALLOWED", "The upload origin is not allowed.");
	}

	const contentType = headers.get("content-type")?.trim().toLowerCase();
	if (!contentType || !acceptedUploadContentTypes.includes(contentType as ValidatedUploadHeaders["contentType"])) {
		throw new UploadValidationError("INVALID_CONTENT_TYPE", "Only supported .eml content types are accepted.");
	}

	return {
		contentType: contentType as ValidatedUploadHeaders["contentType"],
		originalFilename: sanitizeOriginalFilename(headers.get("x-original-filename")),
		idempotencyKey: validateIdempotencyKey(headers.get("idempotency-key")),
		requestId: validateRequestId(headers.get("x-request-id")),
		allowDuplicate: headers.get("x-allow-duplicate") === "true",
		contentLength: validateContentLength(headers.get("content-length"), options.maxBytes),
	};
}
