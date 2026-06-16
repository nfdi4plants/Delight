import { type Result, Success, Failure } from './result';
import { parseYaml, asString, isRecord, type Yaml } from './yaml';
import type { GitlabToken, Repository, NoteRef } from './types';
import { getNote, pushNote } from '../services/git-service';

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

// ── Slug helpers ───────────────────────────────────────────────────
// The slug is the on-disk identity (folder name and markdown basename).
// It is intentionally narrower than a title: only A-Z, a-z, 0-9 and a
// single `-` between segments, so it is safe as a path component on any
// filesystem and inside a URL. It is derived from the title once, at
// creation, and then stays fixed — independent of later title edits.

const SLUG_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

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
 * A single note: its frontmatter (title, date, ontology tags), its
 * markdown body and the asset file names beside it. This is the type the
 * rest of the app works with — it knows how to load and save itself
 * through the (pure) git-service, and how to (de)serialize its markdown.
 *
 * Fields are mutable: edit `title`, `content`, `tags`, … in place and
 * call {@link save}. The one exception is {@link slug}, the on-disk
 * identity, which is fixed at creation. Instances can only be built via
 * {@link create}, {@link parse} or {@link load}, so a `Note` in memory
 * always has a valid slug and a real date.
 */
export default class Note {
	title: string;
	content: string;
	date: Date;
	tags: OntologyAnnotation[];
	assets: string[];
	readonly slug: string;

	private constructor(
		title: string,
		content: string,
		date: Date,
		tags: OntologyAnnotation[],
		assets: string[],
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
	 * Create a new note. The slug is derived from the title (letters,
	 * digits and single dashes); creation fails if the title is empty or
	 * yields no usable slug characters.
	 */
	static create(
		title: string,
		content: string,
		date: Date = new Date(),
		tags: OntologyAnnotation[] = []
	): Result<Note> {
		const trimmed = title.trim();
		if (trimmed.length === 0) return Failure('A note requires a non-empty title.');

		const slug = slugify(trimmed);
		if (slug === null) {
			return Failure(`Cannot derive a slug from "${title}": no usable characters.`);
		}

		return Success(new Note(trimmed, content, date, tags, [], slug));
	}

	/**
	 * Build a note from raw markdown. The `slug` is the on-disk identity
	 * (taken from the file's folder), kept separate from the frontmatter
	 * title so the two never have to agree.
	 */
	private static parse(markdown: string, slug: string, assets: string[] = []): Result<Note> {
		if (!SLUG_PATTERN.test(slug)) return Failure(`"${slug}" is not a valid note slug.`);

		const match = FRONTMATTER.exec(markdown);
		if (!match) return Failure('Note is missing YAML frontmatter delimited by ---.');

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
	 * Load an existing note from a repository: fetch its markdown through
	 * the git-service and parse it. The slug is recovered from the file's
	 * path on disk.
	 */
	static async load(token: GitlabToken, repo: Repository, ref: NoteRef): Promise<Result<Note>> {
		const raw = await getNote(token, repo, ref);
		if (!raw.success) return Failure(raw.error);
		return Note.parse(raw.value, slugFromPath(ref.path));
	}

	/** Persist this note to its derived path via the git-service. */
	async save(token: GitlabToken, repo: Repository): Promise<Result<null>> {
		return pushNote(token, repo, this.filePath, this.toMarkdown(), `Save note ${this.title}`);
	}

	/** Serialize to a markdown file, the inverse of {@link parse}. */
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

	/** Repo-relative path of a named asset. */
	assetPath(name: string): string {
		return `${this.assetsFolder}/${name}`;
	}
}
