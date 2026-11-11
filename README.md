# English Practice (dsh-increasing-my-english)

[中文](README.zh.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

Transcribe podcast recordings into speaker-diarized transcripts with the Bailian `bl speech recognize` CLI, read them in the DSH right sidebar, and press **Ctrl** on a word or sentence to look it up and keep it in a wordbook with phonetics, meanings, example sentences, word forms and etymology.

[![npm version](https://img.shields.io/npm/v/dsh-increasing-my-english.svg)](https://www.npmjs.com/package/dsh-increasing-my-english)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.0-blueviolet.svg)](https://deepseek.com/harness)

Requires DSH **>= 0.2.0** (web UI: the desktop app or `dsh web`). Transcription needs a logged-in Bailian CLI; PDF import needs poppler.

## Let an agent set it up (recommended)

Copy this paragraph into a new DSH conversation opened in the folder where you want your English material to live. The agent reads the [detailed setup guide](https://github.com/LeeKai233/dsh-increasing-my-english/blob/main/AGENT_ONBOARDING.md), does everything that does not need your hands, and replies with what is left for you and a 10-minute reading task.

```text
You're my English intensive-reading setup partner inside DSH. Read the detailed guide at
https://raw.githubusercontent.com/LeeKai233/dsh-increasing-my-english/main/AGENT_ONBOARDING.md — or
AGENT_ONBOARDING.md in this repository if it is mounted here — and follow it. Do everything that does not need my hands; stop
only for clicks, logins, a restart, or approvals. Then reply with three short sections: what you finished,
what only I can do (with the exact place to click), and one 10-minute reading task to start with. Do not delete or rewrite my
data, do not send content anywhere except the Bailian ASR call and the plugin's own lookup, and never
echo credentials. If you cannot read the guide, ask me to attach it.
```

Prefer to do it by hand? The three steps below walk through the same setup.

## Get started in 3 steps

1. **Install the DSH desktop app** (DeepSeek official): <https://deepseek.com/harness>.
2. **Install the plugin**: sidebar → **Plugins** → **Add plugin** → enter `dsh-increasing-my-english` → install and enable it.
3. **Set up Bailian**: create an Alibaba Cloud Bailian account and install + log in to the Bailian CLI by following the illustrated guide in [README.zh.md](README.zh.md#百炼-cli-安装与登录图文) (summarized below).

Then open the **English practice** tab in the right sidebar. Once the **Environment check** card in the empty state is all green (it requires `bl` signed in, Poppler and a writable workspace; with existing transcripts the card is also shown while the **Transcribe** panel is open), drop a recording into `recordings/` and start transcribing.

## Install and log in to the Bailian CLI

See the illustrated steps in [README.zh.md](README.zh.md#百炼-cli-安装与登录图文) — the eight screenshots live in [`assets/bailian-cli/`](assets/bailian-cli). In short:

1. Open <https://bailian.console.aliyun.com/cli> (China site), choose **Install CLI** → **Let an Agent install it (recommended)** → copy the prompt and paste it into a new DSH conversation. The assistant runs the official installer and reports the real `bl --version`.
2. Switch to **Authentication** → **Quick login (recommended)** and copy the command `bl auth login --console`.
3. On Windows, open **PowerShell 7** from the Start menu (PowerShell / PowerShell Preview; do **not** use legacy Windows PowerShell 5.1).
4. Paste `bl auth login --console` into PowerShell and press Enter.
5. Your browser opens the Alibaba Cloud login page. After signing in (or signing up) an API key is created automatically; new accounts get free quota and models stop running when the quota is used up unless you top up.
6. Click **Authorize CLI login** on the authorization page.
7. The terminal prints **CLI login successful!** and saves credentials to `…\.bailian\config.json` (i.e. `%USERPROFILE%\.bailian\config.json`).
8. Run `bl usage free` to inspect the free quota (`bl usage free --all` for every model).

![Let an Agent install the Bailian CLI](assets/bailian-cli/01-agent-install.png)

![Authorize the CLI login](assets/bailian-cli/06-authorize.png)

**No-terminal path**: just ask the assistant in a new conversation to “install the Bailian CLI” and “log in to the Bailian CLI”. It runs the official installer and `bl auth login --console` in a background terminal; you only complete the browser login and authorization, then the assistant reports the result. The panel's **Environment check** card verifies it.

## Mainland China network

| Step | Recommendation |
|---|---|
| Installing the DSH plugin | The plugin page automatically picks the faster registry between `registry.npmjs.org` and `registry.npmmirror.com`. A freshly published package can take 5–10 minutes to reach npmmirror; if it is not found right after release, retry a few minutes later. |
| Bailian CLI `bl` | Use the official Bailian China-site installer/docs (<https://bailian.console.aliyun.com/cli>), not third-party mirrors. |
| poppler (PDF import) | Prefer `winget install -e --id oschwartz10612.Poppler`; if poppler already exists elsewhere, point `DSH_ENGLISH_PDFTOPPM` / `DSH_ENGLISH_PDFTOTEXT` at the existing `pdftoppm.exe` / `pdftotext.exe`. |
| GitHub | Only developers need it (source, issues, release notes); installing the plugin and logging in the CLI never require direct GitHub access. |

## Features

### Transcribe recordings

- Put audio in `recordings/` (mp3 / m4a / wav / aac / flac / ogg / opus / amr / wma / mp4 / webm).
- In the **Transcribe** panel, pick a file from `recordings/`, or paste the absolute path of any folder/audio file and click **Scan**, or use **Choose folder…**; then pick a **Model** (default `qwen-audio-3.1-asr-flash-filetrans`, list provided by the host) and optionally the number of speakers (diarization is always on), then click **Start**. Transcription runs in the background, usually 1–3 minutes; the transcript appears automatically when done.
- Or simply ask the assistant in chat: “transcribe recordings/ep12.m4a”; it calls the `english_transcribe` tool and waits for completion.
- The default model is `qwen-audio-3.1-asr-flash-filetrans`; on failure it falls back to `fun-asr` and records the fallback in the transcript's `warnings`.

### Read transcripts

- Open it with the **headphones button** in the conversation header toolbar (tooltip: “Open English practice”), or the “English practice” card in the right-sidebar guide. The panel has a **Transcript / Wordbook** view switch and **A− / A+** font sizing (12–20px, remembered separately for each view).
- When transcripts exist, a dropdown at the top (“Choose a transcript”) switches between them; transcripts are grouped by speaker with per-segment timestamps.
- Imported transcripts have no speakers or timestamps and do not show **Merge short sentences**; PDF transcripts also get zoom (+ / −, remembered) and a **Preview** button that opens the original PDF inside DSH.

### Ctrl lookup

- Select a **word/phrase (≤4 words)** or a **sentence** in the transcript and press **Ctrl** (**⌘** on macOS):
  - word/phrase: a popover with phonetics and 1–3 Chinese meanings (word forms and etymology live on the wordbook card after adding);
  - sentence: a popover with the Chinese translation only.
- Words already in the wordbook get a **dashed underline**; selecting them reuses the saved phonetics and meanings (and the saved translation for sentences) and **skips the model call**. New lookups are cached in `.dsh-english/lookup-cache.json`.

### Wordbook

- Add from the popover's top-right button; duplicates are not inserted twice. Failed lookups are stored as “needs details” entries that you can complete later.
- Word entries automatically carry:
  - **word forms**: other parts of speech and irregular forms (past tense, past participle, plural, comparative, superlative, present participle, third-person singular, …), **up to 8**;
  - **etymology**: source language + root/affix breakdown + a short Chinese explanation.
- Older entries missing those fields show a **Fetch forms & etymology** button (HTTP `vocab.enrich`, tool `action=enrich`).
- The wordbook view supports search, word/sentence filtering, transcript filtering, sorting (time / A–Z), Full/Simple detail and deletion; when pending entries exist a banner with a **Copy prompt** button appears — paste it into the chat and the assistant reads pending entries with `english_vocab` and writes phonetics/meanings/translations back.
- `vocab/生词本.md` is a readable export rewritten after every change.

### PDF import

- **Import transcript** accepts `.txt` / `.text` / `.md` / `.markdown` / `.html` / `.htm` / `.tex` / `.rst` / `.log` (≤3MB) and `.pdf` (≤20MB, up to 120 pages rendered by default).
- HTML is stripped of tags, Markdown of markup; TeX commands are removed while `$…$` math is kept (rendered in the sidebar).
- PDFs are displayed page by page: local `pdftoppm` renders page images and `pdftotext -bbox` supplies a word-coordinate text layer, so you can select words and press Ctrl exactly like in a transcript.
- **PDF import requires poppler** (`pdftoppm` / `pdftotext`); when missing, import fails and the **Environment check** card shows the `winget install -e --id oschwartz10612.Poppler` command.

### Merge short sentences / delete

- **Merge short sentences** (transcribed transcripts only): adjacent segments from the same speaker separated by no more than `asr.mergeGapMs` (default 4000ms) are merged into paragraphs; transcription applies this automatically.
- **Delete** asks for a second confirmation; it removes `transcripts/<name>.json`, matching job records and PDF page cache only — **your audio files are never touched**.

### Environment check

- The **Environment check** card appears when there is no transcript yet (empty state) or while the **Transcribe** panel is open (its data comes from `env.check`; nothing is probed locally). It is collapsed by default and only auto-expands once when a problem is detected; click the title to expand/collapse it manually.
- Three status chips: `bl` (Ready / Missing / not signed in, with the version when expanded), `PDF` (Ready / Missing, i.e. Poppler), `Workspace` (Ready / not writable).
- Expanded, it shows details for `bl`, `PDF tool (Poppler)` and `Workspace`, the status of the `transcripts` / `vocab` / `recordings` directories and writability, a Notes (warnings) list, and a **Check again** button.
- Copy-paste fixes appear only for what is missing: `bl` missing → `npm i -g bailian-cli --registry=https://registry.npmmirror.com`; `bl` not signed in → `bl auth login --console`; Poppler missing → `winget install -e --id oschwartz10612.Poppler` (Linux/macOS: `brew install poppler` / `sudo apt install poppler-utils`). Click **Check again** afterwards. Note: **Poppler only affects PDF import** — without it, transcription and lookup still work, but the check will not be all green (the `PDF` chip shows Missing).

## Workspace layout

```
<workspace>/
  recordings/                     your audio files (read-only for the plugin)
  transcripts/<name>.json         normalized transcript (segments + ms timestamps)
  transcripts/.jobs/<id>.json     job state (15s heartbeat; stale after 90s = interrupted)
  transcripts/.jobs/<id>.raw.json raw ASR output
  vocab/vocabulary.json           wordbook source of truth (words + sentences)
  vocab/生词本.md                  readable export rewritten on every change
  .dsh-english/config.json        optional configuration overrides
  .dsh-english/lookup-cache.json  lookup cache
  .dsh-english/pdfs/<uuid>/       PDF cache (source.pdf / page-XX.png / words.xml)
```

The data format is frozen at `version: 1` (only optional fields may be added); corrupt JSON is backed up as `*.corrupt-<timestamp>` and the default is used instead.

## Configuration

`.dsh-english/config.json` is optional; defaults apply when it is missing:

```json
{
  "asr": {
    "model": "qwen-audio-3.1-asr-flash-filetrans",
    "fallbackModel": "fun-asr",
    "language": "en",
    "maxJobMinutes": 30,
    "pollIntervalSeconds": 2,
    "mergeGapMs": 4000,
    "toolTimeoutMinutes": 32
  },
  "lookup": {
    "backend": "ds",
    "provider": null,
    "model": null,
    "timeoutMs": 20000
  },
  "import": {
    "maxPdfPages": 120,
    "dpi": 100
  },
  "dirs": {
    "recordings": "recordings",
    "transcripts": "transcripts"
  }
}
```

The host caches the config for about 2 seconds: edits take effect after a moment, no DSH restart needed.

| Key | Default | Meaning |
|---|---|---|
| `asr.model` | `qwen-audio-3.1-asr-flash-filetrans` | default transcription model |
| `asr.fallbackModel` | `fun-asr` | fallback when the primary model fails; empty string disables it |
| `asr.language` | `en` | language hint (`zh`, …) |
| `asr.maxJobMinutes` | 30 | maximum runtime of one transcription job |
| `asr.pollIntervalSeconds` | 2 | polling interval for `bl speech recognize` |
| `asr.mergeGapMs` | 4000 | auto-merge threshold for adjacent segments of the same speaker |
| `asr.toolTimeoutMinutes` | 32 | overall timeout of the `english_transcribe` tool; must exceed `maxJobMinutes` |
| `lookup.backend` | `ds` | `ds` (current DSH model; fast, no Bailian text quota) / `bl` (`bl text chat`) / `off` |
| `lookup.provider` / `lookup.model` | `null` | override the lookup model; `null` follows the DSH default model |
| `lookup.timeoutMs` | 20000 | per-lookup timeout in milliseconds |
| `import.maxPdfPages` | 120 | maximum pages rendered for PDF import |
| `import.dpi` | 100 | PDF page rendering resolution |
| `dirs.recordings` / `dirs.transcripts` | `recordings` / `transcripts` | relative directories inside the workspace |

**Executable paths are not configurable through the config file.** `config.json` lives in the (writable) workspace, so to keep it from becoming an execution vector, `bl`, `pdftoppm` and `pdftotext` can only be overridden through **read-only environment variables** (absolute path or bare command name; no spaces, arguments or shell metacharacters):

| Environment variable | Default command | Purpose |
|---|---|---|
| `DSH_ENGLISH_BL` | `bl` | Bailian CLI |
| `DSH_ENGLISH_PDFTOPPM` | `pdftoppm` | PDF page rendering (poppler) |
| `DSH_ENGLISH_PDFTOTEXT` | `pdftotext` | PDF word-coordinate text layer (poppler) |

The legacy keys `blPath`, `import.pdfToPpmPath` and `import.pdfToTextPath` are removed: they are ignored and reported as warnings in the **Environment check** card with the matching environment variable. Unknown keys are ignored; invalid values fall back to defaults with a warning. On Linux/macOS install poppler with `brew install poppler` or `sudo apt install poppler-utils`.

## Agent tools

- `english_transcribe { audio, speakers?, model?, language? }` — transcribe and wait; returns `{ok,jobId,transcript,segments,speakers,durationMs,model,warnings,state,error?}`. `audio` may be workspace-relative or absolute. Failures are actionable (install/login commands when `bl` is missing or not logged in).
- `english_vocab { action, ... }` — `action` is one of `list` (defaults to pending entries) / `lookup` / `add` / `update` / `enrich` / `remove` / `export`.
  - `list` defaults to pending entries; `update` lets the assistant fill phonetics/meanings/example translations itself; `enrich` re-queries word forms and etymology by id; `export` rewrites `vocab/生词本.md`.
- The panel and the assistant share the same Host implementation: panel actions (transcript list, transcription, lookup, wordbook, …) call `POST /dsh-english/api` (loopback and same-origin only, `x-english-practice: 1` header required), transcript bodies are read through the host's workspaceFiles interface, and the assistant calls the two tools above.

## FAQ

**It cannot find `bl` / says the CLI is not logged in.**
The error code is `bl/missing` or `bl/not-authenticated`. The **Environment check** card (shown in the empty state, or while the **Transcribe** panel is open) points at the missing step. Manual fix: `npm i -g bailian-cli --registry=https://registry.npmmirror.com`, then `bl auth login --console`, then `bl auth status`. Restart DSH afterwards so the process picks up the new `PATH`. Other common codes: `pdf/poppler-missing` (no poppler), `http/rate-limited` (too many requests), `config/invalid` (config unreadable).

**PDF import fails with `pdf/poppler-missing`.**
Install poppler with `winget install -e --id oschwartz10612.Poppler`; if it is installed in a non-default location, set `DSH_ENGLISH_PDFTOPPM` / `DSH_ENGLISH_PDFTOTEXT`. Restart DSH afterwards.

**How do I write Windows paths?**
Use absolute paths such as `D:\Podcasts\ep12.m4a`. Paths with spaces can be pasted directly into the **Scan** field — no quotes, no escaping needed.

**What does it cost?**
Transcription calls Bailian ASR and is billed at Bailian prices; audio is uploaded to Bailian temporary storage (kept for 48h). Check the free quota with `bl usage free`; without top-up, models stop when the quota is used up. Lookups use the current DSH model by default (`ctx.llm`) and cost no Bailian text quota; only `lookup.backend = "bl"` routes lookups through Bailian text models.

**Why does an entry have no meaning yet?**
Failed lookups are stored as “needs details”. Click **Fetch forms & etymology** on the card, or ask the assistant to “complete the pending wordbook entries”.

**Privacy.**
No telemetry. Transcripts, the wordbook and the cache are plain files in your workspace. The HTTP endpoint listens on loopback only, accepts same-origin requests only, and requires a custom request header.

**Uninstall / switch source.**
The desktop plugin row is owned by the Electron profile: use **Remove** then **Add** in the plugin page instead of editing the manifest by hand. Removing the plugin keeps your workspace data.

## Repository layout

| Path | Purpose |
|---|---|
| `index.js` | Plugin entry: `name` / `inject` / `apply(ctx)`, assembly only (~17 lines) |
| `host/` | Host half, 12 modules: `api` / `asr` / `config` / `env` / `json-store` / `lookup` / `paths` / `pdf` / `text` / `tools` / `transcript` / `vocab` |
| `client.js` | Client half: single-file `window.__ModuleLoader__.load` bundle (§0–§9 partitions) |
| `cordis.patch.yml` | Bundle patch (insert id `english-practice`) |
| `locale/{zh,en}.json` | Plugin-page metadata (title / description) |
| `icon.svg` | Plugin-page icon |
| `assets/bailian-cli/` | README screenshots (8 PNGs) |
| `tests/` | `node --test` unit + contract + integration tests (10 `*.test.mjs`) |
| `AGENTS.md` | Maintainer contract: architecture, frozen interfaces, release flow |
| `README.md` / `README.zh.md` | English / Chinese docs |
| `CHANGELOG.md` | Changelog (Keep a Changelog) |
| `LICENSE` | MIT |
| `whalepicks.json` | whale-picks store manifest, schemaVersion 1.1 |
| `.github/workflows/ci.yml` | CI: `node --check` both entries + `node --test` (Node 22, no npm install) |

Published npm contents follow `package.json#files`: `index.js`, `host/`, `client.js`, `cordis.patch.yml`, `locale/*.json`, `icon.svg`, `assets/`, `README.md`, `README.zh.md`, `CHANGELOG.md` (`package.json` and `LICENSE` are always included by npm; `tests/`, `AGENTS.md`, `whalepicks.json` and `.github/` are not published).

## Development notes

- **Zero build**: the Host half is Node ESM (`index.js` assembles, `host/` holds the 12 modules), the Client half is a hand-written single-file `client.js` (`window.__ModuleLoader__.load` bundle, §0–§9 partitions). No TypeScript, no bundler, no runtime dependencies.
- **Host changes**: restart DSH (quit and reopen the desktop app; restart the process for CLI / `dsh web`).
- **Client changes**: just refresh the page (the bundle is resolved by package and re-fetched when its content changes).
- **`package.json`'s `dsh` manifest or `cordis.patch.yml` changes**: restart DSH.
- **Checks**: `npm run check` (`node --check index.js` + `node --check client.js` + `node --test`, which auto-discovers `tests/*.test.mjs`); requires **Node 20+**. Currently 10 test files (unit + contract + integration), all green.
- **Local development**: `package.json` keeps `@local/dsh-english-practice` during development and the desktop profile installs it via `link:`; the release rename unifies `dsh-increasing-my-english` (`package.json`, `cordis.patch.yml`, `client.js` PKG and loader id, locale meta).
- **Stable identifiers (do not rename)**: `.dsh-english/`, `/dsh-english/api`, the `x-english-practice` header, tool names `english_transcribe` / `english_vocab`, tab kind `english-reader`, locale NS `englishPractice`, patch row id `english-practice`.

## License

[MIT](LICENSE) © 2026 LeeKai233
