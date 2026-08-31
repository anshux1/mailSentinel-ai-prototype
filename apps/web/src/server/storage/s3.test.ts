import { describe, expect, it } from "vitest";

import { ContentLengthMismatchError, EmptyUploadError, UploadLimitError, hashRequestBody } from "./s3";

function bodyOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
}

describe("bounded upload hashing", () => {
	it("hashes exact chunks without buffering the complete body", async () => {
		const result = await hashRequestBody(
			bodyOf(new TextEncoder().encode("hello "), new TextEncoder().encode("world")),
			100,
			1000,
			11,
		);
		expect(result).toEqual({
			byteSize: 11,
			sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
		});
	});

	it("rejects empty and over-limit bodies", async () => {
		await expect(hashRequestBody(bodyOf(), 100, 1000)).rejects.toBeInstanceOf(EmptyUploadError);
		await expect(hashRequestBody(bodyOf(new Uint8Array(101)), 100, 1000)).rejects.toBeInstanceOf(UploadLimitError);
	});

	it("rejects a body whose declared length does not match", async () => {
		await expect(hashRequestBody(bodyOf(new Uint8Array(4)), 100, 1000, 5)).rejects.toBeInstanceOf(
			ContentLengthMismatchError,
		);
	});
});
