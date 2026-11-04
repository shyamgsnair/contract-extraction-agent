# Contract Extraction Agent

A proof of concept that reads vendor contracts (PDF), pulls out the key commercial terms with Claude, checks every answer against the document in code, and saves the results for a person to review in a web app.

You upload a contract. Claude reads it and returns 11 fields (parties, dates, renewal, price list, price escalation, payment terms, minimum commitment and purchase-order acceptance), each with a verbatim quote and page number. Code then checks that every quote really appears on the cited page and that the business rules hold. Anything that fails goes back to Claude to fix, up to 3 times, and anything still failing is flagged. A reviewer sees the PDF beside the fields, clicks a value to jump to its highlighted quote, and approves or corrects it.

> **Status:** a personal proof of concept, not production software. The test contracts are public SEC EDGAR exhibits; redacted prices in them were replaced with synthetic values (see [`packages/agent/test-data/sources.md`](packages/agent/test-data/sources.md)). Nothing here is legal or financial advice.

## Features

- **Upload** with drag-and-drop. Scanned, password-protected and non-PDF files are rejected before anything is sent to Claude. Duplicates are detected by file hash.
- **Extraction with evidence.** Every field has `value`, `quote`, `page` and `confidence`; each price-list row has its own. If the contract is silent, the value is `null`, never a guess.
- **Verification in code, not by the model.** Each quote is matched on its cited page (with whitespace, quotes and dashes normalized), and rules are enforced: expiration after effective date, customer ≠ vendor, positive prices with a currency.
- **Contract table**: filter, sort and choose columns. Click a value to open the PDF at its highlighted quote.
- **Review screen**: PDF beside the fields; approve, correct or approve all. Corrections are stored beside the extracted value, never over it.
- **Claude log** per run: every input sent to Claude, its outputs and tool calls, the verification results, and tokens, cost and time per round. It updates live while a run is going.
- **Accuracy scoring** against hand-labeled answer keys, with a go/no-go verdict.

## How it works

```
PDF ─► intake checks ─► Claude reads the PDF ─► structured result ─► verification in code
                                ▲                                         │
                                └────── failed checks (up to 3 rounds) ◄──┘
                                                                          ▼
                                          Supabase (Postgres + Storage) ─► web app review
```

The extraction agent (`packages/agent`) is a standalone TypeScript package with one entry point, `extractContract(pdfBytes, options)`. It has no database or web dependencies: the CLI and the web app call it and save the results themselves.

It has two interchangeable **engines**:

| Engine | How it calls Claude | Cost |
| --- | --- | --- |
| `claude-code` (default) | Runs [Claude Code](https://claude.com/claude-code) headless (`claude -p`) on your own Claude subscription | Included in your Claude Pro or Max plan; no API billing |
| `api` | Anthropic API through `@anthropic-ai/sdk` | Billed per token to your API account |

The web app only ever uses `claude-code`. The `api` engine is opt-in from the CLI and needs an explicit `--confirm-paid` flag. As a safety measure, the `claude-code` engine removes `ANTHROPIC_API_KEY` (and similar variables) from Claude Code's environment and refuses to run unless Claude Code is logged in with a subscription, so it can't bill an API account by accident.

## Repository layout

```
packages/agent/        extraction agent: intake, engines, prompt, verification, CLI, scoring
  src/fields.ts        the 11-field Zod schema: drives the AI output schema, validation and UI
  test-data/           test contracts, answer keys (labels/), sources, results (output/)
packages/db/           Drizzle schema, SQL migrations, save helpers, Supabase Storage client
apps/web/              Next.js web app: login, upload, contract table, review screen, Claude log
```

**Stack:** TypeScript, pnpm workspace, Next.js 16 (App Router), Tailwind CSS, shadcn/ui, Zod, Drizzle ORM, Supabase (Postgres, Storage, Auth), `unpdf`, `react-pdf`, TanStack Table.

## Prerequisites

- **macOS or Linux** (developed on macOS)
- **Node.js 24 or later.** Node runs the `.ts` scripts directly.
- **pnpm 12.** Run `corepack enable` and the repo's pinned version is used automatically.
- **Claude Code**, logged in with a **Claude Pro or Max subscription** (for the free `claude-code` engine). Install it with the instructions at [claude.com/claude-code](https://claude.com/claude-code), then run `claude auth login`. Check with `claude auth status`: the `authMethod` must be `claude.ai`.
- **A Supabase project.** The free tier is enough.
- *Optional:* an Anthropic API key, only if you want to try the paid `api` engine.

## Setup

### 1. Fork, clone and install

```sh
git clone https://github.com/<you>/contract-extraction-agent.git
cd contract-extraction-agent
corepack enable
pnpm install
```

### 2. Create a Supabase project

At [supabase.com](https://supabase.com), create a project, then collect:

| Value | Where to find it |
| --- | --- |
| `DATABASE_URL` | **Connect** → Connection string → **Session pooler** URI (fill in your database password) |
| `SUPABASE_URL` | **Project Settings → Data API**, "Project URL" (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | **Project Settings → API Keys**, publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Same page, secret key (`sb_secret_…`). It bypasses all access rules: keep it server-side |

### 3. Configure `.env`

```sh
cp .env.example .env
```

Fill in the values from step 2. `.env` is git-ignored; never commit it. Leave `ANTHROPIC_API_KEY` as the placeholder unless you plan to use the paid engine.

### 4. Create the database tables

```sh
pnpm --filter @cea/db migrate   # applies the SQL migrations in packages/db/drizzle
pnpm db:check                   # confirms the connection
```

This creates five tables (`documents`, `extraction_runs`, `contracts`, `extracted_fields`, `run_log_entries`), all with row-level security on and no policies (see [Security](#security)). The private Storage bucket `contracts` is created automatically on the first upload.

### 5. Create a reviewer login

The app has no public sign-up. In the Supabase dashboard:

1. **Authentication → Sign In / Providers**: make sure **Email** is enabled, and turn off **Allow new users to sign up**.
2. **Authentication → Users → Add user → Create new user**: enter an email and password, and tick **Auto Confirm User**.

### 6. Make sure `claude` is on your PATH

The web app starts `claude` to run extractions, so it must be found from the shell you start the app in:

```sh
claude auth status    # should print "authMethod": "claude.ai"
```

If it isn't on your PATH, set `CLAUDE_BIN=/full/path/to/claude` in `.env`.

### 7. Run the web app

```sh
pnpm dev
```

Open **http://localhost:3001** (port 3001, so it doesn't clash with other apps on 3000), sign in with the user from step 5, go to **Upload** and drop in a contract. Sample contracts are in `packages/agent/test-data/contracts/` and `packages/agent/test-data/extra-contracts/`. Extraction typically takes 20 to 60 seconds; the status updates on its own, and **Log** shows the conversation with Claude live.

## Using the app

- **Contracts** (home page): one row per contract. Filter by vendor, document type, expiry date, auto-renewal, payment terms or review status; sort by any column; choose columns with **Columns**. Click a value to open the PDF at its quote, or elsewhere on the row to open the contract.
- **Review screen**: click a field to highlight its quote in the PDF. **Approve** or **Correct** each field, or **Approve all**. Fields that failed verification are marked. **Claude log** in the header opens that run's log.
- **Upload**: recent uploads with their status. **Log** opens a run's log and **Review** opens the result.
- **Claude log**: blue entries are inputs sent to Claude (system instructions, prompt, repair messages); orange entries are Claude's outputs (text and the structured result as a table); grey entries are tool calls; green or red entries are our verification checks. **Raw JSON** shows exactly what was sent or returned.

Extraction runs in the background of the local server. If you stop the server mid-run, that run is shown as "stalled" after 20 minutes; delete the document (see [Commands](#commands)) and upload it again.

## Developer tools (CLI)

The CLI is for testing extraction on the sample contracts; users upload through the web app.

```sh
# Extract one test contract, or all of them; results go to packages/agent/test-data/output/
pnpm --filter @cea/agent extract trilogy-flex.pdf
pnpm --filter @cea/agent extract --all

# Also save to Supabase (skips files already saved; --force re-extracts)
pnpm --filter @cea/agent extract --all --save

# Score the results against the answer keys in test-data/labels/
pnpm --filter @cea/agent score
```

The score report is written to `test-data/output/accuracy-claude-code.md`. Exact fields (dates, numbers, enums, names, prices) are compared automatically. Free-text fields (price escalation, minimum commitment) need a human judgment: the report lists them, and you record each one in `test-data/judgments.json` as `{ "<contract>": { "<field>": { "got": <value>, "correct": true } } }`.

**Paid engine:** `pnpm --filter @cea/agent extract trilogy-flex.pdf --engine api --confirm-paid` uses `ANTHROPIC_API_KEY` and is billed to your API account. Set a spend limit in the Anthropic Console first.

## Commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the web app on http://localhost:3001 |
| `pnpm typecheck` | Type-check every package |
| `pnpm db:check` | Check the database connection |
| `pnpm db:summary` | Show what is saved: counts, contracts, runs, evidence, RLS status |
| `pnpm --filter @cea/db generate` | Create a new SQL migration after changing `packages/db/src/schema.ts` |
| `pnpm --filter @cea/db migrate` | Apply migrations |
| `pnpm --filter @cea/db delete-document <file name>` | Delete an uploaded document, its runs, fields and stored PDF (dev only) |
| `pnpm --filter @cea/agent check-intake` | Check that the test contracts pass intake and the bad fixtures are rejected |
| `pnpm --filter @cea/agent check-labels` | Validate the answer keys against the schema |
| `pnpm --filter @cea/agent extract …` | Run extraction (see above) |
| `pnpm --filter @cea/agent score` | Score results against the answer keys |

## Configuration

All settings are environment variables in the root `.env` (see [`.env.example`](.env.example)).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | CLI `--save`, web app | Supabase session pooler URI |
| `SUPABASE_URL` | CLI `--save`, web app | Project URL; a trailing `/rest/v1/` is ignored |
| `SUPABASE_SECRET_KEY` | CLI `--save`, web app | Server-side only |
| `SUPABASE_PUBLISHABLE_KEY` | Web app login | |
| `ANTHROPIC_API_KEY` | `api` engine only | Never used by `claude-code` |
| `CLAUDE_BIN` | Optional | Path to `claude` if it isn't on the PATH |

Extraction defaults (model `claude-sonnet-5-5`, effort `medium`, 3 repair rounds) are in `DEFAULTS` in [`packages/agent/src/extract.ts`](packages/agent/src/extract.ts) and can be overridden through `extractContract`'s options.

## Adapting it

- **Change the fields:** edit the Zod schema in [`packages/agent/src/fields.ts`](packages/agent/src/fields.ts). The field descriptions there become Claude's field guide, and the schema drives Claude's output format and validation. Then update the database columns in `packages/db/src/schema.ts` (and generate a migration), the display info in `apps/web/lib/field-format.ts`, and the answer keys in `test-data/labels/`.
- **Change the instructions:** edit [`packages/agent/src/prompt.ts`](packages/agent/src/prompt.ts) and bump `PROMPT_VERSION`, so every run records which prompt produced it. Re-run `extract --all` and `score` to compare.
- **Use your own test contracts:** add PDFs to `test-data/contracts/` and a matching answer key to `test-data/labels/` (copy an existing one), then run `check-labels`. Use public or synthetic contracts only.

## Security

- Secrets live only in `.env`, which is git-ignored.
- Only server code touches the database (a direct Postgres connection) and Storage (the secret key), and always after checking the signed-in session. The browser never gets database access or the secret key.
- Row-level security is on for every table with **no policies**, which keeps Supabase's public Data API closed. If you add browser-side Supabase queries, you'll need to add policies first.
- PDFs are stored in a private bucket and opened through short-lived signed links.
- Contract text is sent to Claude (through Claude Code or the API) for extraction, and the Claude log stores prompts, answers and short tool-output excerpts in your database.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Claude Code not found at "claude"` | Put `claude` on the PATH of the shell running `pnpm dev`, or set `CLAUDE_BIN` in `.env` |
| `must use your Claude subscription, but Claude Code reports auth method …` | Run `claude auth login` and sign in with your Claude account |
| "Invalid path specified in request URL" from Storage | Check `SUPABASE_URL` and `SUPABASE_SECRET_KEY` |
| Can't sign in | Check that the user exists, is confirmed, and that Email sign-in is enabled (setup step 5) |
| A run shows "Stalled" | The server was stopped mid-run. Delete the document and upload it again |
| The browser tab shows an old icon (Safari) | Safari caches icons: try a private window, or Settings → Privacy → Manage Website Data → remove `localhost` |

## Limitations

- **Digital PDFs only.** Scanned contracts (no text layer) are rejected rather than read with OCR.
- **Small test set.** Five labeled contracts (plus seven unlabeled extras), so accuracy figures are indicative, not statistically solid. The answer keys were drafted with Claude's help and then reviewed, which can bias the scores upwards.
- **Local by default.** The free engine needs Claude Code on the machine running the server, so a public deploy (for example on Vercel) would need the paid `api` engine.
- **No background job queue.** Extractions run in the web server's process; a restart interrupts them.
