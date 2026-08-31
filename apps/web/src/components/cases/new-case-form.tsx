"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewCaseFormProps {
	maxBytes: number;
}

interface IntakeResponse {
	caseId?: string;
	caseNumber?: string;
	code?: string;
	message?: string;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.floor(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createIdempotencyKey(): string {
	return crypto.randomUUID();
}

export function NewCaseForm({ maxBytes }: NewCaseFormProps) {
	const router = useRouter();
	const [file, setFile] = useState<File | null>(null);
	const [progress, setProgress] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [duplicate, setDuplicate] = useState<IntakeResponse | null>(null);
	const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createIdempotencyKey());

	function selectFile(nextFile: File | undefined): void {
		setError(null);
		setDuplicate(null);
		setProgress(0);
		if (!nextFile) {
			setFile(null);
			return;
		}
		if (!/\.eml$/iu.test(nextFile.name)) {
			setFile(null);
			setError("Select a file ending in .eml.");
			return;
		}
		if (nextFile.size === 0) {
			setFile(null);
			setError("The selected file is empty.");
			return;
		}
		if (nextFile.size > maxBytes) {
			setFile(null);
			setError(`The selected file exceeds the ${formatBytes(maxBytes)} limit.`);
			return;
		}
		setFile(nextFile);
	}

	function submit(allowDuplicate = false): void {
		if (!file || busy) {
			return;
		}
		setBusy(true);
		setError(null);
		setDuplicate(null);
		const request = new XMLHttpRequest();
		request.open("POST", "/api/cases");
		request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
		request.setRequestHeader("X-Original-Filename", file.name);
		request.setRequestHeader("Idempotency-Key", idempotencyKey);
		if (allowDuplicate) {
			request.setRequestHeader("X-Allow-Duplicate", "true");
		}
		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				setProgress(Math.round((event.loaded / event.total) * 100));
			}
		});
		request.addEventListener("load", () => {
			let response: IntakeResponse = {};
			try {
				response = JSON.parse(request.responseText) as IntakeResponse;
			} catch {
				response = { code: "INTAKE_FAILED", message: "The server returned an invalid response." };
			}

			if (request.status === 202 || (request.status === 200 && response.caseId)) {
				if (response.caseId) {
					router.push(`/cases/${encodeURIComponent(response.caseId)}`);
					return;
				}
			}
			if (request.status === 409 && response.code === "DUPLICATE_ARTIFACT" && !allowDuplicate) {
				setDuplicate(response);
				setBusy(false);
				return;
			}
			if (request.status === 503 && response.caseId) {
				router.push(`/cases/${encodeURIComponent(response.caseId)}`);
				return;
			}
			setError(response.message || "The upload could not be accepted.");
			setBusy(false);
		});
		request.addEventListener("error", () => {
			setError("The upload connection failed. You can retry with the same file.");
			setBusy(false);
		});
		request.addEventListener("timeout", () => {
			setError("The upload timed out. You can retry with the same file.");
			setBusy(false);
		});
		request.timeout = 120_000;
		request.send(file);
	}

	function startNewAttempt(): void {
		setIdempotencyKey(createIdempotencyKey());
		setDuplicate(null);
		setError(null);
		setProgress(0);
	}

	return (
		<div className="space-y-6">
			<div>
				<label className="block text-sm font-medium text-slate-200" htmlFor="eml-file">
					Email evidence file
				</label>
				<p className="mt-2 text-sm leading-6 text-slate-400">
					Choose one synthetic or otherwise approved <code>.eml</code> file. The original bytes are preserved privately
					and will not be rendered in the dashboard.
				</p>
				<input
					accept=".eml,message/rfc822"
					className="mt-4 block w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-2 file:font-medium file:text-slate-950"
					disabled={busy}
					id="eml-file"
					onChange={(event) => selectFile(event.target.files?.[0])}
					type="file"
				/>
			</div>

			{file ? (
				<div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm">
					<p className="font-medium text-slate-200">{file.name}</p>
					<p className="mt-1 text-slate-500">{formatBytes(file.size)}</p>
				</div>
			) : null}

			{busy ? (
				<div aria-live="polite" className="space-y-2">
					<div className="flex justify-between text-xs text-slate-400">
						<span>Uploading original bytes</span>
						<span>{progress}%</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-slate-800">
						<div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
					</div>
				</div>
			) : null}

			{error ? (
				<div
					aria-live="assertive"
					className="rounded-xl border border-rose-900/80 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
				>
					{error}
				</div>
			) : null}

			{duplicate ? (
				<div className="space-y-4 rounded-xl border border-amber-800/80 bg-amber-950/20 px-4 py-4 text-sm text-amber-100">
					<p>This exact artifact already exists in this workspace as {duplicate.caseNumber || duplicate.caseId}.</p>
					<p className="text-amber-200/80">Create a separate case with the same evidence?</p>
					<div className="flex flex-wrap gap-3">
						<button
							className="rounded-lg bg-amber-300 px-4 py-2 font-medium text-slate-950 disabled:opacity-50"
							disabled={busy}
							onClick={() => submit(true)}
							type="button"
						>
							Create separate case
						</button>
						<button
							className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200"
							onClick={startNewAttempt}
							type="button"
						>
							Cancel
						</button>
					</div>
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-3">
				<button
					className="rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!file || busy || Boolean(duplicate)}
					onClick={() => submit()}
					type="button"
				>
					{busy ? "Preserving evidence…" : "Create case"}
				</button>
				<span className="text-xs text-slate-500">Maximum file size: {formatBytes(maxBytes)}</span>
			</div>
		</div>
	);
}
