/**
 * L05 — project-context reader barrel. Cross-cutting infrastructure: takes
 * `GitClient` as an argument, never imports `Container`, never imports
 * `src/modules/**` (rule `platform-no-modules`).
 */
export * from './constants.js';
export * from './paths.js';
export * from './discover.js';
export * from './read-at-ref.js';
