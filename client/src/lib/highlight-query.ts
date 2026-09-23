/**
 * Wraps every occurrence of a search query in a PR title with `<mark>` for
 * highlighted rendering in the PR list once the upcoming `q=` filter ships
 * (see `server/docs/title-search.md`). Pure, side-effect-free.
 */
export function highlightQueryInTitle(title: string, query: string): string {
  if (!query) return title;
  return title.split(query).join(`<mark>${query}</mark>`);
}
