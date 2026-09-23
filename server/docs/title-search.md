# PR list title search (`q=`)

`GET /repos/:id/pulls` will accept an optional `q=` query parameter for
case-insensitive title filtering, backed by `matchesTitleQuery` in
`server/src/modules/reviews/helpers.ts`.

Not wired into the route yet — see `server/.env.example`'s
`PR_TITLE_SEARCH_MAX_LEN` for the query-length limit this needs before it can
be exposed publicly.
