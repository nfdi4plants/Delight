import { type Result, Success, Failure } from '../domain/result';
import type { GitlabToken, Repository, NoteRef, AssetRef } from '../domain/types';
import Note, { type NoteSnapshot } from '../domain/note';
import Asset from '../domain/asset';
import {
	listNotes,
	getNote as fetchNoteFile,
	listFiles,
	getFileBlob,
	commitFiles,
	createMergeRequest,
	fileExists,
	type CommitAction
} from './git-service';
import { type NoteStore, createNoteStore } from './note-store';

/**
 * The outcome of a {@link NoteController.sync}. All dirty notes go up as a
 * single commit, so the result is one batch verdict, not one per note:
 *
 * - `idle` — nothing was dirty (the listing was still refreshed).
 * - `uploaded` — `notes` were committed together to the default branch at
 *   `commitId` (the SHA their cached snapshots are now pinned to).
 * - `merge-request` — a concurrent edit was detected, so the whole batch went
 *   onto one branch and a single merge request (`url`) was opened for review.
 * - `failed` — the batch could not be pushed (e.g. offline); `notes` stay
 *   dirty and are retried on the next sync.
 */
export type SyncReport =
	| { kind: 'idle' }
	| { kind: 'uploaded'; notes: NoteRef[]; commitId: string }
	| { kind: 'merge-request'; notes: NoteRef[]; url: string }
	| { kind: 'failed'; notes: NoteRef[]; error: string };

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

// Whether two snapshots represent the same note — i.e. saving the second over
// the first would change nothing to push. Compares the note's markdown fields
// (body trimmed, as toMarkdown emits it) and its asset *set* by path. It
// ignores sync bookkeeping (`baseCommitId`) and asset bytes, which live in
// their own cache and are tracked dirty separately. Attaching a new asset adds
// a ref here, so it still registers as a change worth re-saving.
function sameContent(a: NoteSnapshot, b: NoteSnapshot): boolean {
	const sameNote =
		a.title === b.title &&
		a.date === b.date &&
		a.content.trim() === b.content.trim() &&
		JSON.stringify(a.tags) === JSON.stringify(b.tags);
	return sameNote && sameAssets(a.assets, b.assets);
}

function sameAssets(a: AssetRef[], b: AssetRef[]): boolean {
	if (a.length !== b.length) return false;
	const as = a.map((x) => x.path).sort();
	const bs = b.map((x) => x.path).sort();
	return as.every((k, i) => k === bs[i]);
}

/**
 * The local collection of notes for one connected repository — the single
 * surface the rest of the app uses to read and write notes.
 *
 * It is **local-first**: `saveNote` only writes to the local {@link NoteStore}
 * and marks the note "dirty"; nothing reaches GitLab until {@link sync}.
 * Reads (`getList`, `getNote`) are served from the store, falling back to
 * GitLab on a miss and caching the result — so once warmed the app works
 * offline. There is just one cache layer: the store is either durable
 * (IndexedDB) or in-memory, chosen automatically; the controller uses it the
 * same way regardless.
 *
 * Assets are handled as **pointers**: a loaded note carries {@link AssetRef}s
 * (listed from its `assets/` folder), not bytes, so reading or syncing a note
 * never moves the (potentially large) blobs. {@link getAsset} resolves a ref
 * into actual bytes on demand — from the local asset cache, else downloaded and
 * cached. {@link attachAsset} adds a locally-captured asset and queues it.
 *
 * `sync` pushes every dirty note and every dirty (locally-captured) asset as one
 * commit — a clash becomes a single merge request — refreshes the listing, and
 * pins each pushed note's cached snapshot to the commit it landed at, so a later
 * edit syncs as a guarded update rather than re-creating a file that already
 * exists. After a successful push the local asset bytes are dropped; they are
 * re-downloaded on demand the next time an asset is opened.
 *
 * Only the token is held in an ECMAScript `#private` field — unlike a
 * TypeScript `private`, which is erased at runtime, so it is unreadable from
 * outside the instance and never enters a `JSON.stringify`, log line, or
 * devtools dump.
 */
export default class NoteController {
	#token: GitlabToken;
	private readonly repo: Repository;
	private readonly store: NoteStore;

	constructor(token: GitlabToken, repo: Repository, store: NoteStore = createNoteStore()) {
		this.#token = token;
		this.repo = repo;
		this.store = store;
	}

	/**
	 * List the note handles in the repository (cached listing, else fetched
	 * from GitLab and cached), with any locally-saved notes unioned in so they
	 * are always visible.
	 */
	async getList(): Promise<Result<NoteRef[]>> {
		let base = await this.store.readListing(this.repo.id);
		if (base === null) {
			const result = await listNotes(this.#token, this.repo);
			if (!result.success) return result;
			base = result.value;
			await this.store.writeListing(this.repo.id, base);
		}

		const dirty = (await this.store.readDirty(this.repo.id)) ?? [];
		return Success(this.withDirty(base, dirty));
	}

	/**
	 * Get a loaded note — with its asset *pointers* — from the store if cached,
	 * otherwise fetched from GitLab and cached. The asset bytes are **not**
	 * downloaded here; resolve them on demand with {@link getAsset}.
	 */
	async getNote(ref: NoteRef): Promise<Result<Note>> {
		const snapshot = await this.store.readNote(this.repo.id, ref.path);
		if (snapshot) {
			const rehydrated = Note.fromSnapshot(snapshot);
			if (rehydrated.success) return rehydrated;
			// A corrupt cache entry: fall through to a fresh GitLab load.
		}

		const raw = await fetchNoteFile(this.#token, this.repo, ref);
		if (!raw.success) return Failure(raw.error);

		const loaded = Note.fromMarkdown(raw.value.content, ref, raw.value.lastCommitId);
		if (!loaded.success) return loaded;

		loaded.value.assets = await this.listAssetRefs(loaded.value);
		await this.store.writeNote(this.repo.id, loaded.value.filePath, loaded.value.toSnapshot());
		return loaded;
	}

	// List the pointers to a note's assets by listing its `assets/` folder — no
	// bytes are moved. Any locally-captured (dirty) asset under the same folder
	// is unioned in, so an asset added offline is visible before it is pushed. A
	// missing folder (note has no assets) simply yields the dirty ones, if any.
	private async listAssetRefs(note: Note): Promise<AssetRef[]> {
		const listed = await listFiles(this.#token, this.repo, note.assetsFolder);
		const server: AssetRef[] = listed.success ? listed.value : [];

		const dirty = (await this.store.readDirtyAssets(this.repo.id)) ?? [];
		const prefix = `${note.assetsFolder}/`;
		const present = new Set(server.map((ref) => ref.path));
		const extra = dirty
			.filter((path) => path.startsWith(prefix) && !present.has(path))
			.map((path) => ({ name: basename(path), path }));
		return extra.length === 0 ? server : [...server, ...extra];
	}

	/**
	 * Resolve an {@link AssetRef} into its bytes: returned from the local asset
	 * cache if present, otherwise downloaded from GitLab and cached. This is the
	 * only place asset blobs are pulled over the network, and only when the user
	 * actually opens the asset.
	 */
	async getAsset(ref: AssetRef): Promise<Result<Asset>> {
		const cached = await this.store.readAsset(this.repo.id, ref.path);
		if (cached) return Success(Asset.fromSnapshot(cached));

		const got = await getFileBlob(this.#token, this.repo, ref.path);
		if (!got.success) return Failure(got.error);

		const asset = Asset.create(ref.path, got.value.blob, got.value.lastCommitId);
		if (!asset.success) return asset;
		await this.store.writeAsset(this.repo.id, ref.path, asset.value.toSnapshot());
		return asset;
	}

	/**
	 * Whether an asset's bytes are already available locally (captured locally or
	 * downloaded earlier) — a cheap presence check that touches neither the
	 * network nor the bytes themselves. The UI uses it to decide whether to show
	 * an asset straight away (via {@link getAsset}, served from cache) or offer a
	 * download.
	 */
	async isAvailableLocally(ref: AssetRef): Promise<boolean> {
		return this.store.hasAsset(this.repo.id, ref.path);
	}

	/**
	 * Attach a locally-captured asset to a note. The bytes are written to the
	 * asset cache and queued (dirty) for the next {@link sync}; the note records
	 * a pointer to them and is itself saved. Returns the updated note, or a
	 * failure if the asset does not belong under the note's `assets/` folder.
	 */
	async attachAsset(note: Note, asset: Asset): Promise<Result<Note>> {
		const added = note.addAsset(asset.toRef());
		if (!added.success) return added;

		await this.store.writeAsset(this.repo.id, asset.path, asset.toSnapshot());
		const dirty = new Set((await this.store.readDirtyAssets(this.repo.id)) ?? []);
		dirty.add(asset.path);
		await this.store.writeDirtyAssets(this.repo.id, [...dirty]);

		await this.saveNote(note);
		return Success(note);
	}

	/**
	 * Save a note locally and mark it dirty. This does **not** touch GitLab —
	 * the note is queued for the next {@link sync}. Works for both new notes
	 * and edits to existing ones. A save that doesn't change the note's content
	 * is a no-op: it leaves the cached copy and the dirty set untouched, so the
	 * UI can re-save freely (e.g. on every sync click) without queuing an empty
	 * commit.
	 */
	async saveNote(note: Note): Promise<void> {
		const snapshot = note.toSnapshot();
		const cached = await this.store.readNote(this.repo.id, note.filePath);

		// The note may be on the server already even though this instance has no
		// commit token — the UI rebuilds every edit as a fresh `Note.create`,
		// which can't carry one. Recover the token from the cached copy, so an
		// edit to a synced note commits as a guarded update instead of a create
		// that GitLab rejects as "already exists".
		if (snapshot.baseCommitId === null && cached && cached.baseCommitId !== null) {
			snapshot.baseCommitId = cached.baseCommitId;
		}

		// Nothing actually changed since the cached copy — don't dirty it, so the
		// next sync stays idle instead of pushing an empty commit.
		if (cached && sameContent(cached, snapshot)) return;

		await this.store.writeNote(this.repo.id, note.filePath, snapshot);

		const dirty = new Set((await this.store.readDirty(this.repo.id)) ?? []);
		dirty.add(note.filePath);
		await this.store.writeDirty(this.repo.id, [...dirty]);
	}

	/**
	 * Push all locally-saved (dirty) notes to GitLab as a **single commit**,
	 * then refresh the listing. If any note changed on the server since it was
	 * loaded, the whole batch is diverted onto one branch and a single merge
	 * request is opened instead. Once the batch is on the server each pushed
	 * note's cached snapshot is pinned to the commit it landed at, so the next
	 * edit syncs as a guarded update. A failed push (e.g. offline) leaves the
	 * notes dirty and cached for the next sync.
	 */
	async sync(): Promise<SyncReport> {
		const dirtyPaths = (await this.store.readDirty(this.repo.id)) ?? [];
		const dirtyAssetPaths = (await this.store.readDirtyAssets(this.repo.id)) ?? [];

		// Build a commit action (markdown) for each dirty note from its snapshot.
		const actions: CommitAction[] = [];
		const notes: NoteRef[] = [];
		for (const path of dirtyPaths) {
			const snapshot = await this.store.readNote(this.repo.id, path);
			if (!snapshot) continue; // content missing; leave it dirty
			const note = Note.fromSnapshot(snapshot);
			if (!note.success) continue; // corrupt; leave it dirty

			actions.push({
				action: snapshot.baseCommitId === null ? 'create' : 'update',
				filePath: path,
				content: note.value.toMarkdown(),
				lastCommitId: snapshot.baseCommitId ?? undefined
			});
			notes.push({ name: basename(path), path });
		}

		// And one (base64) action per locally-captured asset, from the asset
		// cache. These ride along in the same commit as the notes.
		for (const assetPath of dirtyAssetPaths) {
			const snapshot = await this.store.readAsset(this.repo.id, assetPath);
			if (!snapshot) continue; // bytes missing; leave it dirty
			const asset = Asset.fromSnapshot(snapshot);
			actions.push({
				action: asset.isOnServer ? 'update' : 'create',
				filePath: asset.path,
				content: await asset.toBase64(),
				encoding: 'base64',
				lastCommitId: asset.serverCommitId ?? undefined
			});
		}

		const report = actions.length === 0 ? { kind: 'idle' as const } : await this.pushBatch(actions, notes);
		if (report.kind === 'failed') return report;

		// The batch is on the server now (committed to the default branch, or
		// pushed to a branch for review). Mark the pushed notes clean up front —
		// not gated on the listing refresh below — so a refresh failure can't
		// strand a committed note as dirty and have it re-push as a (rejected)
		// create next time.
		const pushed = new Set(notes.map((ref) => ref.path));
		const remaining = dirtyPaths.filter((path) => !pushed.has(path));
		await this.store.writeDirty(this.repo.id, remaining);

		if (report.kind === 'uploaded') {
			// Pin each pushed note's cached snapshot to the commit it landed at, so
			// a later edit syncs as a guarded update rather than re-creating it.
			await this.markSynced(notes, report.commitId);
		} else if (report.kind === 'merge-request') {
			// Diverted to a merge request: the changes are not on the default
			// branch yet, so drop the cached content and let the next read pull
			// fresh once the request is merged. (Crucially, do NOT clear on `idle`
			// — that would wipe the cached `baseCommitId` tokens of already-synced
			// notes, making the next save treat them as new and push an empty,
			// conflicting commit.)
			await this.store.clearNotes(this.repo.id);
		}

		// The batch (notes + assets) is committed somewhere now, so the locally
		// captured asset bytes are no longer needed — drop them and clear their
		// dirty set. They re-download on demand the next time an asset is opened.
		// (Not on `idle`/`failed`: those keep the read-through asset cache warm.)
		if (report.kind === 'uploaded' || report.kind === 'merge-request') {
			await this.store.writeDirtyAssets(this.repo.id, []);
			await this.store.clearAssets(this.repo.id);
		}

		const fresh = await listNotes(this.#token, this.repo);
		if (fresh.success) await this.store.writeListing(this.repo.id, fresh.value);
		return report;
	}

	// Pin each note's cached snapshot to `commitId`, the commit the batch landed
	// at, so a subsequent edit carries a valid version guard and commits as an
	// update instead of a create.
	private async markSynced(notes: NoteRef[], commitId: string): Promise<void> {
		for (const ref of notes) {
			const snapshot = await this.store.readNote(this.repo.id, ref.path);
			if (!snapshot) continue;
			snapshot.baseCommitId = commitId;
			await this.store.writeNote(this.repo.id, ref.path, snapshot);
		}
	}

	// Commit the batch in one request: a guarded commit straight to the default
	// branch, and on a conflict, one branch + one merge request for the lot.
	private async pushBatch(actions: CommitAction[], notes: NoteRef[]): Promise<SyncReport> {
		const branch = this.repo.default_branch ?? 'main';
		const commitMessage =
			notes.length === 0
				? 'Sync assets'
				: notes.length === 1
					? `Save note ${notes[0].name}`
					: `Sync ${notes.length} notes`;

		const direct = await commitFiles(this.#token, this.repo, { branch, commitMessage, actions });
		if (direct.kind === 'committed') return { kind: 'uploaded', notes, commitId: direct.commitId };
		if (direct.kind === 'error') return { kind: 'failed', notes, error: direct.message };

		// Conflict: divert the whole batch onto a fresh branch (created from the
		// default branch in the same request, without the per-file guards) and
		// open a single merge request for review. The guards are dropped, but each
		// action's create/update must still match what's on the branch — otherwise
		// a create whose file already exists (the very clash we're escaping) just
		// fails again. Reconcile create-vs-update against the base branch per file.
		const branchName = `note-sync/${Date.now().toString(36)}`;
		const reconciled = await this.reconcileActions(actions, branch);
		const diverted = await commitFiles(this.#token, this.repo, {
			branch: branchName,
			startBranch: branch,
			commitMessage,
			actions: reconciled
		});
		if (diverted.kind !== 'committed') return { kind: 'failed', notes, error: diverted.message };

		const mr = await createMergeRequest(this.#token, this.repo, branchName, branch, commitMessage);
		return mr.success
			? { kind: 'merge-request', notes, url: mr.value.web_url }
			: { kind: 'failed', notes, error: mr.error };
	}

	// Drop the per-file guards and set each action's create/update to match the
	// file's presence on `branch`, so the diverted commit lands cleanly however
	// the conflict arose. If an existence probe fails, the action is left as-is.
	private async reconcileActions(actions: CommitAction[], branch: string): Promise<CommitAction[]> {
		return Promise.all(
			actions.map(async ({ action, filePath, content, encoding }) => {
				const exists = await fileExists(this.#token, this.repo, filePath, branch);
				const resolved = exists.success ? (exists.value ? 'update' : 'create') : action;
				return { action: resolved, filePath, content, encoding };
			})
		);
	}

	// Union the listing with handles for any still-dirty notes not in it yet
	// (e.g. notes created offline that GitLab hasn't seen).
	private withDirty(base: NoteRef[], dirtyPaths: string[]): NoteRef[] {
		if (dirtyPaths.length === 0) return base;
		const present = new Set(base.map((ref) => ref.path));
		const extra = dirtyPaths.filter((path) => !present.has(path)).map((path) => ({ name: basename(path), path }));
		return extra.length === 0 ? base : [...base, ...extra];
	}
}
