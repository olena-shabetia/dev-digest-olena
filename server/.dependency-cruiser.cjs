// server/.dependency-cruiser.cjs
//
// Mechanical enforcement of the Onion Architecture described in AGENTS.md
// and .claude/skills/onion-architecture/. Rings, innermost first:
//   1. reviewer-core/src/**        pure domain core (openai + zod only)
//   2. src/vendor/shared/**        PORTS + Zod contracts (canonical, "do not touch")
//   3. src/modules/<name>/**       routes -> service -> repository
//   4. src/adapters/**             driven adapters; the ONLY home for vendor SDKs
//   5. src/platform/**, src/db/**  cross-cutting + composition root
//
// Run: pnpm arch            (fails CI on NEW violations only, via --ignore-known)
//      pnpm arch:report     (human-readable, prints each rule's comment)
//      pnpm arch:baseline   (re-record the known-violations file after a fix)
//
// See .claude/skills/onion-architecture/reference/enforcement.md for the full
// rationale, in particular why tsPreCompilationDeps must stay true.

/** Composition roots: allowed to reach across every ring to wire things up. */
const COMPOSITION_ROOT = [
  '^src/app\\.ts$',
  '^src/server\\.ts$',
  '^src/platform/container\\.ts$',
];

/** Files legitimately touching Fastify outside routes.ts. */
const FASTIFY_ALLOWED_FROM = [
  '^src/modules/[^/]+/routes\\.ts$',
  '^src/modules/index\\.ts$',
  '^src/modules/_shared/',
  '^src/platform/',
  '^src/db/seed-prompts\\.ts$',
  ...COMPOSITION_ROOT,
];

// dependency-cruiser's `path` matchers run against the RESOLVED path, not the
// import specifier. With `doNotFollow` (not `exclude`) keeping node_modules
// edges visible, an npm package resolves to one of two shapes depending on
// its own export map / pnpm layout:
//   - nested:     node_modules/.pnpm/<pkg>@<version>.../node_modules/<pkg>/...
//   - unresolved: the bare specifier itself (observed for `octokit`)
// A pattern anchored on `^drizzle-orm` or `^zod$` matches NEITHER shape and
// silently never fires. `pkg(name)` returns BOTH patterns as separate array
// entries (dependency-cruiser's rule engine already ORs an array of `path`
// values) rather than one combined regex -- a single regex mixing `.*` with
// an optional group tripped dependency-cruiser's ReDoS safety check ("unsafe
// regular expression. Bailing out"), which silently disables rule matching.
function pkg(name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return [`(^|/)node_modules/${esc}(/|$)`, `(^|/)node_modules/.+/node_modules/${esc}(/|$)`, `^${esc}$`];
}

/** Vendor SDKs that may only ever be imported from src/adapters/**. */
const VENDOR_SDKS = [
  ...pkg('octokit'),
  ...pkg('@octokit'),
  ...pkg('openai'),
  ...pkg('@anthropic-ai/sdk'),
  ...pkg('simple-git'),
  ...pkg('@ast-grep/napi'),
  ...pkg('@vscode/ripgrep'),
  ...pkg('js-tiktoken'),
  ...pkg('dependency-cruiser'),
];

/** Persistence: Drizzle + the schema/client modules. */
const PERSISTENCE = [...pkg('drizzle-orm'), ...pkg('postgres'), '^src/db/'];

module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- cycles
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependency. In an onion, edges point inward only, so a cycle ' +
        'always means a layer boundary was crossed in both directions. The known ' +
        'platform/container.ts -> modules/* -> platform/* cycle is deliberate ' +
        '(composition root) and lives in the baseline.',
      from: {},
      to: { circular: true },
    },

    // -------------------------------------------- ring 1: domain core purity
    {
      name: 'core-purity',
      severity: 'error',
      comment:
        'reviewer-core is the pure domain core: prompt assembly, grounding, ' +
        'structured output, reduce. Its only permitted dependencies are openai, ' +
        'zod, node builtins, and the canonical @devdigest/shared contracts (Finding, ' +
        'Review, UnifiedDiff, ChatMessage, ...) it resolves to src/vendor/shared/. ' +
        'It must never learn about HTTP, SQL, Fastify, Drizzle, or any other server ' +
        'concern -- those are ruled out explicitly below, not by a narrow allowlist, ' +
        'so a new server dependency cannot slip in unnoticed.',
      from: { path: '^(\\.\\./)?reviewer-core/src/' },
      to: {
        path: PERSISTENCE.concat([
          '^fastify$', '^fastify/', '^@fastify/', '^fastify-sse-v2$', '^fastify-type-provider-zod$',
          '^src/adapters/', '^src/modules/', '^src/platform/',
        ]),
      },
    },
    {
      name: 'core-no-server-except-shared',
      severity: 'error',
      comment:
        'reviewer-core may depend on src/vendor/shared/ (the canonical contracts ' +
        'package, documented as shared across every package) and nothing else under ' +
        'src/. Any other src/ edge would couple CI (which runs reviewer-core via npm, ' +
        'not pnpm) to the API package.',
      from: { path: '^(\\.\\./)?reviewer-core/src/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },

    // ------------------------------------------------- ring 2: ports purity
    {
      name: 'ports-purity',
      severity: 'error',
      comment:
        'src/vendor/shared/** is the canonical port + contract layer (LLMProvider, ' +
        'Embedder, GitHubClient, GitClient, CodeIndex, AuthProvider, SecretsProvider ' +
        'and the Zod contracts). It may depend on zod and itself, nothing else. ' +
        'A Db or FastifyInstance type leaking in here would poison every ring.',
      from: { path: '^src/vendor/shared/' },
      to: {
        pathNot: ['^src/vendor/shared/', ...pkg('zod')],
        dependencyTypesNot: ['core'],
      },
    },

    // ------------------------------------------- persistence containment
    {
      name: 'no-sql-outside-repository',
      severity: 'error',
      comment:
        'SQL lives in exactly one place. drizzle-orm, postgres, and src/db/** are ' +
        'reachable only from src/db/**, a module repository.ts, a module ' +
        'repository/*.repo.ts, and the composition roots. A service or routes file ' +
        'that queries directly has collapsed two rings into one. See ' +
        '.claude/skills/onion-architecture/reference/anti-patterns.md.',
      from: {
        pathNot: [
          '^src/db/',
          '^src/modules/[^/]+/repository\\.ts$',
          '^src/modules/[^/]+/repository/[^/]+\\.repo\\.ts$',
          ...COMPOSITION_ROOT,
        ],
      },
      to: { path: PERSISTENCE },
    },

    // ------------------------------------------------ transport containment
    {
      name: 'no-fastify-outside-transport',
      severity: 'error',
      comment:
        'Fastify is a transport detail. Permitted in routes.ts, the module registry, ' +
        'modules/_shared (request-context plumbing), src/platform/**, and the ' +
        'composition roots. With tsPreCompilationDeps on, the type-only ' +
        '`import type { FastifyInstance }` in every routes.ts IS visible here -- ' +
        'that is legitimate and covered by the routes.ts allowance.',
      from: { pathNot: FASTIFY_ALLOWED_FROM },
      to: {
        path: ['^fastify$', '^fastify/', '^@fastify/', '^fastify-sse-v2$', '^fastify-type-provider-zod$'],
      },
    },

    // --------------------------------------------- vendor SDK containment
    {
      name: 'vendor-sdk-only-in-adapters',
      severity: 'error',
      comment:
        'Third-party SDKs (octokit, openai, @anthropic-ai/sdk, simple-git, ' +
        '@ast-grep/napi, @vscode/ripgrep, js-tiktoken, dependency-cruiser) are ' +
        'driven-adapter implementation details. Only src/adapters/** may import ' +
        'them directly; everyone else goes through the port in ' +
        'src/vendor/shared/adapters.ts. reviewer-core is exempt from this rule for ' +
        'its own openai dependency -- it is the domain core, not a driven adapter, ' +
        'and has no container to resolve one through.',
      from: { pathNot: ['^src/adapters/', '^src/vendor/shared/', '^(\\.\\./)?reviewer-core/src/'] },
      to: { path: VENDOR_SDKS },
    },

    // ------------------------------ services depend on ports, not adapters
    {
      name: 'modules-no-concrete-adapters',
      severity: 'error',
      comment:
        'A module must depend on the PORT (src/vendor/shared/adapters.ts) and ' +
        'receive the implementation from the container -- never import a concrete ' +
        'adapter. Importing src/adapters/** directly hard-wires the module to one ' +
        'implementation and makes it untestable without that SDK.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },

    // ----------------------------------------------- module encapsulation
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        'Feature modules are siblings, not a hierarchy. modules/<a> must not import ' +
        'modules/<b>; share via src/vendor/shared (contracts), src/platform ' +
        '(cross-cutting), or modules/_shared. The $1 back-reference makes this one ' +
        'rule cover every present and future module pair.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'no-module-registry-import',
      severity: 'error',
      comment:
        'src/modules/index.ts is the registry consumed by app.ts. A module ' +
        'importing it would depend on its own siblings transitively and create a ' +
        'cycle through the registry.',
      from: { path: '^src/modules/', pathNot: '^src/modules/index\\.ts$' },
      to: { path: '^src/modules/index\\.ts$' },
    },

    // --------------------------------------- intra-module tier ordering
    {
      name: 'repository-is-a-leaf',
      severity: 'error',
      comment:
        'A repository is the innermost tier of a module: SQL and nothing else. It ' +
        'must not call back up into its own service or routes.',
      from: {
        path: ['^src/modules/[^/]+/repository\\.ts$', '^src/modules/[^/]+/repository/'],
      },
      to: { path: ['^src/modules/[^/]+/service\\.ts$', '^src/modules/[^/]+/routes\\.ts$'] },
    },
    {
      name: 'no-service-imports-routes',
      severity: 'error',
      comment:
        "Business logic must not depend on transport. A service importing routes.ts " +
        "inverts the module's dependency direction. A module's own index.ts barrel " +
        're-exporting its own routes.ts (e.g. repo-intel/index.ts) is not this -- ' +
        'the barrel is not a service, so it is exempted alongside the registry.',
      from: {
        pathNot: ['^src/modules/index\\.ts$', '^src/modules/[^/]+/index\\.ts$', ...COMPOSITION_ROOT],
      },
      to: { path: '^src/modules/[^/]+/routes\\.ts$' },
    },
    {
      name: 'helpers-and-constants-are-pure',
      severity: 'error',
      comment:
        'helpers.ts is pure functions and constants.ts is literals. Neither may ' +
        'touch persistence, transport, adapters, or a repository -- if it needs I/O ' +
        'it belongs in the service.',
      from: { path: '^src/modules/[^/]+/(helpers|constants)\\.ts$' },
      to: {
        path: [
          ...PERSISTENCE,
          '^fastify',
          '^@fastify/',
          '^src/adapters/',
          '^src/modules/[^/]+/repository',
        ],
      },
    },

    // ----------------------------------------- inward-pointing platform/db
    {
      name: 'platform-no-modules',
      severity: 'error',
      comment:
        'src/platform/** is cross-cutting infrastructure and sits outside the ' +
        'feature modules; depending on a module inverts the onion. The one ' +
        'deliberate exception is platform/container.ts (composition root), which is ' +
        'excluded here and whose modules/* edges live in the baseline.',
      from: { path: '^src/platform/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'db-is-a-leaf',
      severity: 'error',
      comment:
        'src/db/** is the schema + client. It must not depend on modules, adapters, ' +
        'or platform -- everything depends on it, never the reverse. (seed*.ts and ' +
        'migrate.ts are standalone scripts and are exempted.)',
      from: { path: '^src/db/', pathNot: '^src/db/(seed|migrate).*\\.ts$' },
      to: { path: ['^src/modules/', '^src/adapters/', '^src/platform/'] },
    },

    // --------------------------------------------------------- hygiene
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Unreachable module -- dead code, or a file nobody wired up yet. Warn only: ' +
        'test/** is excluded from this cruise, so a file consumed only by tests ' +
        'looks orphaned here without actually being dead.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '^src/server\\.ts$', '(^|/)src/db/(seed|migrate)'] },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment:
        'Production source must not import a devDependency (tsx, vitest, drizzle-kit, ' +
        'testcontainers). Such an import breaks `pnpm start` from dist/.',
      from: { path: '^src/', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        'dependency-cruiser could not resolve this import. Usually a bad path alias ' +
        'or a missing .js extension -- and it silently blinds every other rule, so ' +
        'it is an error.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    // tsconfig gives us compilerOptions.paths. With moduleResolution "Bundler"
    // and NO baseUrl, TS resolves paths values relative to the tsconfig's own
    // directory -- dependency-cruiser replicates that, so the cross-package
    // alias @devdigest/reviewer-core -> ../reviewer-core/src/index.ts resolves
    // to raw source with no enhancedResolveOptions.alias needed.
    tsConfig: { fileName: 'tsconfig.json' },

    // *** REQUIRED. DO NOT SET TO FALSE. ***
    // TypeScript elides imports used only in type position. Without this flag
    // `import type { Db }`, `import type { Container }` and the
    // `import type { FastifyInstance }` in every routes.ts are INVISIBLE to the
    // cruise -- so the persistence and transport rules would report a clean pass
    // while proving nothing. Type-only coupling is still architectural coupling.
    // See .claude/skills/onion-architecture/reference/enforcement.md.
    tsPreCompilationDeps: true,

    // clones/ is a full, gitignored copy of this repo. Without excluding it,
    // every rule double-reports. test/** is outside tsconfig `include` (no path
    // resolution) and legitimately crosses rings.
    //
    // Deliberately does NOT exclude node_modules: exclude removes the edge
    // from the graph entirely, before any `forbidden` rule ever sees it. The
    // vendor-SDK and persistence rules match on the edge INTO node_modules
    // (e.g. a service importing `drizzle-orm`) -- excluding node_modules here
    // would silently blind every one of those rules to their own target.
    // `doNotFollow` below is the correct tool for "don't crawl node_modules'
    // internals" without deleting the edge itself.
    exclude: {
      path: '(^|/)clones/|(^|/)dist/|\\.test\\.ts$|(^|/)src/db/migrations/',
    },

    // Record edges INTO packages so the vendor-SDK and persistence rules can
    // match on them, but do not crawl their internals -- essential for
    // runtime with tsPreCompilationDeps.
    doNotFollow: { path: '(^|/)node_modules/' },

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      // Resolve the ESM `./service.js` convention back to service.ts.
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },

    combinedDependencies: false,
    progress: { type: 'none' },
  },
};
