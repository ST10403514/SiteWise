# SiteWise - Your trade. Your brand. One job card.

SiteWise gives trade businesses their own branded job-card suite. A business
signs up, sets its company details, industry, logo and colour scheme - and gets
its own version of the app: capture site inspections, photos and pricing on
site, and generate branded, VAT-ready report and quotation PDFs. Every job card
autosaves to the business's account.

## Quick start

```bash
npm install
npm start          # or: npm run dev (auto-restart on change)
```

Open **http://localhost:3000**

Flow: **Landing → Create account → Onboarding (business setup) → Job dashboard → Job card**

## Multi-tenant branding

Onboarding stores a per-business profile that drives everything:

| Profile field        | What it controls                                            |
|----------------------|-------------------------------------------------------------|
| Company name/tagline | App header, PDF header, quote-number prefix (initials)      |
| Industry             | Job-type & method chip presets (`public/js/config/IndustryPresets.js`) |
| Colour scheme        | CSS variables theming the whole app **and** PDF colours     |
| Logo                 | App header and top-left of every PDF                        |
| VAT / banking / terms| Printed on every quotation                                  |

Adding an industry or colour scheme = one entry in `IndustryPresets.js`
(plus its key in the server-side allow-list in `ProfileController`).

## Project structure

```
server/                      Node/Express backend
  index.js                   Entry point
  app.js                     Composition root - wires all dependencies
  config.js                  Ports, paths, cookie & JWT settings
  controllers/               HTTP layer (Auth, Profile, Job)
  services/                  Business logic (AuthService, TokenService)
  repositories/              Persistence (User + Job JSON-file stores)
  middleware/                requireAuth guard, error handler
  routes/                    Route tables
  utils/                     ApiError, input validators
  data/                      Runtime data - gitignored

public/                      Frontend (served statically)
  index.html                 SiteWise landing page
  auth.html                  Sign in / create account
  onboarding.html            Business setup (identity, industry, colours, banking)
  jobs.html                  Job-card dashboard
  app.html                   The job card itself
  css/                       base (design tokens) + one sheet per page
  js/
    config/IndustryPresets.js  Per-industry chip presets + colour schemes
    models/Job.js              Job domain model (quote maths, serialization)
    services/                  ApiClient, SessionGuard, ImageTools, Theme, PdfService
    pages/                     One controller class per page
  assets/screenshots/        Landing slideshow (example tenant: Atlas Painting Co.)
```

## Architecture notes

- **Separation of concerns** - routes → controllers → services → repositories.
  Controllers know HTTP; services know the rules; repositories know storage.
- **Auth** - bcrypt-hashed passwords (12 rounds); JWT sessions in an
  `httpOnly`, `SameSite=Lax` cookie. Login runs a dummy hash compare so
  response timing doesn't reveal whether an email exists.
- **Tenancy** - every job is stored against its owner's user id; the job
  routes enforce ownership on read, write and delete.
- **Theming** - `Theme.apply(schemeKey)` overrides the CSS custom properties
  all stylesheets are written against; `PDFService.configure(profile)` maps the
  same scheme to RGB for the PDFs. One source of truth: `IndustryPresets.js`.
- **Storage** - JSON-file repositories keep the demo dependency-free. Their
  public interfaces are the contract: swap in a database implementation
  without touching services or controllers.
- **Frontend OOP** - a controller class per page (`AuthPage`, `OnboardingPage`,
  `JobsPage`, `AppPage`, `Slideshow`), shared service classes, and a `Job`
  model that owns all quote maths and serialization.

## Production checklist

- Serve over HTTPS and set `NODE_ENV=production` (marks the cookie `Secure`)
- Set a fixed `JWT_SECRET` environment variable
- Replace the JSON stores with a real database
- Add rate limiting on `/api/auth/*`
- Move photo payloads out of JSON bodies (object storage + signed URLs)
