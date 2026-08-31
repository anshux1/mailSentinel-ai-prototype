import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { PassThrough } from "node:stream";

import { env } from "../env";

const MAX_PART_SIZE = 5 * 1024 * 1024;

let client: S3Client | undefined;

export class ObjectStorageError extends Error {
	readonly code = "STORAGE_UNAVAILABLE" as const;

	constructor() {
		super("Object storage is unavailable");
		this.name = "ObjectStorageError";
	}
}

export class UploadLimitError extends Error {
	readonly code = "UPLOAD_TOO_LARGE" as const;

	constructor() {
		super("The email file exceeds the configured size limit");
		this.name = "UploadLimitError";
	}
}

export class EmptyUploadError extends Error {
	readonly code = "EMPTY_UPLOAD" as const;

	constructor() {
		super("The email file is empty");
		this.name = "EmptyUploadError";
	}
}

export class UploadTimeoutError extends Error {
	readonly code = "UPLOAD_TIMEOUT" as const;

	constructor() {
		super("The email upload timed out");
		this.name = "UploadTimeoutError";
	}
}

export class ContentLengthMismatchError extends Error {
	readonly code = "INVALID_CONTENT_LENGTH" as const;

	constructor() {
		super("The declared content length did not match the received bytes");
		this.name = "ContentLengthMismatchError";
	}
}

export class ArtifactIntegrityError extends Error {
	readonly code = "ARTIFACT_INTEGRITY_MISMATCH" as const;

	constructor() {
		super("Stored artifact integrity verification failed");
		this.name = "ArtifactIntegrityError";
	}
}

function getClient(): S3Client {
	client ??= new S3Client({
		endpoint: env.s3Endpoint.toString(),
		region: env.s3Region,
		forcePathStyle: env.s3ForcePathStyle,
		credentials: {
			accessKeyId: env.s3AccessKeyId,
			secretAccessKey: env.s3SecretAccessKey,
		},
	});
	return client;
}

export function createOriginalArtifactKey(organizationId: string, caseId: string, artifactId: string): string {
	return `organizations/${organizationId}/cases/${caseId}/artifacts/${artifactId}.eml`;
}

async function writeWithBackpressure(stream: PassThrough, chunk: Uint8Array): Promise<void> {
	if (stream.write(chunk)) {
		return;
	}

	await once(stream, "drain");
}

export async function hashRequestBody(
	requestBody: ReadableStream<Uint8Array>,
	maxBytes: number,
	timeoutMs: number,
	expectedByteSize?: number,
): Promise<UploadedArtifact> {
	const reader = requestBody.getReader();
	const hash = createHash("sha256");
	const abortController = new AbortController();
	let byteSize = 0;
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		abortController.abort();
		void reader.cancel();
	}, timeoutMs);

	try {
		while (true) {
			const result = await reader.read();
			if (result.done) {
				break;
			}
			if (!(result.value instanceof Uint8Array)) {
				throw new ObjectStorageError();
			}
			byteSize += result.value.byteLength;
			if (byteSize > maxBytes) {
				throw new UploadLimitError();
			}
			hash.update(result.value);
		}
		if (byteSize === 0) {
			throw new EmptyUploadError();
		}
		if (expectedByteSize !== undefined && byteSize !== expectedByteSize) {
			throw new ContentLengthMismatchError();
		}
		return { byteSize, sha256: hash.digest("hex") };
	} catch (error) {
		if (
			error instanceof UploadLimitError ||
			error instanceof EmptyUploadError ||
			error instanceof ObjectStorageError ||
			error instanceof ContentLengthMismatchError
		) {
			throw error;
		}
		if (timedOut) {
			throw new UploadTimeoutError();
		}
		throw new ObjectStorageError();
	} finally {
		clearTimeout(timeout);
		await reader.cancel().catch(() => undefined);
	}
}

function timeoutSignal(deadline: number): AbortSignal {
	return AbortSignal.timeout(Math.max(0, deadline - Date.now()));
}

async function hashStoredObject(
	key: string,
	expectedByteSize: number,
	expectedSha256: string,
	deadline: number,
): Promise<void> {
	const response = await getClient().send(
		new GetObjectCommand({
			Bucket: env.s3Bucket,
			Key: key,
		}),
		{ abortSignal: timeoutSignal(deadline) },
	);
	if (!response.Body) {
		throw new ArtifactIntegrityError();
	}

	const body = response.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
	const hash = createHash("sha256");
	let byteSize = 0;
	try {
		for await (const chunk of body) {
			byteSize += chunk.byteLength;
			hash.update(chunk);
		}
	} finally {
		body.destroy?.();
	}

	if (byteSize !== expectedByteSize || hash.digest("hex") !== expectedSha256) {
		throw new ArtifactIntegrityError();
	}
}

export interface OriginalArtifactUpload {
	key: string;
	contentType: string;
	requestBody: ReadableStream<Uint8Array>;
	maxBytes: number;
	timeoutMs: number;
	expectedByteSize?: number;
}

export interface UploadedArtifact {
	byteSize: number;
	sha256: string;
}

export async function uploadOriginalArtifact(input: OriginalArtifactUpload): Promise<UploadedArtifact> {
	const deadline = Date.now() + input.timeoutMs;
	const passThrough = new PassThrough();
	const abortController = new AbortController();
	const upload = new Upload({
		client: getClient(),
		params: {
			Bucket: env.s3Bucket,
			Key: input.key,
			Body: passThrough,
			ContentType: input.contentType,
		},
		abortController,
		leavePartsOnError: false,
		partSize: MAX_PART_SIZE,
		queueSize: 1,
	});
	const uploadPromise = upload.done();
	// Attach a rejection handler immediately because the stream may fail before
	// the producer reaches the await below or enters the catch block.
	uploadPromise.catch(() => undefined);
	const reader = input.requestBody.getReader();
	const hash = createHash("sha256");
	let byteSize = 0;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;

	try {
		timeout = setTimeout(
			() => {
				timedOut = true;
				abortController.abort();
				void reader.cancel();
			},
			Math.max(0, deadline - Date.now()),
		);
		while (true) {
			const result = await reader.read();
			if (result.done) {
				break;
			}
			if (!(result.value instanceof Uint8Array)) {
				throw new ObjectStorageError();
			}

			byteSize += result.value.byteLength;
			if (byteSize > input.maxBytes) {
				throw new UploadLimitError();
			}
			hash.update(result.value);
			await writeWithBackpressure(passThrough, result.value);
		}

		if (byteSize === 0) {
			throw new EmptyUploadError();
		}
		if (input.expectedByteSize !== undefined && byteSize !== input.expectedByteSize) {
			throw new ContentLengthMismatchError();
		}

		passThrough.end();
		await uploadPromise;
		const sha256 = hash.digest("hex");
		const head = await getClient().send(
			new HeadObjectCommand({
				Bucket: env.s3Bucket,
				Key: input.key,
			}),
			{ abortSignal: timeoutSignal(deadline) },
		);
		if (head.ContentLength !== byteSize) {
			throw new ArtifactIntegrityError();
		}
		await hashStoredObject(input.key, byteSize, sha256, deadline);
		return { byteSize, sha256 };
	} catch (error) {
		abortController.abort();
		passThrough.destroy();
		await reader.cancel().catch(() => undefined);
		await upload.abort().catch(() => undefined);
		await deleteObject(input.key);
		if (
			error instanceof ArtifactIntegrityError ||
			error instanceof UploadLimitError ||
			error instanceof EmptyUploadError ||
			error instanceof UploadTimeoutError ||
			error instanceof ContentLengthMismatchError
		) {
			throw error;
		}
		if (timedOut) {
			throw new UploadTimeoutError();
		}
		throw new ObjectStorageError();
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

export async function deleteObject(key: string): Promise<void> {
	try {
		await getClient().send(
			new DeleteObjectCommand({
				Bucket: env.s3Bucket,
				Key: key,
			}),
			{ abortSignal: AbortSignal.timeout(env.uploadTimeoutMs) },
		);
	} catch {
		// Cleanup is best effort. Do not expose storage provider details to callers.
	}
}
