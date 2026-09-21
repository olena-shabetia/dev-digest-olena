# Sources

## Foundational

- Jeffrey Palermo, *The Onion Architecture* — [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) · [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) · [part 4, after four years](http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/) — the origin of the pattern and its name. Core claim: *inner layers define interfaces, outer layers implement them*; all coupling points toward the center.
- [Herberto Graça — Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) — situates Onion against Hexagonal (Ports & Adapters) and Clean Architecture; useful for recognizing they're the same dependency rule under different vocabularies.
- [Methods & Tools — Chop Onions Instead of Layers](https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php) — argues for organizing by vertical slice (feature) rather than horizontal layer across the whole app, which matches this repo's `modules/<name>/` shape more closely than a strict Palermo layer-per-folder reading would.

## Node.js / TypeScript adaptations

- [Khalil Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) — ports as TypeScript interfaces, adapters as implementing classes, DI wiring at the composition root. Also states explicitly: *"if you're writing a quick Node.js script… don't spend too much time trying to make your code SOLID"* — the over-abstraction warning this skill takes seriously (see the counterpoint below).
- [Remo Jansen — Enforce Clean Architecture in Your TypeScript Projects with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)
- [Wolk Software — Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs) — read this *against* our choice: it reaches for an InversifyJS DI container. This repo deliberately does not — `platform/container.ts` is a hand-written composition root, and Fastify's own plugin/decorator encapsulation already provides the scoping a DI framework would add.
- [Melzar/onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate) — a runnable Express/TypeScript reference structure.

## Stack-specific (Fastify 5, Drizzle 0.38, Zod 3)

- [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) — Fastify **5** + clean architecture + DDD + CQRS, the closest match to this repo's Fastify version among public examples.
- [Fastify — Plugins reference](https://fastify.dev/docs/latest/Reference/Plugins/) — `fastify.register` creates an encapsulation scope; this *is* the composition mechanism this repo relies on instead of a separate DI framework.
- [sujeet-agrahari/node-fastify-architecture](https://github.com/sujeet-agrahari/node-fastify-architecture) — modular folder structure for Fastify APIs.
- [Sentry Engineering — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — transaction-scoped repository methods; relevant because Drizzle has no ambient session/unit-of-work the way a heavier ORM might, so a `tx` parameter has to be threaded explicitly through repository methods that need to share a transaction.
- [Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Microsoft Learn — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) — framework-agnostic but the clearest statement of "repository returns domain types, not database rows" — the rule `modules/reviews/repository.ts:19` currently violates (see `anti-patterns.md`).
- [Cosmic Python — The Repository Pattern](https://www.cosmicpython.com/book/chapter_02_repository) — free online chapter; the canonical worked example of repository-as-collection-of-domain-objects.

## Counterpoint — read this before treating repositories as dogma

- [You might not need… the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b) — argues that with a typed query builder (which Drizzle is — closer to SQL than a full ORM), a pass-through repository can be pure ceremony with no abstraction benefit. This skill still mandates a `repository.ts` per module, but for a *specific, checkable* reason that survives this critique: every domain query in this codebase must be scoped by `workspace_id` (`server/AGENTS.md`), and a repository is the one place that invariant can be verified in a single file. If your repository method is a bare pass-through with no scoping or query-composition value, that's a signal worth noticing, not a reason to skip the module boundary.

## Enforcement tooling

- [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) — the `forbidden` rule schema, `path`/`pathNot`/`circular`/`couldNotResolve`, `$1` capture-group back-references for cross-module rules, and `--ignore-known` baselining. This is what `server/.dependency-cruiser.cjs` is built on.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) / [jsboundaries.dev](https://www.jsboundaries.dev/docs/overview/) — the alternative considered and **rejected** for this repo. Two reasons: there is no ESLint configuration anywhere in this codebase, so adopting it would mean standing up an entire new toolchain just for boundary rules; and `dependency-cruiser` was already an installed dependency doing equivalent work for repo-intel. If this repo ever adopts ESLint for other reasons, revisit this choice — but note v6 of this plugin collapsed the older four rules (`element-types`, `no-private`, etc.) into a single `boundaries/dependencies` policy API, so most existing tutorials for it are stale.
