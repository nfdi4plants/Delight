// ── Type-level branding ────────────────────────────────────────────
// These are plain strings at runtime (survive JSON serialization),
// but TypeScript treats them as distinct types at compile time.
// You cannot pass a String where a GitlabToken is expected.

type Brand<T, B extends string> = T & { readonly __brand: B };

export type GitlabToken = Brand<string, 'GitlabToken'>;

// ── Domain entities ────────────────────────────────────────────────
// These mirror the relevant subset of the GitLab REST API responses
// (snake_case, as the wire delivers them) — no separate mapping layer.

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

/** A markdown note within a repository. */
export type Note = {
	/** File name, e.g. "meeting.md". */
	name: string;
	/** Path within the repository, e.g. "notes/sub/meeting.md". */
	path: string;
};
