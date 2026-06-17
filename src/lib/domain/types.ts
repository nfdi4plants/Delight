// ── Type-level branding ────────────────────────────────────────────
// These are plain strings at runtime (survive JSON serialization),
// but TypeScript treats them as distinct types at compile time.
// You cannot pass a String where a GitlabToken is expected.

type Brand<T, B extends string> = T & { readonly __brand: B };

export type GitlabToken = Brand<string, 'GitlabToken'>;

// ── Domain entities ────────────────────────────────────────────────
// These mirror the relevant subset of the GitLab REST API responses
// (snake_case, as the wire delivers them) — no separate mapping layer.

/**
 * The currently-authenticated GitLab user, as returned by the `/user`
 * endpoint. Only the fields the app surfaces are modelled.
 */
export type GitlabUser = {
	id: number;
	username: string;
	name: string;
	avatar_url: string | null;
};

export type Repository = {
	id: number;
	name: string;
	path_with_namespace: string;
	description: string | null;
	web_url: string;
	http_url_to_repo: string;
	default_branch: string | null;
	avatar_url: string | null;
};

/**
 * A lightweight handle to a note file in a repository, as returned by
 * listing the tree — before its contents are fetched. Load it into a full
 * `Note` (see `domain/note.ts`) with `Note.load`.
 */
export type NoteRef = {
	/** File name, e.g. "meeting.md". */
	name: string;
	/** Path within the repository, e.g. "notes/sub/meeting.md". */
	path: string;
};

/**
 * A lightweight handle to a binary asset file in a repository, as returned by
 * listing a note's `assets/` folder — before its bytes are fetched. Mirrors
 * {@link NoteRef}: it is a pointer, not the content, so a note can carry its
 * asset list without moving the (potentially large) bytes over the network.
 * Resolve it into a full `Asset` (see `domain/asset.ts`) with the controller's
 * `getAsset`, which downloads the bytes on demand and caches them.
 *
 * Like `NoteRef`, it carries no repository id: a ref is always resolved through
 * the repo-bound controller that produced it, and the local cache keys every
 * entry by `[repoId, path]`, so the same path in two repos never collides.
 */
export type AssetRef = {
	/** File name, e.g. "photo.png". */
	name: string;
	/** Path within the repository, e.g. "notes/sub/meeting/assets/photo.png". */
	path: string;
};

/**
 * A GitLab merge request, as opened when a save is diverted around an edit
 * conflict. Only the fields the app surfaces are modelled.
 */
export type MergeRequest = {
	iid: number;
	web_url: string;
	title: string;
	source_branch: string;
	target_branch: string;
};
