# The Arbitration Briefings

**An open-source intelligence platform for international arbitration practice.**

Part of the [Lex Arbitri Suite](https://github.com/lex-arbitri-suite).

---

## What It Does

The app runs an AI engine across 60+ open-access legal repositories — institutional websites, court databases, treaty archives, and legal information institutes — and returns curated intelligence on developments in international commercial and investment arbitration.

- **Daily Digest.** A sweep of the approved source registry, returning development cards each linked to a verifiable primary source. Run it when you want to know what has moved in the field.
- **Research chat.** Direct queries to the AI, answered with inline citations. The AI consults live sources as it answers, not a static knowledge base.
- **Briefing generation.** One or more research sessions consolidated into a formal report with an executive summary and source list. The report is generated from your saved chats; you can edit the title and export it.

Everything you generate is stored in your own database. No data leaves your environment without your knowledge — see [Your data](#your-data) below.

---

## The live showroom

The instance at [briefings.lexarbitrisuite.com](https://briefings.lexarbitrisuite.com) demonstrates what the app looks like in use. The intelligence sweep, research chat, and briefing generation are restricted to the owner; visitors can browse the interface and read the showcase conversations.

To use the app for your own research, you need your own instance — see below.

---

## Your own instance

A self-hosted instance gives you the full application — sweep, chat, briefing generation, your own archive — running against your own database and your own API key. Your data does not depend on the showroom, and you pay your own API costs directly rather than through any third party.

**What it involves.** A terminal (the command-line interface on your computer), a Google account, and a billing-enabled Gemini API key. The setup takes about an hour. If you work with an AI coding assistant — Claude Code, Cursor, or similar — that assistant can handle the technical commands while you follow each step and understand what it does. Once deployed, the app lives at a permanent web address you can open from any device, at any time, without running any commands.

**What it costs.** Firebase infrastructure for personal use typically runs a few dollars a month. The main variable cost is the Gemini API, billed by Google per call. Before you begin, set a budget alert in [Google AI Studio](https://aistudio.google.com/) so there are no surprises.

---

## Prerequisites

- **Node.js 18 or later** — the runtime the tooling needs. Download from [nodejs.org](https://nodejs.org).
- **Firebase CLI** — the command-line tool for deploying to Firebase. Once Node.js is installed, run: `npm install -g firebase-tools`.
- **A Firebase project on the Blaze plan** — Firebase is Google's platform for hosting web apps and running server-side code. The free Spark plan does not support server-side functions; you need the Blaze (pay-as-you-go) plan.
- **A billing-enabled Gemini API key** — obtain from [Google AI Studio](https://aistudio.google.com/apikey). The free-tier key does not support the models the app uses.

---

## Setup

### 1. Create your Firebase project

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Upgrade it to the Blaze plan. (The deploy at step 6 will fail on Spark.)
3. Enable Google Sign-In: **Authentication → Sign-in method → Google → Enable**.
4. Create a named Firestore database — the database that will hold all your chats, briefings, and development cards. Go to **Firestore Database → Create database**; under **Database ID**, enter `arbitration-briefings`; choose your preferred region.

### 2. Clone and install

```bash
git clone https://github.com/lex-arbitri-suite/the-arbitration-briefings.git
cd the-arbitration-briefings
npm install
npm --prefix functions install
firebase login
firebase use --add
```

`firebase use --add` links the CLI to your Firebase project. Select the project you created above when prompted.

### 3. Configure the client

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your Firebase configuration values. You find them in Firebase Console: **Project settings → Your apps → Web app → Config**. The block contains values like `apiKey`, `authDomain`, `projectId`, and so on. Copy each into the matching variable in `.env.local`. Leave `VITE_OWNER_UID` blank for now.

### 4. Find your owner UID

The app restricts the intelligence sweep and all AI calls to one workspace owner, identified by their Firebase Authentication UID — a permanent unique identifier that Firebase assigns the first time you sign in with Google. Think of it as the internal identifier behind your Google account, specific to this Firebase project.

To find yours:

1. In `.env.local`, set `VITE_DEV_REAL_AUTH=true`.
2. Run `npm run dev` and open `http://localhost:5173`.
3. Sign in with your Google account.
4. Open **Firebase Console → Authentication → Users** — your UID appears in the table.
5. Copy the UID into `VITE_OWNER_UID` in `.env.local`, then blank out or remove `VITE_DEV_REAL_AUTH`.

### 5. Set the Gemini key and owner parameters

The Gemini key is held in Firebase Secret Manager — sealed server-side storage that injects the key into the functions at runtime. It never appears in the deployed app or the client bundle.

```bash
# You will be prompted to paste the key:
firebase functions:secrets:set GEMINI_API_KEY

# Owner identity — must match what is in .env.local:
firebase functions:params:set OWNER_UID=<your-uid>
firebase functions:params:set OWNER_EMAIL=<your-google-email>
```

`OWNER_UID` and `OWNER_EMAIL` must resolve to the same Google account.

### 6. Deploy

```bash
firebase deploy
```

This builds the server-side functions, uploads the frontend to Firebase Hosting, and applies the database security rules and indexes. When it finishes, the CLI prints your hosting URL — something like `https://<project-id>.web.app`. That is your app.

To add a custom domain (for example, `briefings.yourdomain.com`), go to **Firebase Console → Hosting** and follow the DNS verification steps.

### 7. First run

Open your hosting URL and sign in with your Google account. Click **Live Refresh** to run the first intelligence sweep. The sweep takes 30–60 seconds and populates the feed with development cards.

---

## Your data

Everything you generate in the app — chats, briefings, development cards — is written to the Firestore database in your Firebase project. The security rules deployed at step 6 restrict read and write access to authenticated users of your project; by default, that means you alone.

The only data that leaves your Firebase environment is what you send to the Gemini API: the text of your research queries and the prompts that drive the Daily Digest sweep. This happens server-side, via the Cloud Functions you deployed; the Gemini key is never exposed in the browser. The app contains no analytics, telemetry, or third-party scripts that could capture session data.

The Methodology page in the running app explains exactly what is sent to the AI and when.

---

## AI and providers

The Daily Digest sweep and research chat use Gemini's built-in web-search capability: the model searches live sources within the same call that produces the answer. This is what gives each development card and chat response its primary-source citation. These two features are pinned to Gemini in the current version.

Briefing generation works from content already saved in your database — no live search involved — and can run on any OpenAI-compatible API endpoint, including a model running locally on your own machine. You switch providers by setting a single Firebase parameter; the change takes effect on the next call, with no rebuild or redeployment. See [Configuring an alternate briefing provider](#configuring-an-alternate-briefing-provider) below for the commands.

---

## Customisation

### Approved sources

The registry of open-access sources is in `src/utils/approvedSources.ts`. Add an entry with `name`, `url`, `description`, and `category`; both the AI prompt and the URL validator pick up the change automatically. Every entry must be freely accessible — the app uses no paywalled content.

### Categories

The category taxonomy is in `src/constants.ts`. Add or rename categories in `DEVELOPMENT_CATEGORIES`, and update the keyword mapping in `normaliseCategory()` so AI-generated labels map correctly on ingestion.

---

## Configuration reference

### Client variables (`.env.local`)

| Variable | Description |
|---|---|
| `VITE_OWNER_UID` | Firebase UID of the workspace owner |
| `VITE_FIREBASE_API_KEY` | Firebase web SDK API key (not the Gemini key) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Named Firestore database ID — set to `arbitration-briefings` |
| `VITE_DEV_REAL_AUTH` | Set `true` to use real Google sign-in during local development |
| `VITE_FUNCTIONS_EMULATOR` | Set `true` to route AI calls to the local functions emulator |

### Functions settings

Set via the Firebase CLI. Secrets are held in Secret Manager; parameters are plain configuration values.

| Setting | Type | Command |
|---|---|---|
| `GEMINI_API_KEY` | Secret | `firebase functions:secrets:set GEMINI_API_KEY` |
| `OWNER_UID` | Parameter | `firebase functions:params:set OWNER_UID=<uid>` |
| `OWNER_EMAIL` | Parameter | `firebase functions:params:set OWNER_EMAIL=<email>` |
| `AI_PROVIDER` | Parameter | `firebase functions:params:set AI_PROVIDER=gemini` |
| `AI_PROVIDER_FALLBACKS` | Parameter | `firebase functions:params:set AI_PROVIDER_FALLBACKS=<comma-separated-ids>` |

### Configuring an alternate briefing provider

To use an OpenAI-compatible endpoint for briefing generation — for example, a local model via [Ollama](https://ollama.com/), or a hosted provider that offers a no-training API tier:

```bash
firebase functions:params:set OPENAI_COMPAT_BASE_URL=<endpoint-url>
firebase functions:params:set OPENAI_COMPAT_MODEL_PRO=<model-name>
firebase functions:params:set OPENAI_COMPAT_MODEL_FLASH=<model-name>
firebase functions:secrets:set OPENAI_COMPAT_API_KEY
firebase functions:params:set AI_PROVIDER=openai-compat
```

The change takes effect on the next invocation. To revert to Gemini: `firebase functions:params:set AI_PROVIDER=gemini`.

---

## For contributors

### Running locally

```bash
npm run dev                                # Vite dev server at localhost:5173
firebase emulators:start --only functions  # Local functions emulator
```

Set `VITE_FUNCTIONS_EMULATOR=true` in `.env.local` to route AI calls to the local emulator. Create `functions/.secret.local` containing `GEMINI_API_KEY=<your-key>` for the emulator to read the secret.

### Tests

```bash
npm test        # offline suites — merge gate, AI providers, source-link checks
npm run canary  # probes the real source sites; reports, never fails
```

`npm test` is deterministic and needs no network. The canary is separate because it depends on third-party sites: it reports which approved sources have stopped answering automated probes, and links from those sources reach readers without a liveness check.

`npm install` points git at the versioned hooks in `.githooks/`, so `npm test` runs before each commit and a failure stops it. Skip a run with `git commit --no-verify`; the hook stands aside quietly if dependencies are not installed. To opt out entirely: `git config --unset core.hooksPath`.

### Key files

```
src/
  App.tsx                      — Application shell
  constants.ts                 — Category taxonomy and normaliser
  firebase.ts                  — Firebase initialisation and Firestore utilities
  components/
    GeneratedBriefingView.tsx   — Briefing modal (view, edit title, save, export)
    MarkdownRenderer.tsx        — Shared Markdown rendering
    TermsModal.tsx              — Terms acknowledgement modal
    ErrorBoundary.tsx           — React error boundary
  utils/
    aiProvider.ts               — Client router to Firebase callable functions
    approvedSources.ts          — Registry of open-access sources
    urlValidator.ts             — URL validation against the approved source list
  prompts/                      — AI prompt text
functions/
  index.ts                     — Firebase callable functions
  providers/                   — Server-side AI provider layer
  urlLiveness.ts               — Source-link liveness checking
```

### Before submitting a pull request

1. Run `npm run lint`.
2. Test locally: run a Live Refresh sweep and at least one research chat session.
3. If you have changed the approved sources or category taxonomy, verify that the AI prompt and URL validator both work correctly.

For significant changes, open an issue first.

---

## Licence

MIT

---

## Acknowledgements

Built with Firebase, React, and the open-access legal repositories maintained by arbitral institutions, courts, and legal information institutes worldwide.

Part of the [Lex Arbitri Suite](https://github.com/lex-arbitri-suite) — open-source legal technology for international arbitration. Live showroom: [briefings.lexarbitrisuite.com](https://briefings.lexarbitrisuite.com)
