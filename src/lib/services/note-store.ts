import type { NoteRef } from '../domain/types';
import type { NoteSnapshot } from '../domain/note';
import type { AssetSnapshot } from '../domain/asset';

/**
 * The local cache behind `NoteController` — the single place note data lives
 * between GitLab round-trips. Keyed by `repoId` so one store can serve
 * several repositories. It deals in plain {@link NoteSnapshot}s and
 * {@link NoteRef}s, not `Note` instances, so it stays ignorant of domain
 * behaviour.
 *
 * It is best-effort: implementations **resolve** (to `null` / `void`) rather
 * than reject on failure, so a flaky backend degrades to a cache miss or a
 * skipped write — never a thrown read or save. GitLab remains the source of
 * truth, so a miss just means "fetch it again".
 */
export interface NoteStore {
	readNote(repoId: number, path: string): Promise<NoteSnapshot | null>;
	writeNote(repoId: number, path: string, snapshot: NoteSnapshot): Promise<void>;
	/** Drop all cached note *content* for a repo (listing and dirty set survive). */
	clearNotes(repoId: number): Promise<void>;
	readListing(repoId: number): Promise<NoteRef[] | null>;
	writeListing(repoId: number, refs: NoteRef[]): Promise<void>;
	/** Repo-relative paths of notes saved locally but not yet pushed to GitLab. */
	readDirty(repoId: number): Promise<string[] | null>;
	writeDirty(repoId: number, paths: string[]): Promise<void>;
	/**
	 * The asset blob cache, separate from notes so a note's pointer list can be
	 * read and synced without moving bytes. Entries are downloaded on demand
	 * (and added locally by the booths) and dropped after a sync.
	 */
	readAsset(repoId: number, path: string): Promise<AssetSnapshot | null>;
	/** Whether an asset's bytes are present locally, without reading them. */
	hasAsset(repoId: number, path: string): Promise<boolean>;
	writeAsset(repoId: number, path: string, snapshot: AssetSnapshot): Promise<void>;
	/** Drop all cached asset *bytes* for a repo (e.g. after a sync). */
	clearAssets(repoId: number): Promise<void>;
	/** Repo-relative paths of assets captured locally but not yet pushed. */
	readDirtyAssets(repoId: number): Promise<string[] | null>;
	writeDirtyAssets(repoId: number, paths: string[]): Promise<void>;
}

/** Whether this runtime has IndexedDB (false in SSR/Node, true in browsers). */
export function indexedDbAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

/** The best store this runtime can offer: durable IndexedDB, else in-memory. */
export function createNoteStore(): NoteStore {
	return indexedDbAvailable() ? new IndexedDbNoteStore() : new InMemoryNoteStore();
}

// ── In-memory store ────────────────────────────────────────────────
// Used when IndexedDB is unavailable (and handy in tests). State is nested
// by repoId so per-repo operations are trivial. Values are cloned in and
// out so callers never alias the stored objects — matching IndexedDB.

export class InMemoryNoteStore implements NoteStore {
	private readonly notes = new Map<number, Map<string, NoteSnapshot>>();
	private readonly listings = new Map<number, NoteRef[]>();
	private readonly dirty = new Map<number, string[]>();
	private readonly assets = new Map<number, Map<string, AssetSnapshot>>();
	private readonly dirtyAssets = new Map<number, string[]>();

	async readNote(repoId: number, path: string): Promise<NoteSnapshot | null> {
		const snapshot = this.notes.get(repoId)?.get(path);
		return snapshot ? structuredClone(snapshot) : null;
	}

	async writeNote(repoId: number, path: string, snapshot: NoteSnapshot): Promise<void> {
		let repoNotes = this.notes.get(repoId);
		if (!repoNotes) this.notes.set(repoId, (repoNotes = new Map()));
		repoNotes.set(path, structuredClone(snapshot));
	}

	async clearNotes(repoId: number): Promise<void> {
		this.notes.delete(repoId);
	}

	async readListing(repoId: number): Promise<NoteRef[] | null> {
		const refs = this.listings.get(repoId);
		return refs ? structuredClone(refs) : null;
	}

	async writeListing(repoId: number, refs: NoteRef[]): Promise<void> {
		this.listings.set(repoId, structuredClone(refs));
	}

	async readDirty(repoId: number): Promise<string[] | null> {
		const paths = this.dirty.get(repoId);
		return paths ? [...paths] : null;
	}

	async writeDirty(repoId: number, paths: string[]): Promise<void> {
		this.dirty.set(repoId, [...paths]);
	}

	async readAsset(repoId: number, path: string): Promise<AssetSnapshot | null> {
		const snapshot = this.assets.get(repoId)?.get(path);
		return snapshot ? structuredClone(snapshot) : null;
	}

	async hasAsset(repoId: number, path: string): Promise<boolean> {
		return this.assets.get(repoId)?.has(path) ?? false;
	}

	async writeAsset(repoId: number, path: string, snapshot: AssetSnapshot): Promise<void> {
		let repoAssets = this.assets.get(repoId);
		if (!repoAssets) this.assets.set(repoId, (repoAssets = new Map()));
		repoAssets.set(path, structuredClone(snapshot));
	}

	async clearAssets(repoId: number): Promise<void> {
		this.assets.delete(repoId);
	}

	async readDirtyAssets(repoId: number): Promise<string[] | null> {
		const paths = this.dirtyAssets.get(repoId);
		return paths ? [...paths] : null;
	}

	async writeDirtyAssets(repoId: number, paths: string[]): Promise<void> {
		this.dirtyAssets.set(repoId, [...paths]);
	}
}

// ── IndexedDB store ────────────────────────────────────────────────

const DB_NAME = 'delight';
const DB_VERSION = 3;
const NOTES = 'notes';
const LISTINGS = 'listings';
const DIRTY = 'dirty';
const ASSETS = 'assets';
const DIRTY_ASSETS = 'dirtyAssets';

// Notes and assets use a compound [repoId, path] key. The range below covers
// every entry of one repo: an array key sorts after any string, so [repoId, []]
// is an upper bound greater than [repoId, <any path string>].
function repoRange(repoId: number): IDBKeyRange {
	return IDBKeyRange.bound([repoId], [repoId, []]);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * IndexedDB-backed {@link NoteStore}. The connection opens lazily and is
 * reused; every operation runs in its own transaction and is guarded, so a
 * failure resolves to the best-effort fallback rather than rejecting.
 */
export class IndexedDbNoteStore implements NoteStore {
	#db: Promise<IDBDatabase> | null = null;

	#open(): Promise<IDBDatabase> {
		this.#db ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES);
				if (!db.objectStoreNames.contains(LISTINGS)) db.createObjectStore(LISTINGS);
				if (!db.objectStoreNames.contains(DIRTY)) db.createObjectStore(DIRTY);
				if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS);
				if (!db.objectStoreNames.contains(DIRTY_ASSETS)) db.createObjectStore(DIRTY_ASSETS);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.#db;
	}

	// Run `fn` in a transaction over `stores`, degrading any failure to
	// `fallback` so callers see a miss/no-op instead of a rejection.
	async #run<T>(
		stores: string | string[],
		mode: IDBTransactionMode,
		fn: (tx: IDBTransaction) => Promise<T>,
		fallback: T
	): Promise<T> {
		try {
			const db = await this.#open();
			return await fn(db.transaction(stores, mode));
		} catch {
			return fallback;
		}
	}

	readNote(repoId: number, path: string): Promise<NoteSnapshot | null> {
		return this.#run(
			NOTES,
			'readonly',
			async (tx) => ((await promisify(tx.objectStore(NOTES).get([repoId, path]))) as NoteSnapshot) ?? null,
			null
		);
	}

	writeNote(repoId: number, path: string, snapshot: NoteSnapshot): Promise<void> {
		return this.#run(
			NOTES,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(NOTES).put(snapshot, [repoId, path]))),
			undefined
		);
	}

	clearNotes(repoId: number): Promise<void> {
		return this.#run(
			NOTES,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(NOTES).delete(repoRange(repoId)))),
			undefined
		);
	}

	readListing(repoId: number): Promise<NoteRef[] | null> {
		return this.#run(
			LISTINGS,
			'readonly',
			async (tx) => ((await promisify(tx.objectStore(LISTINGS).get(repoId))) as NoteRef[]) ?? null,
			null
		);
	}

	writeListing(repoId: number, refs: NoteRef[]): Promise<void> {
		return this.#run(
			LISTINGS,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(LISTINGS).put(refs, repoId))),
			undefined
		);
	}

	readDirty(repoId: number): Promise<string[] | null> {
		return this.#run(
			DIRTY,
			'readonly',
			async (tx) => ((await promisify(tx.objectStore(DIRTY).get(repoId))) as string[]) ?? null,
			null
		);
	}

	writeDirty(repoId: number, paths: string[]): Promise<void> {
		return this.#run(
			DIRTY,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(DIRTY).put(paths, repoId))),
			undefined
		);
	}

	readAsset(repoId: number, path: string): Promise<AssetSnapshot | null> {
		return this.#run(
			ASSETS,
			'readonly',
			async (tx) => ((await promisify(tx.objectStore(ASSETS).get([repoId, path]))) as AssetSnapshot) ?? null,
			null
		);
	}

	hasAsset(repoId: number, path: string): Promise<boolean> {
		return this.#run(
			ASSETS,
			'readonly',
			// getKey checks presence without reading (deserializing) the blob.
			async (tx) => (await promisify(tx.objectStore(ASSETS).getKey([repoId, path]))) !== undefined,
			false
		);
	}

	writeAsset(repoId: number, path: string, snapshot: AssetSnapshot): Promise<void> {
		return this.#run(
			ASSETS,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(ASSETS).put(snapshot, [repoId, path]))),
			undefined
		);
	}

	clearAssets(repoId: number): Promise<void> {
		return this.#run(
			ASSETS,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(ASSETS).delete(repoRange(repoId)))),
			undefined
		);
	}

	readDirtyAssets(repoId: number): Promise<string[] | null> {
		return this.#run(
			DIRTY_ASSETS,
			'readonly',
			async (tx) => ((await promisify(tx.objectStore(DIRTY_ASSETS).get(repoId))) as string[]) ?? null,
			null
		);
	}

	writeDirtyAssets(repoId: number, paths: string[]): Promise<void> {
		return this.#run(
			DIRTY_ASSETS,
			'readwrite',
			async (tx) => void (await promisify(tx.objectStore(DIRTY_ASSETS).put(paths, repoId))),
			undefined
		);
	}
}
