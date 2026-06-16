import { type Result, Success } from '../domain/result';
import type { GitlabToken, Repository, NoteRef } from '../domain/types';
import Note, { type NoteSnapshot, type SaveOutcome } from '../domain/note';
import { listNotes } from './git-service';
import type { NoteStore } from './note-store';

/**
 * The local collection of notes for one connected repository.
 *
 * Reads are served cache-first across three layers: an in-memory map (L1),
 * an optional durable {@link NoteStore} such as IndexedDB (L2), and finally
 * GitLab. Once warmed, L1/L2 let `list` and `getNote` work offline; pass
 * `{ refresh: true }` to force a fresh fetch from GitLab. Because a `Note`
 * is stateful, the cached L1 instance *is* the working copy — the UI mutates
 * it in place and `save` persists it (and writes it back to L2).
 *
 * The L2 store is best-effort: any store failure is treated as a miss, since
 * GitLab is the source of truth. Construct one controller per (token,
 * repository); discard and recreate it when either changes.
 *
 * Only the token is held in an ECMAScript `#private` field — unlike a
 * TypeScript `private`, which is erased at runtime, so it is unreadable from
 * outside the instance and never enters a `JSON.stringify`, log line, or
 * devtools dump.
 */
export default class NoteController {
	#token: GitlabToken;
	private readonly repo: Repository;
	private readonly store: NoteStore | null;

	// Loaded notes, keyed by repo-relative file path (a note's stable identity).
	private readonly cache = new Map<string, Note>();
	// In-flight loads, keyed the same way, so concurrent `getNote` calls for
	// the same note coalesce into one resolution instead of a stampede.
	private readonly inflight = new Map<string, Promise<Result<Note>>>();
	// The note listing, cached after it is first resolved.
	private refs: NoteRef[] | null = null;

	constructor(token: GitlabToken, repo: Repository, store: NoteStore | null = null) {
		this.#token = token;
		this.repo = repo;
		this.store = store;
	}

	/**
	 * List the note handles in the repository, cache-first (memory → store →
	 * GitLab). Cached once resolved; `{ refresh: true }` re-fetches from GitLab
	 * and updates both caches.
	 */
	async list({ refresh = false }: { refresh?: boolean } = {}): Promise<Result<NoteRef[]>> {
		if (!refresh) {
			if (this.refs) return Success(this.refs);
			const stored = await this.recallListing();
			if (stored) return Success((this.refs = stored));
		}

		const result = await listNotes(this.#token, this.repo);
		if (result.success) {
			this.refs = result.value;
			await this.persistListing(result.value);
		}
		return result;
	}

	/**
	 * Get a fully loaded note, cache-first (memory → store → GitLab), caching
	 * the result in both layers. `{ refresh: true }` forces a reload from
	 * GitLab and replaces the cached instance — discarding any unsaved
	 * in-memory edits to that note.
	 */
	async getNote(ref: NoteRef, { refresh = false }: { refresh?: boolean } = {}): Promise<Result<Note>> {
		const key = ref.path;

		if (!refresh) {
			const cached = this.cache.get(key);
			if (cached) return Success(cached);
			const pending = this.inflight.get(key);
			if (pending) return pending;
		}

		const resolution = this.resolveNote(ref, refresh).then((result) => {
			if (result.success) this.cache.set(key, result.value);
			return result;
		});

		this.inflight.set(key, resolution);
		try {
			return await resolution;
		} finally {
			this.inflight.delete(key);
		}
	}

	/**
	 * Persist a note through the controller, keeping both caches in sync.
	 * Delegates to `Note.save`, so a concurrent edit still surfaces as a merge
	 * request (see {@link SaveOutcome}); on a clean save a newly created note
	 * also joins the cached listing.
	 */
	async save(note: Note): Promise<Result<SaveOutcome>> {
		const result = await note.save(this.#token, this.repo);
		if (!result.success) return result;

		// The instance is the canonical working copy now — make sure it is the
		// one the caches hand out.
		this.cache.set(note.filePath, note);
		await this.persistNote(note);

		if (result.value.kind === 'saved') {
			this.addToListing(note.toNoteRef());
			if (this.refs) await this.persistListing(this.refs);
		}
		return result;
	}

	/** Drop a note from both caches (or clear everything when no ref is given). */
	invalidate(ref?: NoteRef): void {
		if (ref) {
			this.cache.delete(ref.path);
			void this.forgetNote(ref.path);
			return;
		}
		this.cache.clear();
		this.refs = null;
		void this.clearStore();
	}

	// Resolve a note from the durable store (unless refreshing) and otherwise
	// from GitLab, writing a freshly loaded note back to the store.
	private async resolveNote(ref: NoteRef, refresh: boolean): Promise<Result<Note>> {
		if (!refresh) {
			const snapshot = await this.recallNote(ref.path);
			if (snapshot) {
				const rehydrated = Note.fromSnapshot(snapshot);
				if (rehydrated.success) return rehydrated;
				// A corrupt cache entry: fall through to a fresh GitLab load.
			}
		}

		const loaded = await Note.load(this.#token, this.repo, ref);
		if (loaded.success) await this.persistNote(loaded.value);
		return loaded;
	}

	private addToListing(ref: NoteRef): void {
		if (this.refs && !this.refs.some((existing) => existing.path === ref.path)) {
			this.refs = [...this.refs, ref];
		}
	}

	// ── Best-effort L2 access ──────────────────────────────────────────
	// Each wrapper degrades a store failure (or absence) to a cache miss /
	// no-op, so the durable layer can never break a read or a save.

	private recallNote(path: string): Promise<NoteSnapshot | null> {
		return this.store ? this.store.readNote(this.repo.id, path).catch(() => null) : Promise.resolve(null);
	}

	private persistNote(note: Note): Promise<void> {
		return this.store
			? this.store.writeNote(this.repo.id, note.filePath, note.toSnapshot()).catch(() => undefined)
			: Promise.resolve();
	}

	private forgetNote(path: string): Promise<void> {
		return this.store ? this.store.deleteNote(this.repo.id, path).catch(() => undefined) : Promise.resolve();
	}

	private recallListing(): Promise<NoteRef[] | null> {
		return this.store ? this.store.readListing(this.repo.id).catch(() => null) : Promise.resolve(null);
	}

	private persistListing(refs: NoteRef[]): Promise<void> {
		return this.store ? this.store.writeListing(this.repo.id, refs).catch(() => undefined) : Promise.resolve();
	}

	private clearStore(): Promise<void> {
		return this.store ? this.store.clear(this.repo.id).catch(() => undefined) : Promise.resolve();
	}
}
