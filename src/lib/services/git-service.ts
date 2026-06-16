import type { GitlabToken, Repository, NoteRef, MergeRequest } from '../domain/types';
import { type Result, Success, Failure, bindAsync, map } from '../domain/result';

// Base URL of the GitLab instance. The `/api/v4` REST API lives below it.
export const BASE_URL = 'https://git.nfdi4plants.org';
export const API_URL = `${BASE_URL}/api/v4`;

// Raw shape of a GitLab repository-tree entry. Private to this module:
// `listNotes` maps it down to the frontend-facing `NoteRef`.
type TreeEntry = {
	id: string;
	name: string;
	type: 'blob' | 'tree';
	path: string;
};

// ── HTTP helpers ───────────────────────────────────────────────────
// Thin wrappers around `fetch` that inject the auth header and turn
// transport failures into a `Failure`. No module-level state beyond the
// standard `fetch`, which exists in browsers and modern runtimes alike,
// so this works anywhere after bundling.

async function request(
	method: string,
	path: string,
	token: GitlabToken,
	body?: unknown
): Promise<Result<Response>> {
	try {
		const response = await fetch(`${API_URL}${path}`, {
			method,
			headers: {
				'PRIVATE-TOKEN': token,
				...(body === undefined ? {} : { 'Content-Type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return Success(response);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Network error while contacting GitLab: ${message}`);
	}
}

// The boundary that lifts an HTTP response onto the Result rails: `fetch`
// only rejects on network failure, so a non-2xx response still arrives as a
// resolved `Response` that has to be classified here. On failure we read the
// body to surface GitLab's own reason; on success the body is left untouched
// for the caller to consume.
async function checkResponse(response: Response): Promise<Result<Response>> {
	if (response.ok) return Success(response);
	if (response.status === 401) {
		return Failure('Authentication failed: the token is invalid or expired.');
	}
	const detail = await gitlabErrorMessage(response);
	return Failure(
		detail
			? `GitLab request failed (${response.status}): ${detail}`
			: `GitLab request failed with status ${response.status}.`
	);
}

// GitLab error responses carry the reason in a JSON body, under `message`
// (a string, or a field -> messages map for validation errors) or `error`.
async function gitlabErrorMessage(response: Response): Promise<string | null> {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return null; // not a JSON body (e.g. an HTML error page)
	}
	if (typeof body !== 'object' || body === null) return null;
	const raw = (body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error;
	if (raw === undefined) return null;
	return flattenMessage(raw);
}

// GitLab's `message` can be a plain string, an array, or a validation map of
// field -> messages (e.g. {"name":["has already been taken"]}). Flatten any
// of these into a readable string, falling back to JSON for unknown shapes so
// no structure is ever assumed.
function flattenMessage(raw: unknown): string {
	if (typeof raw === 'string') return raw;
	if (Array.isArray(raw)) return raw.map(flattenMessage).join(', ');
	if (typeof raw === 'object' && raw !== null) {
		return Object.entries(raw)
			.map(([field, value]) => `${field}: ${flattenMessage(value)}`)
			.join('; ');
	}
	return JSON.stringify(raw);
}

/** GET a path, treating any non-2xx status as a `Failure`. */
async function apiGet(path: string, token: GitlabToken): Promise<Result<Response>> {
	return bindAsync(request('GET', path, token), checkResponse);
}

// Body readers that turn a (possibly throwing) async read into a `Result`,
// so they compose with `bindAsync`.
async function readJson<T>(response: Response): Promise<Result<T>> {
	try {
		return Success((await response.json()) as T);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Could not parse GitLab response: ${message}`);
	}
}

async function readText(response: Response): Promise<Result<string>> {
	try {
		return Success(await response.text());
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Could not read response body: ${message}`);
	}
}

/**
 * GET a paginated list endpoint and accumulate every page into one array.
 * GitLab reports the next page number via the `x-next-page` header; an
 * empty value means we have reached the last page.
 */
async function apiGetAll<T>(path: string, token: GitlabToken): Promise<Result<T[]>> {
	const sep = path.includes('?') ? '&' : '?';
	const items: T[] = [];

	for (let page = 1; ; page++) {
		const result = await apiGet(`${path}${sep}per_page=100&page=${page}`, token);
		if (!result.success) return Failure(result.error);

		const parsed = await readJson<T[]>(result.value);
		if (!parsed.success) return Failure(parsed.error);
		items.push(...parsed.value);

		if (!result.value.headers.get('x-next-page')) break;
	}

	return Success(items);
}

/**
 * Verify that a token is accepted by the GitLab instance by requesting the
 * currently-authenticated user. Returns `Success(null)` when the token is
 * valid, `Failure` with a human-readable reason otherwise.
 */
export async function validateToken(token: GitlabToken): Promise<Result<null>> {
	const result = await apiGet('/user', token);
	return result.success ? Success(null) : Failure(result.error);
}

/**
 * List repositories (GitLab "projects") the token can see. When
 * `membersOnly` is true (the default) only projects the token is a member
 * of are returned; pass false to include every project visible to the token.
 */
export function listRepos(
	token: GitlabToken,
	membersOnly = true
): Promise<Result<Repository[]>> {
	const query = membersOnly ? '?membership=true&simple=true' : '?simple=true';
	return apiGetAll<Repository>(`/projects${query}`, token);
}

/**
 * List all `*.md` files under the repository's `notes/` folder, recursing
 * into subfolders.
 */
export async function listNotes(
	token: GitlabToken,
	repo: Repository
): Promise<Result<NoteRef[]>> {
	const tree = await apiGetAll<TreeEntry>(
		`/projects/${repo.id}/repository/tree?path=notes&recursive=true`,
		token
	);
	if (!tree.success) return Failure(tree.error);

	const notes = tree.value
		.filter((e) => e.type === 'blob' && e.path.endsWith('.md'))
		.map((e) => ({ name: e.name, path: e.path }));
	return Success(notes);
}

/** A file's content together with the version token needed to update it safely. */
export type FileContents = {
	content: string;
	/**
	 * SHA of the last commit that modified this file, from the
	 * `X-Gitlab-Last-Commit-Id` header. Passed back as `last_commit_id` on a
	 * later write so GitLab can reject the write if the file moved meanwhile.
	 * `null` if the header is absent.
	 */
	lastCommitId: string | null;
};

/**
 * Fetch the raw content of a single note from the repository's default
 * branch, along with the commit it was last modified at (for optimistic
 * concurrency on a later write).
 */
export async function getNote(
	token: GitlabToken,
	repo: Repository,
	note: NoteRef
): Promise<Result<FileContents>> {
	const ref = repo.default_branch ?? 'main';
	const filePath = encodeURIComponent(note.path);
	const path = `/projects/${repo.id}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref)}`;

	const got = await apiGet(path, token);
	if (!got.success) return Failure(got.error);

	const text = await readText(got.value);
	if (!text.success) return Failure(text.error);

	return Success({
		content: text.value,
		lastCommitId: got.value.headers.get('x-gitlab-last-commit-id')
	});
}

/**
 * List the files (blobs) directly under `path` in the repository — e.g. a
 * note's `assets/` folder. Subfolders are ignored. A missing folder surfaces
 * as a `Failure` (GitLab returns 404), which callers treat as "no files".
 */
export async function listFiles(
	token: GitlabToken,
	repo: Repository,
	path: string
): Promise<Result<NoteRef[]>> {
	const tree = await apiGetAll<TreeEntry>(
		`/projects/${repo.id}/repository/tree?path=${encodeURIComponent(path)}`,
		token
	);
	if (!tree.success) return Failure(tree.error);

	const files = tree.value
		.filter((e) => e.type === 'blob')
		.map((e) => ({ name: e.name, path: e.path }));
	return Success(files);
}

/** A binary file's bytes together with its version token. */
export type FileBlob = {
	blob: Blob;
	lastCommitId: string | null;
};

/**
 * Fetch a file's raw bytes as a `Blob` (with its MIME type from the response),
 * along with the commit it was last modified at. Use this for binary assets;
 * {@link getNote} reads text.
 */
export async function getFileBlob(
	token: GitlabToken,
	repo: Repository,
	path: string
): Promise<Result<FileBlob>> {
	const ref = repo.default_branch ?? 'main';
	const filePath = encodeURIComponent(path);
	const url = `/projects/${repo.id}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref)}`;

	const got = await apiGet(url, token);
	if (!got.success) return Failure(got.error);

	try {
		const blob = await got.value.blob();
		return Success({ blob, lastCommitId: got.value.headers.get('x-gitlab-last-commit-id') });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return Failure(`Could not read asset bytes: ${message}`);
	}
}

/**
 * Create a new project containing an (otherwise empty) `notes/` folder.
 * Git cannot track empty directories, so the folder is seeded with a
 * `.gitkeep` placeholder. Returns the created repository.
 */
export async function createRepo(
	token: GitlabToken,
	name: string
): Promise<Result<Repository>> {
	const created = await bindAsync(
		bindAsync(
			request('POST', '/projects', token, { name, initialize_with_readme: false }),
			checkResponse
		),
		(response) => readJson<Repository>(response)
	);
	if (!created.success) return Failure(created.error);
	const repo = created.value;

	// The first committed file also creates the repo's initial commit and
	// default branch.
	const seed = await pushNote(token, repo, 'notes/.gitkeep', '', 'Add notes folder');
	if (!seed.success) return Failure(seed.error);

	return Success(repo);
}

/**
 * Write `content` to the markdown file at `path` (relative to the repo
 * root, e.g. "notes/meeting.md") on the default branch, updating it if it
 * already exists and creating it otherwise.
 */
export async function pushNote(
	token: GitlabToken,
	repo: Repository,
	path: string,
	content: string,
	commitMessage = `Update ${path}`
): Promise<Result<null>> {
	const branch = repo.default_branch ?? 'main';
	const filePath = encodeURIComponent(path);

	// Decide between create (POST) and update (PUT) based on whether the
	// file already exists on the branch.
	const probe = await request(
		'GET',
		`/projects/${repo.id}/repository/files/${filePath}?ref=${encodeURIComponent(branch)}`,
		token
	);
	if (!probe.success) return Failure(probe.error);
	// A 404 here is expected — it just means the note doesn't exist yet.
	if (!probe.value.ok && probe.value.status !== 404) {
		const checked = await checkResponse(probe.value); // necessarily a Failure
		if (!checked.success) return Failure(checked.error);
	}

	const method = probe.value.ok ? 'PUT' : 'POST';
	const written = await bindAsync(
		request(method, `/projects/${repo.id}/repository/files/${filePath}`, token, {
			branch,
			content,
			commit_message: commitMessage
		}),
		checkResponse
	);
	return map(written, () => null);
}

// ── Conflict-aware writes ──────────────────────────────────────────
// Primitives that let the caller (NoteController) implement optimistic
// concurrency: commit a batch with per-file version guards, and — when a
// guard trips — divert the batch onto a branch + merge request.

/**
 * The outcome of a guarded commit. A `conflict` is the expected, recoverable
 * case (a file already exists on create, or changed since its `lastCommitId`
 * on update); `error` is anything else.
 */
export type CommitOutcome =
	| { kind: 'committed' }
	| { kind: 'conflict'; message: string }
	| { kind: 'error'; message: string };

/** One file change within a {@link commitFiles} commit. */
export type CommitAction = {
	action: 'create' | 'update';
	filePath: string;
	content: string;
	/** How `content` is encoded. Defaults to `text`; use `base64` for binary (assets). */
	encoding?: 'text' | 'base64';
	/** Guard for `update`: GitLab rejects the commit if the file changed since this commit. */
	lastCommitId?: string;
};

/**
 * Commit several file changes as a single commit via the Commits API.
 *
 * Each `update` action may carry its own `lastCommitId`, so the one commit is
 * guarded per file — if any file changed since the caller loaded it, GitLab
 * rejects the whole commit (atomic, all-or-nothing). Pass `startBranch` to
 * create `branch` from it in the same request (used to land the batch on a
 * fresh branch when diverting around a conflict). GitLab signals a stale
 * guard (or a create whose file already exists) with `400`; since our payload
 * is always well-formed, a `400` here is treated as a concurrency conflict.
 */
export async function commitFiles(
	token: GitlabToken,
	repo: Repository,
	params: {
		branch: string;
		commitMessage: string;
		actions: CommitAction[];
		startBranch?: string;
	}
): Promise<CommitOutcome> {
	const body: Record<string, unknown> = {
		branch: params.branch,
		commit_message: params.commitMessage,
		...(params.startBranch ? { start_branch: params.startBranch } : {}),
		actions: params.actions.map((a) => ({
			action: a.action,
			file_path: a.filePath,
			content: a.content,
			...(a.encoding ? { encoding: a.encoding } : {}),
			...(a.lastCommitId ? { last_commit_id: a.lastCommitId } : {})
		}))
	};

	const written = await request('POST', `/projects/${repo.id}/repository/commits`, token, body);
	if (!written.success) return { kind: 'error', message: written.error };

	const response = written.value;
	if (response.ok) return { kind: 'committed' };
	if (response.status === 400) {
		const detail = await gitlabErrorMessage(response);
		return { kind: 'conflict', message: detail ?? 'A file changed on the server since it was loaded.' };
	}

	const checked = await checkResponse(response);
	return { kind: 'error', message: checked.success ? `Unexpected status ${response.status}.` : checked.error };
}

/** Open a merge request from `source` into `target`, returning its details. */
export async function createMergeRequest(
	token: GitlabToken,
	repo: Repository,
	source: string,
	target: string,
	title: string
): Promise<Result<MergeRequest>> {
	return bindAsync(
		bindAsync(
			request('POST', `/projects/${repo.id}/merge_requests`, token, {
				source_branch: source,
				target_branch: target,
				title,
				remove_source_branch: true
			}),
			checkResponse
		),
		(response) => readJson<MergeRequest>(response)
	);
}
