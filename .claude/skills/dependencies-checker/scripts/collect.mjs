#!/usr/bin/env node
// Collects dependency facts for the DevDigest monorepo and prints them as JSON.
// Node built-ins only, so it runs before any package is installed.
//
// Usage (from the repo root):
//   node .claude/skills/dependencies-checker/scripts/collect.mjs            # offline facts
//   node .claude/skills/dependencies-checker/scripts/collect.mjs --audit    # + pnpm/npm audit (network)
//
// Output sections: workspaces (deps with size, usage, kind), rangeDrift,
// duplicates, graph (internal components + cross-package edges), problems.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, normalize } from 'node:path';

const BUILTIN = new Set(builtinModules);

const ROOT = process.cwd();
const WANT_AUDIT = process.argv.includes('--audit');
const CODE_EXT = /\.(m?[jt]sx?|cjs|cts|mts)$/;
const SIZE_CACHE = new Map();
const problems = [];

// Tooling is consumed by config files, not imports, so zero imports is not evidence it is unused.
const TOOLING = /^(eslint|@eslint|typescript|typescript-eslint|prettier|tsx|vitest|@vitest|tailwindcss|@tailwindcss|postcss|autoprefixer|drizzle-kit|next|@types\/|@testing-library\/jest-dom|jsdom|@vitejs\/|pino-pretty|dependency-cruiser|testcontainers|@testcontainers\/)/;

const sh = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    // pnpm/npm exit non-zero on problems but still print JSON; keep stdout when present.
    return err.stdout ? String(err.stdout) : null;
  }
};

const dirBytes = (path) => {
  if (!path || !existsSync(path)) return 0;
  if (SIZE_CACHE.has(path)) return SIZE_CACHE.get(path);
  const out = sh('du', ['-sb', path], ROOT);
  const bytes = out ? Number(out.split('\t')[0]) : 0;
  SIZE_CACHE.set(path, bytes);
  return bytes;
};

// Workspaces = every tracked package.json except the root (there is none) and
// anything gitignored (clones/, .next/), so the scan matches what the repo ships.
const workspaceDirs = (sh('git', ['ls-files', '*package.json'], ROOT) ?? '')
  .split('\n')
  .filter((p) => p.endsWith('package.json') && !p.includes('node_modules/'))
  .map((p) => dirname(p))
  .filter((d) => d !== '.');

const codeFiles = (dir) =>
  (sh('git', ['ls-files', '--', dir], ROOT) ?? '')
    .split('\n')
    .filter((f) => CODE_EXT.test(f) && !f.includes('node_modules/'));

// --- import scanning ------------------------------------------------------
// Only statement-level imports count (line starts with import/export/require or a
// dynamic import()). A specifier inside a template literal is generated code, not a dependency.
// The gap between `import` and `from` holds only bindings ({ a, b as c }, type, *), never quotes or `;`.
const STATIC_IMPORT_RE = /^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;
const CALL_IMPORT_RE = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
const importSpecs = (raw) => {
  // Doc comments quote import examples; drop comment-only lines before scanning.
  // Template literals hold fixture or generated code (e.g. test samples), not real imports.
  const text = raw
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/)/.test(line))
    .join('\n');
  return [
    ...text.matchAll(STATIC_IMPORT_RE),
    ...text.matchAll(BARE_IMPORT_RE),
    ...text.matchAll(CALL_IMPORT_RE),
  ].map((m) => m[1]);
};

const packageOf = (spec) => {
  // Relative paths, absolute paths, subpath imports (#x) and tsconfig aliases are not packages.
  if (/^(\.|\/|#|@\/|~\/)/.test(spec)) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

// Component key for the graph: server modules get one node each, other paths
// are grouped by their first two segments under src/.
const componentOf = (file) => {
  const p = file.split('/');
  const srcIdx = p.indexOf('src');
  const pkg = p[0];
  if (srcIdx === -1) return `${pkg}:other`;
  if (p[srcIdx + 1] === 'modules' && p[srcIdx + 2]) return `${pkg}:modules/${p[srcIdx + 2]}`;
  if (p[srcIdx + 1]) return `${pkg}:src/${p[srcIdx + 1]}`;
  return `${pkg}:src`;
};

const resolveRelative = (fromFile, spec) => {
  const target = normalize(join(dirname(fromFile), spec)).replaceAll('\\', '/');
  return target.replace(/\.js$/, '.ts');
};

// --- dependency tree ------------------------------------------------------
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const loadTree = (dir) => {
  const abs = join(ROOT, dir);
  const hasPnpmLock = existsSync(join(abs, 'pnpm-lock.yaml'));
  const hasNpmLock = existsSync(join(abs, 'package-lock.json'));
  const installedWithPnpm = existsSync(join(abs, 'node_modules', '.pnpm'));
  if (hasPnpmLock && hasNpmLock) {
    problems.push({ workspace: dir, severity: 'high', kind: 'dual-lockfile', detail: 'both pnpm-lock.yaml and package-lock.json are tracked' });
  }
  const manager = installedWithPnpm || (hasPnpmLock && !hasNpmLock) ? 'pnpm' : 'npm';
  if (!existsSync(join(abs, 'node_modules'))) {
    problems.push({ workspace: dir, severity: 'medium', kind: 'not-installed', detail: 'node_modules missing; sizes and closures are unavailable' });
    return { manager, tree: null };
  }
  const raw = manager === 'pnpm'
    ? sh('pnpm', ['ls', '--json', '--depth', 'Infinity'], abs)
    : sh('npm', ['ls', '--all', '--long', '--json'], abs); // --long adds the install path used for sizing
  if (!raw) {
    problems.push({ workspace: dir, severity: 'medium', kind: 'tree-unavailable', detail: `${manager} ls produced no output` });
    return { manager, tree: null };
  }
  const parsed = JSON.parse(raw);
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  for (const line of (root.problems ?? [])) {
    problems.push({ workspace: dir, severity: 'low', kind: line.startsWith('extraneous') ? 'extraneous' : 'tree-problem', detail: line });
  }
  return { manager, tree: root };
};

// Walks a subtree and returns the unique installed directories it reaches.
const reachable = (node, seen = new Map()) => {
  if (!node) return seen;
  for (const [name, child] of Object.entries(node.dependencies ?? {})) {
    const key = child.path ?? `${name}@${child.version}`;
    if (!seen.has(key)) {
      seen.set(key, { name, version: child.version, path: child.path });
      reachable(child, seen);
    }
  }
  return seen;
};

// --- main -----------------------------------------------------------------
const workspaces = [];
const allDirectVersions = new Map(); // name -> [{workspace, range}]

for (const dir of workspaceDirs) {
  const pkg = readJson(join(ROOT, dir, 'package.json'));
  const { manager, tree } = loadTree(dir);
  const files = codeFiles(dir);

  // Usage: how many code files import each package.
  const usage = new Map();
  const edges = new Map();
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const seenHere = new Set();
    for (const spec of importSpecs(text)) {
      const ext = packageOf(spec);
      if (ext) {
        if (!seenHere.has(ext)) {
          usage.set(ext, (usage.get(ext) ?? 0) + 1);
          seenHere.add(ext);
        }
        continue;
      }
      // Relative import: internal graph edge, possibly cross-package if it leaves the workspace.
      if (!spec.startsWith('.')) continue;
      const target = resolveRelative(file, spec);
      const from = componentOf(file);
      const to = componentOf(target);
      if (from !== to) {
        const key = `${from} -> ${to}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }

  const declared = [
    ...Object.entries(pkg.dependencies ?? {}).map(([name, range]) => ({ name, range, kind: 'runtime' })),
    ...Object.entries(pkg.devDependencies ?? {}).map(([name, range]) => ({ name, range, kind: 'dev' })),
  ];

  // Phantom dependencies: imported but not declared in this package.json. They work only
  // because a hoisted or sibling install happens to provide them, so a clean install breaks.
  const declaredNames = new Set(declared.map((d) => d.name));
  const phantoms = [...usage.keys()].filter((name) =>
    !declaredNames.has(name) && name !== pkg.name && !BUILTIN.has(name) &&
    !name.startsWith('@devdigest/') && !name.startsWith('node:'));
  for (const name of phantoms) {
    problems.push({ workspace: dir, severity: 'high', kind: 'phantom-import', detail: `${name} is imported but not declared in ${dir}/package.json` });
  }

  // pnpm lists devDependencies under their own key; npm merges them into dependencies.
  const rootDeps = { ...(tree?.dependencies ?? {}), ...(tree?.devDependencies ?? {}) };
  const deps = declared.map((d) => {
    const node = rootDeps[d.name];
    const version = node?.version ?? null;
    const ownBytes = node ? dirBytes(node.path) : 0;
    const closure = node ? reachable(node) : new Map();
    let closureBytes = ownBytes;
    for (const entry of closure.values()) closureBytes += dirBytes(entry.path);
    // npm keeps a declared-but-absent package in the tree without a version; pnpm omits it.
    if (tree && !version) {
      problems.push({ workspace: dir, severity: 'medium', kind: 'missing-install', detail: `${d.name}@${d.range} declared but not installed` });
    }
    const uses = usage.get(d.name) ?? 0;
    if (!allDirectVersions.has(d.name)) allDirectVersions.set(d.name, []);
    allDirectVersions.get(d.name).push({ workspace: dir, range: d.range, version });
    return {
      name: d.name,
      range: d.range,
      kind: d.kind,
      installedVersion: version,
      ownBytes,
      closureBytes,
      transitiveCount: Math.max(closure.size - 1, 0),
      importingFiles: uses,
      toolingLike: TOOLING.test(d.name),
      unusedCandidate: uses === 0 && !TOOLING.test(d.name) && d.kind === 'runtime',
    };
  });

  // Duplicates: same package name at more than one installed version inside this workspace.
  const versionsByName = new Map();
  const walkAll = (node) => {
    for (const [name, child] of Object.entries(node?.dependencies ?? {})) {
      if (child.version) {
        if (!versionsByName.has(name)) versionsByName.set(name, new Map());
        const bytes = dirBytes(child.path);
        versionsByName.get(name).set(child.version, bytes);
      }
      walkAll(child);
    }
  };
  walkAll(tree);
  const duplicates = [...versionsByName.entries()]
    .filter(([, v]) => v.size > 1)
    .map(([name, v]) => ({
      name,
      versions: [...v.keys()],
      extraBytes: [...v.values()].sort((a, b) => b - a).slice(1).reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.extraBytes - a.extraBytes);

  workspaces.push({
    name: pkg.name,
    path: dir,
    manager,
    lockfiles: ['pnpm-lock.yaml', 'package-lock.json'].filter((f) => existsSync(join(ROOT, dir, f))),
    totalInstalledBytes: dirBytes(join(ROOT, dir, 'node_modules')),
    deps: deps.sort((a, b) => b.closureBytes - a.closureBytes),
    duplicates,
    internalEdges: [...edges.entries()].map(([k, v]) => ({ edge: k, imports: v })).sort((a, b) => b.imports - a.imports),
  });
}

// Same dependency declared with different ranges across workspaces.
const rangeDrift = [...allDirectVersions.entries()]
  .filter(([, list]) => new Set(list.map((x) => x.range)).size > 1)
  .map(([name, list]) => ({ name, declarations: list }));

// Cross-package edges from the internal graph (component edges that change package).
const crossPackage = workspaces.flatMap((w) =>
  w.internalEdges.filter((e) => e.edge.split(' -> ')[0].split(':')[0] !== e.edge.split(' -> ')[1].split(':')[0])
    .map((e) => ({ from: w.name, ...e })),
);

const result = {
  generatedAt: new Date().toISOString(),
  repoRoot: ROOT,
  workspaces,
  rangeDrift,
  crossPackageEdges: crossPackage,
  problems,
};

if (WANT_AUDIT) {
  result.audit = workspaces.map((w) => {
    const abs = join(ROOT, w.path);
    const raw = w.manager === 'pnpm'
      ? sh('pnpm', ['audit', '--json'], abs)
      : sh('npm', ['audit', '--json'], abs);
    return { workspace: w.path, manager: w.manager, raw: raw ? raw.slice(0, 2_000_000) : null };
  });
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
