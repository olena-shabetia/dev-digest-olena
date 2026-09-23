# API contract gate

Flag a route handler or exported function whose signature or contract
changed in a way that would break an existing caller not touched by this
diff.

## What to check
- **HTTP route shape**: method, path, path/query param names or types,
  request body schema, or response status/shape changed on an existing route
  — check whether every caller of that route (client code, another service,
  a test) in the visible codebase was updated in the same diff.
- **Exported function signatures**: a parameter added without a default,
  removed, reordered, or retyped; a return type narrowed, widened, or
  changed shape (e.g. an object gaining/losing a required key, an array
  becoming paginated) — for any function exported from a module other tests
  or modules import.
- **Nullability changes**: a field that was always present becoming
  optional/nullable (breaks callers that don't null-check), or a
  previously-nullable field now assumed non-null (breaks callers that do).
- **Status code / error shape changes**: a route that used to return 200 now
  returning 204/404 for the same input, or an error envelope changing shape.
- **Silent behavioral contract changes**: pagination defaults, sort order,
  or filtering semantics changing without a version bump or a corresponding
  update to every call site.

## How to report
- Cite the exact file:line of the changed signature/route, name the old vs.
  new shape, and point to the specific caller (file:line) in the diff or the
  visible codebase that was NOT updated and would break.
- If every caller was updated in the same diff, this is not a finding —
  the gate exists for callers left behind, not for signature changes in
  general.
- Severity: CRITICAL when a caller left un-updated in the visible code would
  throw, silently receive wrong data, or crash at runtime; WARNING when the
  break is plausible but no concrete un-updated caller is visible in this
  diff (e.g. an external consumer you can't see).