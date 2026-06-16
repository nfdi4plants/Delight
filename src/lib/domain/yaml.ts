// ── Minimal block-YAML parser ──────────────────────────────────────
// A small, dependency-free reader for the subset of YAML our note
// frontmatter uses. It is deliberately *not* a conformant YAML parser:
// every scalar is taken as the raw remainder of its line, so a value like
//   value: "An ice calving process..." [https://orcid.org/...]
// (trailing text after a quoted scalar — illegal in strict YAML) is kept
// verbatim instead of throwing. That also means colons, quotes and
// brackets inside values survive untouched and round-trip byte-for-byte.
//
// Only the two shapes notes use are understood: block mappings
// (`key: value` or `key:` followed by an indented block) and block
// sequences (`-` on its own line, or `- inline`).

export type Yaml = string | Yaml[] | { [key: string]: Yaml };

type Token = { indent: number; content: string };
type Cursor = { i: number };

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	for (const line of text.split('\n')) {
		const content = line.trim();
		if (content.length === 0) continue; // blank lines carry no structure
		tokens.push({ indent: line.length - line.trimStart().length, content });
	}
	return tokens;
}

function isSequenceItem(content: string): boolean {
	return content === '-' || content.startsWith('- ');
}

function parseValueAt(tokens: Token[], cursor: Cursor, indent: number): Yaml {
	return isSequenceItem(tokens[cursor.i].content)
		? parseSequence(tokens, cursor, indent)
		: parseMapping(tokens, cursor, indent);
}

function parseMapping(tokens: Token[], cursor: Cursor, indent: number): { [key: string]: Yaml } {
	const obj: { [key: string]: Yaml } = {};
	while (cursor.i < tokens.length) {
		const line = tokens[cursor.i];
		if (line.indent !== indent || isSequenceItem(line.content)) break;
		const colon = line.content.indexOf(':');
		if (colon === -1) break;
		const key = line.content.slice(0, colon).trim();
		const inline = line.content.slice(colon + 1).trim();
		cursor.i++;
		if (inline.length > 0) {
			obj[key] = inline; // scalar on the same line
		} else if (cursor.i < tokens.length && tokens[cursor.i].indent > indent) {
			obj[key] = parseValueAt(tokens, cursor, tokens[cursor.i].indent); // nested block
		} else {
			obj[key] = ''; // empty value
		}
	}
	return obj;
}

function parseSequence(tokens: Token[], cursor: Cursor, indent: number): Yaml[] {
	const items: Yaml[] = [];
	while (cursor.i < tokens.length) {
		const line = tokens[cursor.i];
		if (line.indent !== indent || !isSequenceItem(line.content)) break;
		const inline = line.content === '-' ? '' : line.content.slice(2).trim();
		cursor.i++;

		if (inline === '') {
			// `-` alone: the item is the indented block beneath it.
			if (cursor.i < tokens.length && tokens[cursor.i].indent > indent) {
				items.push(parseValueAt(tokens, cursor, tokens[cursor.i].indent));
			} else {
				items.push('');
			}
			continue;
		}

		const colon = inline.indexOf(':');
		if (colon === -1) {
			items.push(inline); // `- scalar`
			continue;
		}

		// `- key: value`: a mapping whose first entry sits on the dash line and
		// whose remaining entries are indented beneath it.
		const obj: { [key: string]: Yaml } = {
			[inline.slice(0, colon).trim()]: inline.slice(colon + 1).trim()
		};
		if (cursor.i < tokens.length && tokens[cursor.i].indent > indent) {
			Object.assign(obj, parseMapping(tokens, cursor, tokens[cursor.i].indent));
		}
		items.push(obj);
	}
	return items;
}

/** Parse a block-YAML document into a loosely-typed tree. */
export function parseYaml(text: string): Yaml {
	const tokens = tokenize(text);
	return tokens.length === 0 ? {} : parseValueAt(tokens, { i: 0 }, tokens[0].indent);
}

// ── Coercions ──────────────────────────────────────────────────────
// Helpers for reading the loosely-typed tree without scattering `typeof`
// checks across callers.

export function asString(value: Yaml | undefined): string {
	return typeof value === 'string' ? value : '';
}

export function isRecord(value: Yaml | undefined): value is { [key: string]: Yaml } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
