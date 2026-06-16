import { type Result, Success } from '../domain/result';
import type { GitlabToken, Repository, NoteRef } from '../domain/types';
import Note, { type SaveOutcome } from '../domain/note';
import { listNotes } from './git-service';

/**
 * The local collection of notes for one connected repository.
 *
 * It is a read-through cache: `getNote` hands back the cached `Note`
 * instance when there is one, and otherwise loads it from GitLab (once —
 * concurrent requests for the same note share a single fetch) and caches
 * the result. Because a `Note` is stateful, the cached instance *is* the
 * working copy: the UI mutates it in place and `save` persists it.
 *
 * This in-memory layer is the seam for offline support. The same public
 * API can later be backed by IndexedDB for durability across reloads, and
 * `save` can enqueue writes while offline and flush them on reconnect —
 * each flush is just `Note.save`, so the conflict→merge-request handling
 * carries over unchanged. Construct one per (token, repository); discard
 * and recreate it when either changes.
 */
export default class NoteController {
	private readonly token: GitlabToken;
	private readonly repo: Repository;

	// Loaded notes, keyed by repo-relative file path (a note's stable identity).
	private readonly cache = new Map<string, Note>();
	// In-flight loads, keyed the same way, so concurrent `getNote` calls for
	// the same note coalesce into one network request instead of a stampede.
	private readonly inflight = new Map<string, Promise<Result<Note>>>();
	// The note listing, cached after the first `list()`.
	private refs: NoteRef[] | null = null;

	constructor(token: GitlabToken, repo: Repository) {
		this.token = token;
		this.repo = repo;
	}

	/**
	 * List the note handles in the repository. Cached after the first call;
	 * pass `{ refresh: true }` to re-fetch the listing from GitLab.
	 */
	async list({ refresh = false }: { refresh?: boolean } = {}): Promise<Result<NoteRef[]>> {
		if (!refresh && this.refs) return Success(this.refs);

		const result = await listNotes(this.token, this.repo);
		if (result.success) this.refs = result.value;
		return result;
	}

	/**
	 * Get a fully loaded note. Returns the cached instance if present;
	 * otherwise loads it from GitLab and caches it. `{ refresh: true }`
	 * forces a reload and replaces the cached instance — note that this
	 * discards any unsaved in-memory edits to that note.
	 */
	async getNote(ref: NoteRef, { refresh = false }: { refresh?: boolean } = {}): Promise<Result<Note>> {
		const key = ref.path;

		if (!refresh) {
			const cached = this.cache.get(key);
			if (cached) return Success(cached);
			const pending = this.inflight.get(key);
			if (pending) return pending;
		}

		const load = Note.load(this.token, this.repo, ref).then((result) => {
			if (result.success) this.cache.set(key, result.value);
			return result;
		});

		this.inflight.set(key, load);
		try {
			return await load;
		} finally {
			this.inflight.delete(key);
		}
	}

	/**
	 * Add a new note to the repository, the note is expected to be unsaved and to be stored purely locally until `save` is called on it.
	 * On a successful save, the note is added to the listing and becomes the cached instance for its file path.
	 */
	async createNote(title: string, slug: string, { content = "" }: { content?: string } = {}): Promise<Result<Note>> {
		const noteResult = Note.create(title, slug, content);
		if (!noteResult.success) return { success: false, error: "Invalid note parameters" };
		const note = noteResult.value;
		const noteRef = note.toNoteRef();
		this.addToListing(noteRef);
		this.cache.set(note.filePath, note);
		return Success(note);
	}

	/**
	 * Persist a note through the controller, keeping the cache and listing in
	 * sync. Delegates to `Note.save`, so a concurrent edit still surfaces as a
	 * merge request (see {@link SaveOutcome}); on a clean save a newly created
	 * note also joins the cached listing.
	 */
	async save(note: Note): Promise<Result<SaveOutcome>> {
		const result = await note.save(this.token, this.repo);
		if (!result.success) return result;

		// The instance is the canonical working copy now — make sure it is the
		// one the cache hands out.
		this.cache.set(note.filePath, note);
		if (result.value.kind === 'saved') this.addToListing(note.toNoteRef());
		return result;
	}

	/**
	 * Save all notes in the cache. Returns an array of results for each note.
	 */
	async saveAll(): Promise<Result<SaveOutcome>[]> {
		const saves = Array.from(this.cache.values()).map((note) => note.save(this.token, this.repo));
		return Promise.all(saves);
	}

	/** Drop a note from the cache (or clear everything when no ref is given). */
	invalidate(ref?: NoteRef): void {
		if (ref) {
			this.cache.delete(ref.path);
			return;
		}
		this.cache.clear();
		this.refs = null;
	}

	private addToListing(ref: NoteRef): void {
		if (this.refs && !this.refs.some((existing) => existing.path === ref.path)) {
			this.refs = [...this.refs, ref];
		}
	}
}
