// ── Type-level branding ────────────────────────────────────────────
// These are plain strings at runtime (survive JSON serialization),
// but TypeScript treats them as distinct types at compile time.
// You cannot pass a String where a GitlabToken is expected.

type Brand<T, B extends string> = T & { readonly __brand: B };

export type GitlabToken = Brand<string, 'GitlabToken'>;
