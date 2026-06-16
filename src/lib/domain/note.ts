import { type Result, Success, Failure } from './result';
import { parseYaml, asString, isRecord, type Yaml } from './yaml';
import type { NoteRef } from './types';
import Asset, { type AssetSnapshot } from './asset';

// ── Domain types ───────────────────────────────────────────────────
// A note's frontmatter `tags` are ISA-style ontology annotations (the
// nfdi4plants / ARC ecosystem this app talks to). Each annotation points
// at a term in some ontology and carries free-form `comments`.

export type AnnotationComment = {
	name: string;
	value: string;
};

export type OntologyAnnotation = {
	/** Human-readable label, e.g. "calving of ice onto land". */
	annotationValue: string;
	/** Ontology short name, e.g. "ENVO". */
	termSource: string;
	/** Accession within that ontology, e.g. "ENVO:01001657". */
	termAccession: string;
	comments: AnnotationComment[];
};

/**
 * A note's full persistent state as a plain, structured-cloneable object — the
 * form used to cache a note locally (e.g. in IndexedDB) and rehydrate it.
 * (Asset bytes are `Blob`s, so it is clone-storable, not JSON-serializable.)
 * Unlike `toMarkdown`, it also carries the `baseCommitId` concurrency token,
 * so a cached note saves with the same conflict guarantees as a freshly
 * loaded one.
 */
export type NoteSnapshot = {
	slug: string;
	title: string;
	content: string;
	/** Calendar day, `YYYY-MM-DD`. */
	date: string;
	tags: OntologyAnnotation[];
	assets: AssetSnapshot[];
	baseCommitId: string | null;
};

// ── Slug helpers ───────────────────────────────────────────────────
// The slug is the on-disk identity (folder name and markdown basename).
// It is intentionally narrower than a title: only A-Z, a-z, 0-9 and a
// single `-` between segments, so it is safe as a path component on any
// filesystem and inside a URL. It is derived from the title once, at
// creation, and then stays fixed — independent of later title edits.

export const SLUG_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

/** Derive a legal slug from a free-form title, or `null` if nothing survives. */
function slugify(title: string): string | null {
	const slug = title
		.trim()
		.replace(/\s+/g, '-') // whitespace runs → a single dash
		.replace(/[^A-Za-z0-9-]/g, '') // drop everything else
		.replace(/-+/g, '-') // collapse repeated dashes
		.replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
	return slug.length > 0 ? slug : null;
}

// The slug of a note is the name of the folder containing its markdown
// file: notes/<date>/<slug>/<slug>.md. Falls back to the bare filename
// for any note that doesn't follow the foldered layout.
function slugFromPath(path: string): string {
	const parts = path.split('/').filter((p) => p.length > 0);
	return parts.length >= 2 ? parts[parts.length - 2] : path.replace(/\.md$/, '');
}

// The date folder of a note in notes/<date>/<slug>/<slug>.md, or `null` if
// no path segment looks like a YYYY-MM-DD calendar day. Used to recover a
// date for notes that carry no frontmatter.
function dateFromPath(path: string): Date | null {
	for (const part of path.split('/')) {
		const parsed = parseDate(part);
		if (parsed.success) return parsed.value;
	}
	return null;
}

// ── Date helpers ───────────────────────────────────────────────────
// Notes are dated by calendar day (YYYY-MM-DD), with no time or zone.
// Work in UTC throughout so a note keyed to a given day never drifts
// across a day boundary depending on the runtime's local timezone.

function formatDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function parseDate(raw: string): Result<Date> {
	const text = raw.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return Failure(`Invalid date "${raw}", expected YYYY-MM-DD.`);
	}
	const date = new Date(`${text}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? Failure(`Invalid date "${raw}".`) : Success(date);
}

// ── Frontmatter coercions ──────────────────────────────────────────
// Read the loosely-typed YAML tree onto the domain model. A missing or
// wrongly-shaped field degrades to an empty value rather than failing the
// whole parse — only `title`/`date` are treated as required.

function asComments(value: Yaml | undefined): AnnotationComment[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(isRecord)
		.map((comment) => ({ name: asString(comment.name), value: asString(comment.value) }));
}

function asTags(value: Yaml | undefined): OntologyAnnotation[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord).map((tag) => ({
		annotationValue: asString(tag.annotationValue),
		termSource: asString(tag.termSource),
		termAccession: asString(tag.termAccession),
		comments: asComments(tag.comments)
	}));
}

// Splits a note into its YAML frontmatter and markdown body. Tolerates
// CRLF and an optional trailing newline after the closing delimiter.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * A single note: its frontmatter (title, date, ontology tags), its markdown
 * body and the assets beside it. A pure domain value — it knows how to
 * (de)serialize itself (markdown via {@link toMarkdown}/{@link fromMarkdown},
 * cache snapshots via {@link toSnapshot}/{@link fromSnapshot}) but does no
 * I/O; loading and syncing live in `NoteController`.
 *
 * Fields are mutable: edit `title`, `content`, `tags`, … in place. The one
 * exception is {@link slug}, the on-disk identity, which is fixed at creation.
 * Instances can only be built via {@link create}, {@link fromMarkdown} or
 * {@link fromSnapshot}, so a `Note` in memory always has a valid slug and a
 * real date.
 */
export default class Note {
	title: string;
	content: string;
	date: Date;
	tags: OntologyAnnotation[];
	assets: Asset[];
	readonly slug: string;

	// The commit this note's content was last in sync with on the server: set
	// when built from a fetched file, carried through snapshots, and `null` for
	// a note that has never been persisted. The controller passes it to GitLab
	// as the optimistic-concurrency guard when syncing. Private — it is
	// bookkeeping, not part of the note.
	private baseCommitId: string | null = null;

	private constructor(
		title: string,
		content: string,
		date: Date,
		tags: OntologyAnnotation[],
		assets: Asset[],
		slug: string
	) {
		this.title = title;
		this.content = content;
		this.date = date;
		this.tags = tags;
		this.assets = assets;
		this.slug = slug;
	}

	/**
	 * Turn a free-form title into a slug candidate (letters, digits and
	 * single dashes), or `null` if nothing usable survives. Exposed so the
	 * frontend can suggest/validate a slug before calling {@link create};
	 * `create` still validates whatever slug it is handed.
	 */
	static slugify(title: string): string | null {
		return slugify(title);
	}

	/**
	 * Create a new note. The caller supplies the `slug` (the fixed on-disk
	 * identity) — typically from {@link slugify}. Creation fails if the
	 * title is empty or the slug is not letters/digits/single-dashes.
	 */
	static create(
		title: string,
		slug: string,
		content: string,
		date: Date = new Date(),
		tags: OntologyAnnotation[] = []
	): Result<Note> {
		const trimmed = title.trim();
		if (trimmed.length === 0) return Failure('A note requires a non-empty title.');
		if (!SLUG_PATTERN.test(slug)) {
			return Failure(`"${slug}" is not a valid note slug: use letters, digits and single dashes.`);
		}

		return Success(new Note(trimmed, content, date, tags, [], slug));
	}

	/**
	 * Build a note from raw markdown. The `slug` is the on-disk identity
	 * (taken from the file's folder), kept separate from the frontmatter
	 * title so the two never have to agree.
	 *
	 * A file with no frontmatter is still a valid note: its whole text
	 * becomes the content, the slug stands in for the title, and the date
	 * falls back to `fallbackDate` (which the caller derives from the path).
	 */
	private static parse(
		markdown: string,
		slug: string,
		fallbackDate: Date,
		assets: Asset[] = []
	): Result<Note> {
		if (!SLUG_PATTERN.test(slug)) return Failure(`"${slug}" is not a valid note slug.`);

		const match = FRONTMATTER.exec(markdown);
		if (!match) {
			return Success(new Note(slug, markdown.trim(), fallbackDate, [], assets, slug));
		}

		const [, frontmatter, body] = match;
		const root = parseYaml(frontmatter);
		const fields = isRecord(root) ? root : {};

		const title = asString(fields.title).trim();
		if (title.length === 0) return Failure('Note frontmatter is missing a title.');

		const date = parseDate(asString(fields.date));
		if (!date.success) return Failure(date.error);

		return Success(new Note(title, body.trim(), date.value, asTags(fields.tags), assets, slug));
	}

	/**
	 * Build a note from raw markdown fetched from a repository. `ref` carries
	 * the on-disk identity (slug from the folder, date fallback from the path)
	 * and `baseCommitId` is the commit the content was fetched at — the
	 * optimistic-concurrency guard a later sync uses. This does no I/O; the
	 * caller fetches the bytes and this interprets them.
	 */
	static fromMarkdown(markdown: string, ref: NoteRef, baseCommitId: string | null): Result<Note> {
		// For a note without frontmatter, the date comes from the path's date
		// folder, or today if the path carries no recognisable date.
		const fallbackDate = dateFromPath(ref.path) ?? new Date();
		const parsed = Note.parse(markdown, slugFromPath(ref.path), fallbackDate);
		if (!parsed.success) return parsed;

		parsed.value.baseCommitId = baseCommitId;
		return parsed;
	}

	/** Serialize to a markdown file, the inverse of {@link fromMarkdown}. */
	toMarkdown(): string {
		const lines = ['---', `title: ${this.title}`, `date: ${formatDate(this.date)}`];

		if (this.tags.length === 0) {
			lines.push('tags: []');
		} else {
			lines.push('tags:');
			for (const tag of this.tags) {
				lines.push('  -');
				lines.push(`    annotationValue: ${tag.annotationValue}`);
				lines.push(`    termSource: ${tag.termSource}`);
				lines.push(`    termAccession: ${tag.termAccession}`);
				if (tag.comments.length === 0) {
					lines.push('    comments: []');
				} else {
					lines.push('    comments:');
					for (const comment of tag.comments) {
						lines.push('      -');
						lines.push(`        name: ${comment.name}`);
						lines.push(`        value: ${comment.value}`);
					}
				}
			}
		}

		lines.push('---');
		return `${lines.join('\n')}\n\n${this.content}\n`;
	}

	addAsset(asset: Asset): Result<Note> {
	  this.assets.push(asset);
		return Success(this);
	}

	// ── On-disk layout ────────────────────────────────────────────────
	// notes/<date>/<slug>/<slug>.md  with assets under .../<slug>/assets/.

	/** The `YYYY-MM-DD` folder name this note lives under. */
	get dateFolder(): string {
		return formatDate(this.date);
	}

	/** Repo-relative folder holding this note, e.g. `notes/2026-06-16/My-Note`. */
	get folderPath(): string {
		return `notes/${this.dateFolder}/${this.slug}`;
	}

	/** Repo-relative path of the markdown file itself. */
	get filePath(): string {
		return `${this.folderPath}/${this.slug}.md`;
	}

	/** Repo-relative folder for this note's assets. */
	get assetsFolder(): string {
		return `${this.folderPath}/assets`;
	}

	/** A lightweight handle to this note — e.g. to key a cache or to reload it. */
	toNoteRef(): NoteRef {
		return { name: `${this.slug}.md`, path: this.filePath };
	}

	/**
	 * Capture this note's full persistent state — including the
	 * `baseCommitId` concurrency token — for local caching. The result is
	 * meant to be persisted (and cloned) by the store; see {@link fromSnapshot}.
	 */
	toSnapshot(): NoteSnapshot {
		return {
			slug: this.slug,
			title: this.title,
			content: this.content,
			date: formatDate(this.date),
			tags: this.tags,
			assets: this.assets.map((a) => a.toSnapshot()),
			baseCommitId: this.baseCommitId
		};
	}

	/**
	 * Rebuild a note from a {@link toSnapshot} payload, re-checking its
	 * invariants so a corrupt cache entry fails cleanly rather than producing
	 * a malformed note. The rehydrated note owns fresh copies of its arrays.
	 */
	static fromSnapshot(snapshot: NoteSnapshot): Result<Note> {
		if (!SLUG_PATTERN.test(snapshot.slug)) {
			return Failure(`"${snapshot.slug}" is not a valid note slug.`);
		}
		const date = parseDate(snapshot.date);
		if (!date.success) return Failure(date.error);

		const note = new Note(
			snapshot.title,
			snapshot.content,
			date.value,
			structuredClone(snapshot.tags),
			snapshot.assets.map((a) => Asset.fromSnapshot(a)),
			snapshot.slug
		);
		note.baseCommitId = snapshot.baseCommitId;
		return Success(note);
	}
}
