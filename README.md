# SiteWise

**Quote on site. Manage it to completion.**

SiteWise is a multi-tenant SaaS for trade businesses (painting, plumbing,
electrical, waterproofing, and 15+ other trades). A business signs up and
gets its own branded version of the app: capture a job, inspect it, quote it
and hand over a branded PDF or WhatsApp message before leaving the site -
then, once the client accepts, track that job through to completion (budget,
expenses, staff wages, time, variations, site photos) without leaving the
same record. Everything autosaves, works with no signal, and syncs itself
once the connection comes back.

**Status:** live in beta at [sitewise.onrender.com](https://sitewise.onrender.com),
free while in beta, real users on real jobs. Hosted on Render's free tier for
now - see [Known limitations](#known-limitations--roadmap).

## What it actually does

**Quote flow** (the core loop, four steps): capture the job (client, site,
method chips) → write the inspection report → price it with photos and live
VAT totals → hand over a branded, numbered PDF or send it straight to
WhatsApp. No laptop, no retyping later - it's built to be finished before
you're back in the bakkie.

**Project Manager** (once a quote is accepted): one tap turns a job into a
tracked project. Status (Planned → In Progress → Completed), a total or
material/labour-split budget, expense and staff-wage logging with receipt
photos, approved variations for extra work that wasn't in the original
quote, site progress photos, and an optional time/rate tracker for trades
that bill by the hour. A single CSV export per project (or a portfolio-wide
one from the dashboard) hands all of it to an accountant in one file.

**Runs like a native app**: installable to a home screen on Android and iOS
(with the guided prompts each platform actually needs, since iOS has no
programmatic install API at all), and offline-first - see below.

## Offline-first

This is the part that actually matters for the target user: a tradie on a
job site with patchy or no signal. SiteWise is built so that doesn't stop
work:

- **Reads are cached.** Every job/project list and every individual job is
  cached in IndexedDB. Losing signal shows your last-known data instead of
  an error - or worse, silently starting a blank new job.
- **Writes are local-first.** Every edit is written to IndexedDB *before*
  a sync is even attempted, so it survives a reload, a closed tab, or lost
  signal - not just staying on the same page. A network failure during save
  is treated as a normal outcome ("saved on this device, will sync when back
  online"), not an error.
- **Sync is automatic and multi-triggered.** On the browser's `online`
  event, once on page load (catches "closed the tab offline, reopened
  online"), and a 30-second safety-net sweep for a connection that's
  technically online but still failing requests.
- **Auth survives being offline.** Losing signal used to log you out of the
  UI outright (a failed session check was treated as "not logged in"). Now
  only a genuine 401 does that - everything else falls back to the
  last-known signed-in user.
- **Conflict handling is record-level last-write-wins.** Deliberately not
  per-field merging: for a single tradie, the same job being edited from two
  devices in the same offline window is rare enough that the simpler model
  is worth it.
- **Photos degrade gracefully.** If an upload fails (offline or otherwise),
  the photo is embedded directly in the job so it's never lost - then
  silently migrated to real object storage server-side the next time that
  job saves successfully, so it doesn't permanently bloat the record.

## Tech stack

| Layer          | Choice                                    | Why |
|----------------|--------------------------------------------|-----|
| Backend        | Node.js + Express                          | Simple, no framework magic |
| Frontend       | Vanilla JS, no framework, no build step    | Every page is static HTML + plain `<script>` tags - open a file, read exactly what runs |
| Database       | Turso (libSQL), SQL over HTTP              | Serverless SQLite that still gives real indexes/queries |
| Photo storage  | Cloudflare R2 (S3-compatible)              | Object storage, not a SQL blob column |
| Email          | Resend                                     | Password-reset delivery |
| Hosting        | Render                                     | Free tier for now |
| Offline layer  | Hand-rolled IndexedDB wrapper (no library) | The operations needed are simple enough that a dependency wasn't worth it |
| PDF generation | jsPDF, lazy-loaded from a CDN              | Only fetched when a PDF is actually requested |

## Quick start

```bash
npm install
npm start          # or: npm run dev (auto-restart on file changes)
```

Open **http://localhost:3000**.

With **zero configuration**, local dev runs against a local SQLite file (auto-created
under `server/data/`) and an auto-generated JWT secret - enough to sign up,
build quotes, and use Project Manager. Photo uploads and password-reset
emails need real credentials (see below) to actually work; without them the
app degrades gracefully rather than crashing (uploads fail with a clear
error, reset requests "succeed" without sending an email).

Flow: **Landing → Create account → Onboarding (business setup) → Job
dashboard → Job card → (once accepted) Project Manager**

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | Production only | Auto-generated and persisted locally in dev |
| `TURSO_URL`, `TURSO_AUTH_TOKEN` | Production only | Falls back to a local SQLite file in dev |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Production only | Photo uploads/display fail without these, everything else still works |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Without it, password-reset requests succeed but no email sends |
| `APP_BASE_URL` | Recommended in production | Used to build absolute links in reset emails; defaults to `localhost` |
| `PORT` | Optional | Defaults to 3000 |

## Project structure

```
server/
  index.js                    Entry point
  app.js                      Composition root - security headers, compression,
                               /healthz, route wiring
  config.js                   Env var loading + validation (fails fast in
                               production if something required is missing)
  controllers/                HTTP layer: Auth, Profile, Job, Upload
  services/                   Business logic: AuthService, TokenService,
                               StorageService (R2), EmailService (Resend)
  repositories/                Persistence - every job/user query is scoped by
                               owner here, not in controllers (db.js holds the
                               schema + migrations)
  middleware/                 requireAuth guard, rate limiters, error handler
  routes/                     Route tables
  utils/                      Validators, ApiError, photo cleanup/signing/
                               migration helpers
  scripts/                    One-off migration scripts (JSON → SQLite, historical)

public/                       Frontend - static HTML, no build step
  index.html                  Marketing landing page
  auth.html, forgot-password.html, reset-password.html   Sign in / reset flow
  onboarding.html             Business setup (branding, industry, banking)
  jobs.html                   Job-card dashboard
  app.html                    The job card itself (capture → report → quote → PDF)
  project-manager.html        Dashboard of jobs whose quote was accepted
  project-detail.html         Execution tracking for one project (Overview,
                               Expenses, Site Photos, Export tabs)
  diagnose.html                Ad-hoc diagnostic tool for debugging whether
                               profile fields round-trip through save/load correctly
  terms.html
  sw.js                       Service worker - app-shell caching only, never
                               caches API responses (that's IndexedDB's job)
  css/                        base (design tokens) + one sheet per page
  js/
    config/IndustryPresets.js   Per-industry chip presets + colour schemes
    models/Job.js               Job domain model - quote maths, project maths,
                                 serialization, migrates old data shapes on load
    services/
      ApiClient.js               Thin fetch wrapper
      SessionGuard.js            Page-level auth guard, offline-resilient
      LocalStore.js               IndexedDB wrapper (hand-rolled)
      JobStore.js                 Local-first read/write orchestration + sync
      Theme.js, ImageTools.js, PdfService.js, AccountMenu.js, CsvExport.js
    pages/                      One controller class per page
    pwa.js                      Service worker registration + install prompts
                                 (Android native prompt, iOS guided banner)
  assets/screenshots/           Landing page mockups
```

## Architecture notes

- **Separation of concerns**: routes → controllers → services → repositories.
  Controllers know HTTP, services know the rules, repositories know storage.
- **Tenant isolation is structural, not per-query discipline.** Every job
  operation goes through `JobRepository`, and every method takes and enforces
  `userId` - there's no raw SQL in controllers, and `upsert` explicitly
  rejects a write against a job owned by someone else.
- **Auth**: bcrypt (12 rounds); JWT sessions in an `httpOnly`, `SameSite=Lax`
  cookie, `Secure` in production. Login runs a dummy hash compare so response
  timing can't reveal whether an email has an account. A password reset
  invalidates every previously-issued session token for that user, not just
  the current one. Rate limited by both IP and account (a distributed
  attack spread across many IPs at one account is caught, not just the
  simpler single-IP case).
- **Photo storage**: uploaded to R2, referenced by URL in the job's JSON. The
  bucket is private; URLs are short-lived signed ones handed out at read
  time, not stored directly. An offline/failed upload falls back to an
  embedded copy so nothing is lost, then gets migrated to a real R2 object
  automatically on the next successful save.
- **Validation is tiered by field**, not a single blanket limit: narrative
  fields (inspection findings, notes) get room to actually describe a job;
  names, ids and captions don't.
- **Security headers**: `helmet` with a CSP scoped to exactly the third
  parties actually loaded (Google Fonts, the jsPDF CDN, R2), `trust proxy`
  set correctly for Render's reverse proxy (rate limiting keys on the real
  client IP, not the proxy's), Dependabot enabled for dependency scanning.
- **`/healthz`**: unauthenticated, checks real DB connectivity (not just
  "is the process alive"), reports memory usage, deploy version (via
  Render's injected git commit), and non-critical service status (R2,
  Resend) without letting those flip the overall pass/fail - only the
  database can do that.
- **Frontend**: a controller class per page, shared service classes, a `Job`
  model that owns all quote/project maths and serialization. No bundler, no
  npm frontend dependencies - every `<script>` tag is a real file you can
  open and read top to bottom.

## Known limitations / roadmap

- **Render free tier.** Cold starts after inactivity are a real problem for
  a "check the quote before 7am" tool - move to a paid tier before real
  daily-use load, not after.
- **Deleting a job/project isn't offline-queued.** Every other write -
  editing, and creating a project without a quote - is; delete still needs
  a connection.
- **No error tracking or uptime monitoring yet** (Sentry, an external
  monitor) - errors are currently only visible via `console.error` in
  Render's log stream.
- **Paystack billing is planned, not built.** The app is free during beta;
  webhook idempotency, signature verification, and a subscription state
  model are designed only in discussion so far.
- **Conflict resolution is record-level, not per-field** - an accepted
  tradeoff for how rarely a single tradie edits the same job from two
  devices at once, not an oversight.
