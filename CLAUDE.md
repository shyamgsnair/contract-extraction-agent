# Contract Extraction Agent

A proof of concept that reads vendor contracts (PDF), extracts key data points with Claude, verifies each one against the document, and saves the results to a database for human review.

This is a personal side project, not client work. Use only public or synthetic contracts as test data (for example, SEC EDGAR exhibits).

## Working rules (follow these every session)

1. **Confirm before building.** Before writing or changing code, present a short plan of what you will do and wait for my approval. Never start a new phase without my explicit go-ahead.
2. **One phase at a time.** Work only on the current phase (see "Current status" below). Do not build ahead.
3. **Keep it simple.** This is a PoC. Prefer the simplest approach that works, and no extra libraries without asking.
4. **Explain decisions in plain terms.** I'm an ex-Java developer with strong finance domain knowledge. Comparisons to Java concepts are helpful.
5. **Never commit secrets.** API keys and database URLs live only in `.env` files, which must be in `.gitignore`. Keep `.env.example` up to date with placeholder values.
6. **End each phase cleanly.** Code type-checks, the phase's "done when" check passes, and you summarize what changed so I can commit.

## Stack (decided, do not change without asking)

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere |
| Repo | pnpm workspace: `packages/agent` (extraction agent), `packages/db` (Drizzle schema, migrations and client, shared by the CLI and web app) and `apps/web` (Next.js app, created in Phase 4) |
| Front end | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Extraction agent | Standalone, reusable TypeScript package (`packages/agent`) using the Anthropic TypeScript SDK (`@anthropic-ai/sdk`). Exposes one entry point, `extractContract`, that the CLI, web app and background job all call |
| AI model | Claude Sonnet 5.5 (`claude-sonnet-5-5`), set through config so it can be changed |
| Schema and validation | Zod. The field list is defined once and drives the AI tool schema, validation and UI types |
| Database | Supabase Postgres |
| Database access | Drizzle ORM, with SQL migrations kept in the repo |
| File storage and login | Supabase Storage (original PDFs) and Supabase Auth (reviewers) |
| PDF text | `unpdf` for page-by-page text |
| Later phases | Inngest for background jobs, Vercel for hosting (confirm when we get there) |

## Scope rules

- **Input is digital PDFs only.** Reject scanned PDFs (pages with almost no extractable text), password-protected PDFs, Word files and images at intake, with a clear message. Don't send rejected files to Claude.
- **Contract types:** vendor master agreements (MSAs), statements of work (SOWs), amendments and order forms.
- **Users upload contracts only through the web app** (Phase 4: upload page with drag-and-drop and a processing status). The command-line tool from Phases 2 and 3 is a developer tool for testing extraction on sample contracts, not a user feature.

## How extraction must work

- Send the PDF to Claude directly, which reads both page images and text. Use `unpdf` page text only for verification and for the agent's internal search and page tools (these help Claude find exact wording; they are not a user-facing search).
- Every extracted field returns: `value`, `quote` (verbatim text from the contract), `page`, and `confidence` (high, medium or low).
- **No guessing.** If the contract doesn't state something, `value` must be `null`.
- **Verification is done in code, not by the model.**
  - Each quote must appear in the PDF text on the cited page. Normalize whitespace, quotes and dashes before comparing.
  - Business rules must hold, for example: expiration date after effective date, term length matching the dates, no renewal term when auto-renewal is false, customer and vendor not the same party.
- Failed checks go back to Claude to fix, for up to 3 rounds. Anything still failing is flagged for human review, never silently accepted.
- Record the model, prompt version, token cost and duration for every run.

## Reusable agent

- `packages/agent` exposes a single entry point: `extractContract(pdf, options)` returns the extracted fields, verification results and run metadata (model, prompt version, tokens, cost, duration).
- It has no database, web or job-queue dependencies. It takes PDF bytes and config (API key, model, prompt version) and returns data. Saving to Supabase is the caller's job.
- The CLI (Phases 2–3), web app (Phase 4) and Inngest job (Phase 5) are thin callers of this function.
- The Zod field schema lives in its own module, separate from the agent logic, so other document types could be supported later.

## Contract table and source viewer (Phase 4)

- The main screen is a table of contracts: one row per contract, extracted fields as columns.
- Filter by field (for example vendor, document type, expiring before a date, auto-renews yes/no, payment terms above N days, review status) and sort by any column. Let the user choose which columns to show.
- Clicking a specific value opens the PDF source viewer at that field's page with its source quote highlighted. Clicking elsewhere on the row opens the contract with all its fields.
- The PDF source viewer is one shared component, used by both this table and the review screen.
- No keyword or full-text search in the PoC. Use the `quote` and `page` stored on each extracted field for highlighting.

## Draft field list (to be finalized in Phase 1)

Document type, title, parent agreement (for amendments and SOWs), customer name, vendor name, effective date, expiration date, initial term (months), auto-renews, renewal term (months), non-renewal notice (days), termination for convenience, termination notice (days), payment terms (days), currency, total contract value, price escalation, liability cap, governing law.

## Phases

| Phase | What gets built | Done when |
| --- | --- | --- |
| 0. Setup | pnpm workspace, shared TypeScript config, `.env.example`, Drizzle connected to Supabase | Repo installs cleanly and Drizzle connects to Supabase |
| 1. Field list and test set | Final field list; 10 to 15 EDGAR vendor contracts; 5 hand-labeled as the answer key | Field list agreed and labeled test set in `packages/agent/test-data` |
| 2. Extraction agent | Intake checks, page text, Claude agent loop with search and page tools, verification, repair rounds, CLI that writes JSON, accuracy scoring script | Runs on all test contracts and reports per-field accuracy (go/no-go point) |
| 3. Save to Supabase | Drizzle tables `documents`, `contracts`, `extracted_fields`, `extraction_runs`; PDFs uploaded to Storage; `--save` CLI option; duplicate detection by file hash | CLI run fills the tables and they can be queried in Supabase |
| 4. Web app | Login, upload page (drag-and-drop, intake checks, processing status), contract table (filter and sort by extracted fields; click a value to open the PDF at its highlighted quote), review screen (PDF beside the fields, approve or correct) | A contract can be uploaded, found by its fields, traced to its source quote, and reviewed end to end in the browser |
| 5. Background jobs and deploy | Extraction as an Inngest job with status in the UI; deploy to Vercel | Runs from a public URL |
| 6. Demo extras (optional) | Renewal-deadline dashboard; contract price vs. invoice variance view; optionally wrap the agent as a Claude Agent Skill or MCP server | Demo-ready |

## Current status

- **Current phase:** Phase 1 (not started). Phase 0 done: workspace installs, type-checks and connects to Supabase.
- Update this line at the end of each phase.

## Commands

Run from the repo root. Secrets go in `.env` at the repo root (copy `.env.example`).

- Install: `pnpm install`
- Type-check: `pnpm typecheck`
- Check database connection: `pnpm db:check`
- Database migrations: `pnpm --filter @cea/db generate` (create SQL from the schema), then `pnpm --filter @cea/db migrate` (apply it)
- Run extraction: TBD (Phase 2)