import type { NoteRef } from '../domain/types';
import type { NoteSnapshot } from '../domain/note';

/**
 * Durable local storage for a repository's notes — the L2 behind
 * `NoteController`. Everything is keyed by `repoId` so one store can serve
 * several repositories. It deals in plain {@link NoteSnapshot}s and
 * {@link NoteRef}s, not `Note` instances, so it stays ignorant of domain
 * behaviour. All methods may reject; the controller treats failures as
 * cache misses, since GitLab remains the source of truth.
 */
export interface NoteStore {
	readNote(repoId: number, path: string): Promise<NoteSnapshot | null>;
	writeNote(repoId: number, path: string, snapshot: NoteSnapshot): Promise<void>;
	deleteNote(repoId: number, path: string): Promise<void>;
	readListing(repoId: number): Promise<NoteRef[] | null>;
	writeListing(repoId: number, refs: NoteRef[]): Promise<void>;
	/** Drop everything cached for one repository. */
	clear(repoId: number): Promise<void>;
}

/** Whether this runtime has IndexedDB (false in SSR/Node, true in browsers). */
export function indexedDbAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

const DB_NAME = 'delight';
const DB_VERSION = 1;
const NOTES = 'notes';
const LISTINGS = 'listings';

// Notes use a compound [repoId, path] key. The range below covers every
// note of one repo: an array key sorts after any string, so [repoId, []] is
// an upper bound greater than [repoId, <any path string>].
function noteRange(repoId: number): IDBKeyRange {
	return IDBKeyRange.bound([repoId], [repoId, []]);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * IndexedDB-backed {@link NoteStore}. The connection opens lazily on first
 * use and is reused; each operation runs in its own transaction.
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
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.#db;
	}

	async readNote(repoId: number, path: string): Promise<NoteSnapshot | null> {
		const db = await this.#open();
		const store = db.transaction(NOTES, 'readonly').objectStore(NOTES);
		const value = await promisify(store.get([repoId, path]));
		return (value as NoteSnapshot | undefined) ?? null;
	}

	async writeNote(repoId: number, path: string, snapshot: NoteSnapshot): Promise<void> {
		const db = await this.#open();
		const store = db.transaction(NOTES, 'readwrite').objectStore(NOTES);
		await promisify(store.put(snapshot, [repoId, path]));
	}

	async deleteNote(repoId: number, path: string): Promise<void> {
		const db = await this.#open();
		const store = db.transaction(NOTES, 'readwrite').objectStore(NOTES);
		await promisify(store.delete([repoId, path]));
	}

	async readListing(repoId: number): Promise<NoteRef[] | null> {
		const db = await this.#open();
		const store = db.transaction(LISTINGS, 'readonly').objectStore(LISTINGS);
		const value = await promisify(store.get(repoId));
		return (value as NoteRef[] | undefined) ?? null;
	}

	async writeListing(repoId: number, refs: NoteRef[]): Promise<void> {
		const db = await this.#open();
		const store = db.transaction(LISTINGS, 'readwrite').objectStore(LISTINGS);
		await promisify(store.put(refs, repoId));
	}

	async clear(repoId: number): Promise<void> {
		const db = await this.#open();
		const tx = db.transaction([NOTES, LISTINGS], 'readwrite');
		await promisify(tx.objectStore(NOTES).delete(noteRange(repoId)));
		await promisify(tx.objectStore(LISTINGS).delete(repoId));
	}
}
