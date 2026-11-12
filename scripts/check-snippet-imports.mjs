#!/usr/bin/env node
// Checks the code snippets in `pages/**/*.mdx` against the PUBLISHED `@fluxgantt/*` packages
// pinned in package.json. The docs live in their own repo now, so nothing else stops a page from
// importing a subpath or a name that the released version does not export (a feature documented
// before it ships, a rename, a typo).
//
// For every fenced code block, every `import { a, b } from '@fluxgantt/...'` statement is checked:
//   - the specifier resolves through the package's `exports` map (so `@fluxgantt/core/nope` fails);
//   - every value import (not `import type`, not an inline `type X`) is a real runtime export.
// Type-only imports cannot be checked at runtime and are skipped.
//
// Run: npm run check:imports  (exits non-zero on a problem; used in CI)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(repoRoot, 'pages');

const mdxFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.mdx') || entry.endsWith('.md')) mdxFiles.push(full);
  }
};
walk(pagesDir);

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
// `import { ... } from '@fluxgantt/...'`, possibly multi-line, optionally `import type`.
const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"](@fluxgantt\/[^'"]+)['"]/g;

/** specifier -> Map<name, firstLocation> */
const wanted = new Map();
for (const file of mdxFiles) {
  const text = readFileSync(file, 'utf8');
  for (const [, code] of text.matchAll(FENCE)) {
    for (const [, typeOnly, names, specifier] of code.matchAll(IMPORT)) {
      if (!wanted.has(specifier)) wanted.set(specifier, new Map());
      const where = relative(repoRoot, file);
      if (typeOnly) continue;
      for (const raw of names.split(',')) {
        const name = raw.trim();
        if (name === '' || name.startsWith('type ')) continue;
        const imported = name.split(/\s+as\s+/)[0].trim();
        if (!wanted.get(specifier).has(imported)) wanted.get(specifier).set(imported, where);
      }
    }
  }
}

if (wanted.size === 0) {
  console.error('\n✗ check-snippet-imports: no @fluxgantt/* imports found in pages/ — the regex is stale.\n');
  process.exit(1);
}

// The Temporal polyfill must be installed before core evaluates in a runtime without Temporal.
if (typeof globalThis.Temporal === 'undefined') {
  const { Temporal } = await import('@js-temporal/polyfill');
  globalThis.Temporal = Temporal;
}

const problems = [];
let checked = 0;
for (const [specifier, names] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
  let mod;
  try {
    mod = await import(specifier);
  } catch (error) {
    problems.push(`${specifier}: does not resolve in the installed package (${error.code ?? error.message})`);
    continue;
  }
  for (const [name, where] of names) {
    checked += 1;
    if (!(name in mod)) problems.push(`${where}: '${name}' is not exported by ${specifier}`);
  }
}

if (problems.length > 0) {
  console.error(`\n✗ check-snippet-imports:\n  ${problems.join('\n  ')}\n`);
  process.exit(1);
}
console.log(
  `✓ check-snippet-imports: ${wanted.size} @fluxgantt/* specifiers and ${checked} named imports ` +
    `in ${mdxFiles.length} pages resolve against the installed packages`,
);
