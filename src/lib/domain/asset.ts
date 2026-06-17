import { type Result, Success, Failure } from "./result";
import type { AssetRef } from "./types";

/**
 * An asset's persistent form. The bytes live in a `Blob` — a structured-clone
 * type, so IndexedDB stores it natively (efficient binary, no base64 bloat)
 * and it survives snapshot round-trips. Carries its own MIME type and byte
 * length, plus the `baseCommitId` sync guard.
 */
export type AssetSnapshot = {
  path: string;
  blob: Blob;
  baseCommitId: string | null;
};

/**
 * A binary file attached to a note (image, audio, PDF, …), living under the
 * note's `assets/` folder. The content is held as a `Blob`, which works for
 * any file type, stores efficiently, and renders via `URL.createObjectURL`.
 * Base64 is produced only at the GitLab boundary, via {@link toBase64}.
 */
export default class Asset {
  readonly path: string;
  blob: Blob;

  // The commit this asset's bytes were last in sync with on the server; `null`
  // for an asset added locally and not yet pushed. The controller uses it as
  // the create-vs-update signal and optimistic-concurrency guard when syncing.
  private baseCommitId: string | null;

  private constructor(path: string, blob: Blob, baseCommitId: string | null) {
    this.path = path;
    this.blob = blob;
    this.baseCommitId = baseCommitId;
  }

  /**
   * Create an asset. Omit `baseCommitId` for a new, locally-added asset;
   * the controller passes the server commit when building one from a download.
   */
  static create(path: string, blob: Blob, baseCommitId: string | null = null): Result<Asset> {
    if (path.trim().length === 0) return Failure("An asset requires a non-empty path.");
    return Success(new Asset(path, blob, baseCommitId));
  }

  /** MIME type, e.g. "image/png" (empty string when unknown). */
  get type(): string {
    return this.blob.type;
  }

  /** Size in bytes. */
  get size(): number {
    return this.blob.size;
  }

  /** File name without its directory, e.g. "photo.png". */
  get basename(): string {
    return this.path.split("/").pop() ?? this.path;
  }

  /**
   * A lightweight pointer to this asset — its place in a note's asset list and
   * the handle the controller's `getAsset` resolves back into these bytes.
   * Carries no content, so it is cheap to store on a note and move with it.
   */
  toRef(): AssetRef {
    return { name: this.basename, path: this.path };
  }

  /** Whether these bytes already exist on the server (vs. added locally). */
  get isOnServer(): boolean {
    return this.baseCommitId !== null;
  }

  /** The commit the server copy is at, or `null` if this asset is new locally. */
  get serverCommitId(): string | null {
    return this.baseCommitId;
  }

  /** Base64-encoded content, for a GitLab commit action (`encoding: base64`). */
  async toBase64(): Promise<string> {
    const bytes = new Uint8Array(await this.blob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000; // chunk to avoid blowing the call stack on large files
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  toSnapshot(): AssetSnapshot {
    return { path: this.path, blob: this.blob, baseCommitId: this.baseCommitId };
  }

  static fromSnapshot(snapshot: AssetSnapshot): Asset {
    return new Asset(snapshot.path, snapshot.blob, snapshot.baseCommitId);
  }
}
