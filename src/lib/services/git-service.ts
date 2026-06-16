import type { GitlabToken, Repository, Note } from '../domain/types';
import { type Result, Success, Failure, bind, bindAsync, map } from '../domain/result';

// Base URL of the GitLab instance. The `/api/v4` REST API lives below it.
const BASE_URL = 'https://git.nfdi4plants.org';
const API_URL = `${BASE_URL}/api/v4`;

// Raw shape of a GitLab repository-tree entry. Private to this module:
// `listNotes` maps it down to the frontend-facing `Note`.
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
// resolved `Response` that has to be classified here.
function checkResponse(response: Response): Result<Response> {
	if (response.status === 401) {
		return Failure('Authentication failed: the token is invalid or expired.');
	}
	return response.ok
		? Success(response)
		: Failure(`GitLab request failed with status ${response.status}.`);
}

/** GET a path, treating any non-2xx status as a `Failure`. */
async function apiGet(path: string, token: GitlabToken): Promise<Result<Response>> {
	return bind(await request('GET', path, token), checkResponse);
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
): Promise<Result<Note[]>> {
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

/**
 * Fetch the raw text content of a single note from the repository's
 * default branch.
 */
export async function getNote(
	token: GitlabToken,
	repo: Repository,
	note: Note
): Promise<Result<string>> {
	const ref = repo.default_branch ?? 'main';
	const filePath = encodeURIComponent(note.path);
	const path = `/projects/${repo.id}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref)}`;
	return bindAsync(apiGet(path, token), readText);
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
		bind(
			await request('POST', '/projects', token, { name, initialize_with_readme: false }),
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
		const checked = checkResponse(probe.value); // necessarily a Failure
		if (!checked.success) return Failure(checked.error);
	}

	const method = probe.value.ok ? 'PUT' : 'POST';
	const written = bind(
		await request(method, `/projects/${repo.id}/repository/files/${filePath}`, token, {
			branch,
			content,
			commit_message: commitMessage
		}),
		checkResponse
	);
	return map(written, () => null);
}
