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
7. **No paid API calls without my OK.** Development runs only on the `claude-code` engine (my Pro plan). Never call the Anthropic API (`api` engine) without my explicit OK for that specific run.

## Stack (decided, do not change without asking)

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere |
| Repo | pnpm workspace: `packages/agent` (extraction agent), `packages/db` (Drizzle schema, migrations and client, shared by the CLI and web app) and `apps/web` (Next.js app, created in Phase 4) |
| Front end | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Extraction agent | Standalone, reusable TypeScript package (`packages/agent`). Exposes one entry point, `extractContract`, that the CLI, web app and background job all call. Two interchangeable engines: `claude-code` (Claude Code headless, `claude -p`, on the Pro plan; used for all development and the local web app, $0) and `api` (Anthropic TypeScript SDK `@anthropic-ai/sdk`; written but optional, run only if we choose a paid demo run or a public deploy) |
| Hosting | Local by default: the web app runs on my Mac (`localhost`) and calls the `claude-code` engine, so there is no API cost. A public deploy (Vercel) would need the `api` engine and is optional |
| AI model | Claude Sonnet 5.5 (`claude-sonnet-5-5`), set through config so it can be changed |
| Schema and validation | Zod. The field list is defined once and drives the AI tool schema, validation and UI types |
| Database | Supabase Postgres |
| Database access | Drizzle ORM, with SQL migrations kept in the repo |
| File storage and login | Supabase Storage (original PDFs) and Supabase Auth (reviewers) |
| PDF text | `unpdf` for page-by-page text |
| Later (to do list) | Inngest for background jobs (local dev server); Vercel only if we opt into a public deploy |

## Scope rules

- **Input is digital PDFs only.** Reject scanned PDFs (pages with almost no extractable text), password-protected PDFs, Word files and images at intake, with a clear message. Don't send rejected files to Claude.
- **Contract types:** supply and purchase agreements, vendor master agreements (MSAs), statements of work (SOWs), amendments and order forms. Pricing and purchase order terms matter most.
- **Test contracts** are SEC EDGAR exhibits. Where prices are redacted (`[***]`), they are replaced with realistic synthetic values before converting to PDF. Each file's EDGAR link and the fact that its prices are synthetic are recorded in `packages/agent/test-data/sources.md`.
- **Users upload contracts only through the web app** (Phase 4: upload page with drag-and-drop and a processing status). The command-line tool from Phases 2 and 3 is a developer tool for testing extraction on sample contracts, not a user feature.

## How extraction must work

- Send the PDF to Claude directly, which reads both page images and text. Use `unpdf` page text only for verification and for the agent's internal search and page tools (these help Claude find exact wording; they are not a user-facing search).
- Every extracted field returns: `value`, `quote` (verbatim text from the contract), `page`, and `confidence` (high, medium or low). For the price list, each row carries its own `quote`, `page` and `confidence`.
- **No guessing.** If the contract doesn't state something, `value` must be `null`.
- **Verification is done in code, not by the model.**
  - Each quote must appear in the PDF text on the cited page. Normalize whitespace, quotes and dashes before comparing.
  - Business rules must hold: expiration date after effective date, customer and vendor not the same party, every unit price positive with a currency, payment terms greater than 0 days.
- Failed checks go back to Claude to fix, for up to 3 rounds. Anything still failing is flagged for human review, never silently accepted.
- Record the engine, model, prompt version, token cost and duration for every run. For `claude-code` runs the cost is the equivalent API cost reported by Claude Code (nothing is billed); for `api` runs it is the actual cost.

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

## Field list (agreed in Phase 1)

| # | Field | Type | Meaning |
| --- | --- | --- | --- |
| 1 | Document type | supply agreement / MSA / SOW / amendment / order form | The kind of contract |
| 2 | Customer name | text | Legal name of the buyer |
| 3 | Vendor name | text | Legal name of the seller |
| 4 | Effective date | date | When it starts. "On last signature" uses the signature date, at medium confidence |
| 5 | Expiration date | date | End of the initial term, only if a date is stated (otherwise null) |
| 6 | Auto-renews | yes / no | Renews without action by either party |
| 7 | Price list | rows of: item, unit price, currency (ISO code), unit of measure | The agreed prices; each row has its own quote and page |
| 8 | Price escalation | text | How and when prices can change, e.g. "CPI, capped at 3% a year" |
| 9 | Payment terms | days | Net days, e.g. 45 |
| 10 | Minimum commitment | text | Minimum order quantity or minimum annual spend |
| 11 | PO acceptance | days | Time the vendor has to accept or reject a purchase order, including any "deemed accepted" rule |

- `null` means the contract is silent. For text fields, `"None"` means the contract explicitly says there is none (for example "Customer shall have no minimum order commitments").
- Redacted terms (`[***]`) that were not replaced are `null`, with a note that they are redacted.
- Amendments fill only the fields they change; everything else is `null`.

## Phases

| Phase | What gets built | Done when |
| --- | --- | --- |
| 0. Setup | pnpm workspace, shared TypeScript config, `.env.example`, Drizzle connected to Supabase | Repo installs cleanly and Drizzle connects to Supabase |
| 1. Field list and test set | Final field list as a Zod schema; 5 EDGAR supply contracts (redacted prices replaced with synthetic values), all labeled as the answer key | Field list agreed and labeled test set in `packages/agent/test-data` |
| 2. Extraction agent | Intake checks, page text, `claude-code` and `api` engines, verification, repair rounds, CLI that writes JSON, accuracy scoring script. Optional: one approved `api` demo run | Runs on all test contracts and reports per-field accuracy (go/no-go point). Go if overall accuracy is at least 85%, no field is below 60%, and every quote is verified or flagged |
| 3. Save to Supabase | Drizzle tables `documents`, `contracts`, `extracted_fields`, `extraction_runs`; PDFs uploaded to Storage; `--save` CLI option; duplicate detection by file hash | CLI run fills the tables and they can be queried in Supabase |
| 4. Web app | Login, upload page (drag-and-drop, intake checks, processing status), contract table (filter and sort by extracted fields; click a value to open the PDF at its highlighted quote), review screen (PDF beside the fields, approve or correct) | A contract can be uploaded, found by its fields, traced to its source quote, and reviewed end to end in the browser |
| 5. Demo extras | Renewal-deadline dashboard; contract price vs. invoice variance view; optionally wrap the agent as a Claude Agent Skill or MCP server | Demo-ready |
| 6. Later | The items in "To do (later)" below, picked one at a time, each with its own plan and approval | Each item's own check |

## To do (later)

Deferred work. None of it is needed for the local PoC; pick items one at a time.

- [ ] **Background jobs with Inngest.** Move extraction from `after()` into an Inngest job on its local dev server. This adds retries, and runs that survive a server restart (today a restart leaves a run "stalled"). Status in the UI stays the same.
- [ ] **Public deploy to Vercel.** This needs the paid `api` engine, because Vercel can't use my Pro login. It also needs my explicit OK, since it costs money.
- [ ] **One paid `api` demo run (step 2d).** First a free `count_tokens` cost estimate and a spend cap in the Console, then the run with my explicit OK.
- [x] **Put `claude` on the PATH.** Done: `claude install` put it in `~/.local/bin`, which is added to the PATH in `~/.zshrc`.
- [ ] **Re-extract from the web app.** A button on the review screen, the same as `extract --force`, for a new prompt version.
- [ ] **Clean up stalled runs.** Mark runs left "running" by a server restart as failed, with a retry button.
- [ ] **Bigger test set.** More than 5 contracts, plus an amendment, an SOW and an order form, with answer keys labeled independently of Claude's drafts, so accuracy figures are less biased.
- [ ] **Tighter quote highlighting.** Highlight the exact words, not whole text lines, and handle quotes that run across a page break.
- [ ] **Look and feel polish**, building on the Debits & Deploy branding.

## Current status

- **Current phase:** Phase 5, demo extras (not started). Background jobs and the deploy moved to "To do (later)".
- Phase 4 done. The web app (`apps/web`, Next.js 16 with Cache Components) runs at `localhost:3001`. It has:
  - Supabase Auth email/password login; public sign-up is off, and accounts are created in the dashboard
  - the contract table, with filters, sort and column choice
  - the review screen, with the PDF beside the fields: click a field to highlight its quote; approve, correct or approve all; corrections are kept beside the extracted value
  - upload with drag-and-drop, intake checks and duplicate detection; extraction runs in the background through `after()` on the `claude-code` engine, with live status
  - Debits & Deploy branding

  Only server code touches the database and Storage, after checking the session, and PDFs open through signed links. So RLS stays on with **no policies**, which keeps Supabase's public API closed.
- Phase 3 done. There are four tables (`documents`, `extraction_runs`, `contracts`, `extracted_fields`), with row-level security on. PDFs are in the private Storage bucket `contracts`, named by SHA-256. `extract --save` skips duplicates without calling Claude. The 5 test contracts are saved.
- Phase 2 done: GO. With prompt v2 on the `claude-code` engine, overall accuracy is 96% (53 of 55 fields), the lowest field is 80%, and every quote was verified. The two misses (Arnet PO "deemed rejected", Trilogy price escalation) are borderline readings that vary between runs. v2 added requirements commitments to `minimumCommitment` after v1 missed SeraCare's 80% clause, so it was tuned on the test set. The `api` engine is written but has never been run; the paid demo run was skipped by choice. Reports are in `packages/agent/test-data/output/`.
- Phase 0 done: workspace installs, type-checks and connects to Supabase.
- Phase 1 done: 11-field Zod schema (`packages/agent/src/fields.ts`), 5 test contracts, 5 reviewed answer keys. Five contracts is a deliberate PoC choice; accuracy figures from them are indicative, not statistically solid.
- Update this line at the end of each phase.

## Commands

Run from the repo root. Secrets go in `.env` at the repo root (copy `.env.example`).

- Install: `pnpm install`
- Type-check: `pnpm typecheck`
- Check database connection: `pnpm db:check`
- Show what is saved (counts, contracts, runs, evidence, RLS): `pnpm db:summary`
- Delete an uploaded document and everything about it (dev only): `pnpm --filter @cea/db delete-document <file name>`
- Web app: `pnpm dev`, then open http://localhost:3001. This needs `SUPABASE_PUBLISHABLE_KEY` in `.env`, and `claude` on the PATH for uploads
- Database migrations: `pnpm --filter @cea/db generate` (create SQL from the schema), then `pnpm --filter @cea/db migrate` (apply it)
- Check answer-key labels: `pnpm --filter @cea/agent check-labels`
- Check intake (test contracts accepted, bad files rejected): `pnpm --filter @cea/agent check-intake`
- Run extraction (free, Pro plan): `pnpm --filter @cea/agent extract trilogy-flex.pdf` or `--all`. Results go to `packages/agent/test-data/output/`. Uses `claude` from the PATH (`~/.local/bin/claude`); `CLAUDE_BIN` in `.env` overrides it. Add `--save` to store the results in Supabase (this needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`), and `--force` to re-extract a file that's already saved
- Score results against the answer keys: `pnpm --filter @cea/agent score` (writes `test-data/output/accuracy-claude-code.md`; free-text judgements go in `test-data/judgments.json`)
- The paid `api` engine also needs `--engine api --confirm-paid`. Run it only with my explicit OK