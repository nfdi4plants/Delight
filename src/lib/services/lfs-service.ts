import type { GitlabToken, Repository } from '../domain/types';
import { type Result, Success, Failure } from '../domain/result';

// ── Git LFS, replicated over HTTP ──────────────────────────────────
// We have no git binary here, so this module does by hand what a git-lfs
// client does: resolve the small text *pointer* that the GitLab REST API
// returns for an LFS-tracked path into the actual bytes (download), and the
// reverse for writes (upload the bytes, then commit the pointer).
//
// IMPORTANT — none of this is wired up or tested yet. The LFS HTTP endpoints
// on git.nfdi4plants.org currently send no CORS headers, so these fetches are
// blocked from the browser (see the batch endpoint below). They will start
// working once the instance allows the app origin on the `*/info/lfs/*`
// routes (and on the transfer host the batch response points at). Until then,
// treat the auth assumption (Basic user:token) and the exact upload headers as
// "to be confirmed against the real server".
//
// Spec: https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md
//       https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md

/** The two facts a pointer carries: the object's content hash and its size. */
export type LfsPointer = {
	/** Lowercase hex SHA-256 of the object's bytes — its identity in LFS. */
	oid: string;
	/** Size of the object in bytes. The batch API requires it. */
	size: number;
};

/**
 * Credentials for the LFS endpoints. Unlike the REST API (which takes a
 * `PRIVATE-TOKEN` header), the LFS HTTP transport authenticates with HTTP
 * Basic — GitLab answers an unauthenticated batch call with
 * `WWW-Authenticate: Basic realm="GitLab"`. For a personal access token the
 * username is the GitLab username and the password is the token; get the
 * username from the authenticated user (`getCurrentUser`).
 */
export type LfsAuth = {
	username: string;
	token: GitlabToken;
};

// The version line that opens every modern LFS pointer. We key detection off
// it so a real file that merely mentions LFS is never mistaken for a pointer.
const POINTER_VERSION = 'version https://git-lfs.github.com/spec/v1';

// Media type for all LFS JSON request/response bodies (batch + verify).
const LFS_JSON = 'application/vnd.git-lfs+json';

// ── Pointer text ↔ struct ──────────────────────────────────────────

/**
 * Parse the text the REST API returns for a path into an {@link LfsPointer},
 * or `null` if it is not an LFS pointer (i.e. the path is a normal file whose
 * bytes you already hold). A pointer is tiny and always opens with the version
 * line, so the cheap, false-positive-proof test is `startsWith`.
 *
 * Use this to branch asset loading: `null` → use the bytes as-is; a pointer →
 * resolve it with {@link downloadLfsObject}.
 */
export function parseLfsPointer(text: string): LfsPointer | null {
	if (!text.startsWith(POINTER_VERSION)) return null;

	const oid = text.match(/^oid sha256:([0-9a-f]{64})$/m)?.[1];
	const sizeRaw = text.match(/^size (\d+)$/m)?.[1];
	if (!oid || sizeRaw === undefined) return null;

	return { oid, size: Number(sizeRaw) };
}

/**
 * Render an {@link LfsPointer} back to its canonical text — the content you
 * commit (as a normal text file) in place of the bytes once the object itself
 * has been uploaded with {@link uploadLfsObject}. The canonical form is: the
 * version line, then the remaining keys in alphabetical order (`oid`, `size`),
 * LF-terminated. The committed path must also be covered by a `.gitattributes`
 * `filter=lfs` rule for the repo to treat it as LFS.
 */
export function formatLfsPointer(pointer: LfsPointer): string {
	return `${POINTER_VERSION}\noid sha256:${pointer.oid}\nsize ${pointer.size}\n`;
}

/** Lowercase-hex SHA-256 of some bytes — an object's LFS oid. */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
	const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ── Batch API ──────────────────────────────────────────────────────
// The batch endpoint is the heart of the protocol: you tell it which objects
// you want to download/upload and it hands back, per object, a short-lived
// URL (`href`) plus the exact headers to use against it. The transfer href may
// live on a different host than GitLab (object storage), which is why we never
// reuse our Basic auth for the transfer — we send the headers the batch
// response dictates.

/** One transfer instruction from the batch response (download/upload/verify). */
type LfsAction = {
	href: string;
	/** Headers to send verbatim on the transfer request (often an Authorization). */
	header?: Record<string, string>;
	expires_at?: string;
};

/** The batch response's entry for a single requested object. */
type LfsObjectResult = {
	oid: string;
	size: number;
	authenticated?: boolean;
	actions?: { download?: LfsAction; upload?: LfsAction; verify?: LfsAction };
	/** Present instead of `actions` when this object can't be served. */
	error?: { code: number; message: string };
};

type LfsBatchResponse = {
	/** The negotiated transfer adapter; we only implement `basic`. */
	transfer?: string;
	objects: LfsObjectResult[];
};

/** The LFS endpoints for a repo hang off its `.git` HTTP URL. */
function lfsBatchUrl(repo: Repository): string {
	// http_url_to_repo already ends in `.git`, e.g. `https://host/ns/proj.git`.
	return `${repo.http_url_to_repo}/info/lfs/objects/batch`;
}

function basicAuthHeader(auth: LfsAuth): string {
	return `Basic ${btoa(`${auth.username}:${auth.token}`)}`;
}

// A single `fetch` lifted onto the Result rails. A thrown error here is a
// transport failure — and the most likely one during bring-up is CORS, since
// the LFS routes don't yet allow the app origin, so we name it in the message.
async function lfsFetch(url: string, init: RequestInit): Promise<Result<Response>> {
	try {
		return Success(await fetch(url, init));
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(
			`Network error contacting Git LFS (often CORS — the LFS endpoints must ` +
				`allow this origin; see lfs-service header notes): ${message}`
		);
	}
}

// LFS error bodies are `{ message, documentation_url?, request_id? }`. Pull the
// message out for a readable Failure, falling back to the status.
async function lfsErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: unknown };
		if (typeof body.message === 'string') return body.message;
	} catch {
		// not a JSON body
	}
	return `status ${response.status}`;
}

/**
 * Run a batch request for one or more objects. `operation` is `download` or
 * `upload`; `ref` (a branch name) is passed through on uploads so the server
 * can authorize the push against that branch. Returns the parsed response, or
 * a Failure on transport/HTTP error. Per-object `error` fields are left intact
 * for the caller to interpret (a download miss vs. an upload that's a no-op).
 */
export async function lfsBatch(
	repo: Repository,
	auth: LfsAuth,
	operation: 'download' | 'upload',
	objects: LfsPointer[],
	ref?: string
): Promise<Result<LfsBatchResponse>> {
	const body = {
		operation,
		transfers: ['basic'],
		...(ref ? { ref: { name: ref } } : {}),
		objects: objects.map((o) => ({ oid: o.oid, size: o.size }))
	};

	const got = await lfsFetch(lfsBatchUrl(repo), {
		method: 'POST',
		headers: {
			Accept: LFS_JSON,
			'Content-Type': LFS_JSON,
			Authorization: basicAuthHeader(auth)
		},
		body: JSON.stringify(body)
	});
	if (!got.success) return Failure(got.error);

	const response = got.value;
	if (response.status === 401) {
		return Failure('Git LFS authentication failed: the username/token was rejected.');
	}
	if (!response.ok) {
		return Failure(`Git LFS batch request failed: ${await lfsErrorMessage(response)}`);
	}

	let parsed: LfsBatchResponse;
	try {
		parsed = (await response.json()) as LfsBatchResponse;
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Could not parse Git LFS batch response: ${message}`);
	}

	// We only speak the `basic` transfer adapter. Anything else (e.g. a
	// custom/standalone adapter) we cannot drive, so fail loudly rather than
	// reach for an `href` that isn't a plain HTTP PUT/GET.
	if (parsed.transfer && parsed.transfer !== 'basic') {
		return Failure(`Git LFS server chose an unsupported transfer "${parsed.transfer}".`);
	}
	return Success(parsed);
}

// ── Download ───────────────────────────────────────────────────────

/**
 * Resolve a pointer into the actual object bytes. Runs a `download` batch,
 * follows the returned `href` (with the headers the server supplied), and
 * verifies the bytes against the pointer (size, then oid) so a truncated or
 * wrong response can't masquerade as the asset.
 */
export async function downloadLfsObject(
	repo: Repository,
	auth: LfsAuth,
	pointer: LfsPointer
): Promise<Result<Blob>> {
	const batch = await lfsBatch(repo, auth, 'download', [pointer]);
	if (!batch.success) return Failure(batch.error);

	const object = batch.value.objects[0];
	if (!object) return Failure('Git LFS batch returned no object for the requested pointer.');
	if (object.error) {
		return Failure(`Git LFS cannot serve object ${pointer.oid}: ${object.error.message}`);
	}

	const href = object.actions?.download?.href;
	if (!href) return Failure(`Git LFS batch returned no download action for ${pointer.oid}.`);

	// Send the action headers verbatim — for object storage the href is
	// pre-signed and these carry whatever auth/conditions it needs.
	const got = await lfsFetch(href, {
		method: 'GET',
		headers: object.actions?.download?.header ?? {}
	});
	if (!got.success) return Failure(got.error);
	if (!got.value.ok) {
		return Failure(`Git LFS object download failed with status ${got.value.status}.`);
	}

	let blob: Blob;
	try {
		blob = await got.value.blob();
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Could not read Git LFS object bytes: ${message}`);
	}

	if (blob.size !== pointer.size) {
		return Failure(
			`Git LFS object size mismatch: expected ${pointer.size} bytes, got ${blob.size}.`
		);
	}
	const oid = await sha256Hex(blob);
	if (oid !== pointer.oid) {
		return Failure(`Git LFS object hash mismatch: expected ${pointer.oid}, got ${oid}.`);
	}

	return Success(blob);
}

// ── Upload ─────────────────────────────────────────────────────────

/**
 * Upload an object's bytes to LFS storage and return its {@link LfsPointer}.
 * The caller then commits `formatLfsPointer(pointer)` as the file's content
 * (and ensures `.gitattributes` marks the path as LFS) — uploading bytes here
 * does NOT put anything in the repo by itself.
 *
 * If the server reports the object already exists (a batch `upload` action is
 * omitted), this is a no-op and returns the pointer straightaway — content
 * addressing means identical bytes never need re-uploading.
 *
 * `ref` is the branch the pointer will be committed on, forwarded so the server
 * can authorize the push.
 */
export async function uploadLfsObject(
	repo: Repository,
	auth: LfsAuth,
	data: Blob,
	ref?: string
): Promise<Result<LfsPointer>> {
	const pointer: LfsPointer = { oid: await sha256Hex(data), size: data.size };

	const batch = await lfsBatch(repo, auth, 'upload', [pointer], ref);
	if (!batch.success) return Failure(batch.error);

	const object = batch.value.objects[0];
	if (!object) return Failure('Git LFS batch returned no object for the upload.');
	if (object.error) {
		return Failure(`Git LFS rejected the upload of ${pointer.oid}: ${object.error.message}`);
	}

	const upload = object.actions?.upload;
	// No upload action → the object is already stored; nothing to transfer.
	if (!upload) return Success(pointer);

	// The basic adapter PUTs the raw bytes with the action's headers. We do not
	// add a Content-Type: for pre-signed storage URLs an unexpected header can
	// break the signature, and when the server needs one it includes it here.
	// (One of the things to confirm against the real server.)
	const put = await lfsFetch(upload.href, {
		method: 'PUT',
		headers: upload.header ?? {},
		body: data
	});
	if (!put.success) return Failure(put.error);
	if (!put.value.ok) {
		return Failure(`Git LFS object upload failed with status ${put.value.status}.`);
	}

	// An optional verify step confirms the store accepted the object before we
	// commit a pointer that would otherwise dangle.
	const verify = object.actions?.verify;
	if (verify) {
		const verified = await lfsFetch(verify.href, {
			method: 'POST',
			headers: {
				Accept: LFS_JSON,
				'Content-Type': LFS_JSON,
				...(verify.header ?? {})
			},
			body: JSON.stringify({ oid: pointer.oid, size: pointer.size })
		});
		if (!verified.success) return Failure(verified.error);
		if (!verified.value.ok) {
			return Failure(`Git LFS verify failed with status ${verified.value.status}.`);
		}
	}

	return Success(pointer);
}
