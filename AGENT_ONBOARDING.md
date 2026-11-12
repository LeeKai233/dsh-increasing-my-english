# Agent onboarding — English practice (dsh-increasing-my-english)

This file is written for an AI agent. When the user sends the setup prompt from the README, read this file and follow it. Do the setup yourself; hand back only the actions that need the user's hands. Reply in the user's language.

## Outcome

The user ends up with:

- `recordings/`, `transcripts/` and `vocab/` ready in the current workspace;
- the Bailian CLI installed and signed in, or a clear actionable blocker;
- poppler installed when possible (PDF import only);
- one new transcript from the newest un-transcribed recording, if any;
- pending wordbook entries completed, multi-sense analysis run for every stale word (repeat until `remaining` is 0; fills `meanings[].example` and new senses), and `vocab/生词本.md` exported;
- the wordbook's words reviewable in daily review rounds in the panel's third view **Review** (EN → ZH / ZH → EN / Mixed); mastery and progress stay local in `.dsh-english/recall.json`;
- the panel's fourth view **Graph** shows how transcripts and words (and words among themselves) connect; it is derived read-only, needs no agent action and writes nothing;
- a short report with only what they still need to do, plus one 10-minute reading task.

## Boundaries

You may do these yourself:

- inspect the workspace and run the checks below;
- install the Bailian CLI and poppler when missing;
- start `bl auth login --console` in the background and wait for it;
- create the workspace directories;
- transcribe exactly one newest un-transcribed recording;
- complete pending wordbook entries, run multi-sense analysis until no stale words remain, and export the wordbook;
- point the user to today's recall round as described in Step 5c (recall has no agent tool; the panel maintains its progress);
- report the result.

Stop and ask, or tell the user exactly what to click, for:

- installing/enabling the DSH plugin on the Plugins page;
- completing the browser login and authorization;
- UAC/admin prompts from installers;
- restarting DSH;
- any destructive action, or any second transcription.

Never:

- edit the DSH desktop profile or plugin manifest by hand;
- delete, move or rewrite the user's audio, transcripts or existing wordbook entries;
- edit `.dsh-english/recall.json` by hand, answer recall questions for the user, or change their recall progress;
- send workspace content anywhere except the Bailian ASR call and the plugin's own DSH-backed lookup;
- print, store or echo API keys or other credentials;
- install extra Bailian skills (`bl skill init`); the CLI alone is enough;
- restart DSH yourself;
- invent results. If something fails, report the real command, error code and fix.

## Step 1 — Check the plugin tools

Look for `english_transcribe` and `english_vocab` in your toolset.

- Present: continue with Step 2.
- Missing: the plugin is not installed or enabled. Tell the user:
  1. In DSH, open the sidebar → **Plugins** → **Add plugin**.
  2. Enter `dsh-increasing-my-english`, install it and enable it.
  3. If the plugin page asks for a restart, or the tools still do not appear in this conversation, start a new conversation and send the setup prompt again.

  Then continue with Steps 2–4; they do not need the plugin. Skip Step 5 and say so in the report.

## Step 2 — Prepare the workspace

Create these directories in the current workspace if they do not exist:

```text
recordings/
transcripts/
vocab/
```

Do not delete or overwrite existing files. These are the plugin defaults; if `.dsh-english/config.json` exists and overrides `dirs.recordings` or `dirs.transcripts`, respect it.

## Step 3 — Bailian CLI

Run:

```bash
bl --version
bl auth status --output json
```

### 3a. `bl` is missing

Install it by following <https://bailian.aliyun.com/cli/install.md>.

- If Node.js >= 18.17 and npm are available:

```bash
npm i -g bailian-cli --registry=https://registry.npmmirror.com
```

  The mirror is for mainland China; `npm i -g bailian-cli` without the mirror also works.
- Otherwise use the official binary installer:
  - Windows PowerShell: `irm https://bailian.aliyun.com/cli/install.ps1 | iex`
  - macOS/Linux: `curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash`

Install the CLI only; do not run `bl skill init` or install Bailian skills.

Verify with `bl --version` and report the real version. If the shell cannot find `bl` after the install, check `npm prefix -g` and `where.exe bl` (`which bl` on macOS/Linux); use the absolute path for the remaining checks.

### 3b. `bl` is not signed in

1. Start `bl auth login --console` in a background terminal.
2. Tell the user the browser is open (or relay the URL from the CLI output) and that they must finish the login and authorization.
3. Wait for it to finish, then run `bl auth status --output json` again.
4. Report only masked/authentication status fields; never echo the API key.

### 3c. After installing `bl`

The DSH process may have started before the install, so the plugin's child processes may not see the new `PATH`. Tell the user to restart DSH after the setup (quit and reopen the desktop app; restart the process for CLI/`dsh web`), then send the prompt again. Do not restart DSH yourself.

## Step 4 — poppler (PDF import only)

Run:

```bash
pdftoppm -v
```

If it is missing, install it:

- Windows: `winget install -e --id oschwartz10612.Poppler`
- macOS: `brew install poppler`
- Linux: `sudo apt install poppler-utils`

If the install fails or the user declines, say that transcription and lookups still work and only PDF import needs poppler. Do not block Steps 5–6 on it. As with `bl`, a DSH restart may be needed before the plugin sees a newly installed poppler.

## Step 5 — Prepare the first session

Do this only if the plugin tools are available.

### 5a. Transcription (at most one)

1. List `recordings/` and keep the supported audio files: `.mp3`, `.m4a`, `.wav`, `.aac`, `.flac`, `.ogg`, `.opus`, `.amr`, `.wma`, `.mp4`, `.webm`.
2. Read every `transcripts/*.json` and collect its `audio` field.
3. Pick the newest audio file (by modification time) that is not already referenced by an existing transcript. Match by workspace-relative path, or by file name if the stored path is absolute.
4. If one exists, call `english_transcribe` with:

```json
{ "audio": "recordings/<file>" }
```

This is the one transcription authorized without asking. Wait for the tool to finish.

5. Do not start a second transcription. If the tool fails, report the error and its fix; do not retry more than once.

If there is no eligible audio, skip this step and tell the user to drop an episode into `recordings/`.

### 5b. Wordbook

1. List pending entries with `english_vocab`:

```json
{ "action": "list", "status": "pending" }
```

2. For each pending entry:
   - Word: look it up with `{ "action": "lookup", "kind": "word", "text": "<word>" }`, then update with:

```json
{
  "action": "update",
  "entries": [
    {
      "id": "<entry id>",
      "ipa": "<from lookup>",
      "meanings": [{"pos": "n.", "zh": "…"}],
      "family": [{"label": "past tense", "form": "…"}],
      "etymology": {"language": "Latin", "parts": [{"part": "…", "meaning": "…"}], "explanation": "…"}
    }
  ]
}
```

Only fill fields that are missing; do not overwrite existing content. The lookup result already has the right shapes for `ipa`, `meanings`, `family` and `etymology`.
   - Sentence: look it up with `{ "action": "lookup", "kind": "sentence", "text": "<sentence>" }`, then update with `{ "action": "update", "entries": [{ "id": "<id>", "translation": "<from lookup>" }] }`.
   - If a lookup fails, skip that entry and continue; report it.

3. Run multi-sense analysis with `{ "action": "analyze" }`. It compares every transcript in the workspace for the word, appends other meanings found in other documents (with context examples and source evidence, never overwriting existing meanings), and returns `{analyzed,updated,added,skipped,failed,remaining,entries}`.
   - Repeat while `remaining > 0`: one call analyses at most `analysis.batchWords` stale words (default 2), so a large wordbook needs several calls.
   - Only stale words are analysed: the same corpus is never re-analysed; `skipped` means the word has fewer than 2 contexts across all transcripts, which is normal.
   - A single word can be forced with `{ "action": "analyze", "id": "<entry id>" }`.
   - The plugin also runs this automatically in the background once the user goes idle (see the background multi-sense analysis contract in `AGENTS.md`), so this step just shows the result immediately.

4. Finish with `{ "action": "export" }` so `vocab/生词本.md` is current. Export even when there are no pending entries.

### 5c. Review

Review has no agent tool and the panel maintains its progress; just point the user at it, and never edit `.dsh-english/recall.json`.

1. Read `vocab/vocabulary.json` and count the entries whose `kind` is `word` and whose `word` and `meanings` are non-empty — only those are reviewable (sentence entries never enter review).
2. Tell the user to open the third tab, **Review**, at the top of the right-sidebar **English practice** panel:
   - the first visit of the day prepares a **fixed round for that day**: due words first, topped up with up to the daily new-word limit and capped by the daily question limit (defaults `recall.newPerDay` 10, `recall.dailyLimit` 30, configurable in `.dsh-english/config.json`);
   - the practice direction can be **EN → ZH** (English → Chinese), **ZH → EN** (Chinese → English) or **Mixed**, switchable in the panel at any time;
   - after answering, self-grade **Forgot / Fuzzy / Got it / Easy** (shortcuts 1–4) and the panel schedules the next review by mastery; single words or the whole progress can be reset at any time.
3. If no reviewable words exist, explain why (no word entries yet, or word entries without a Chinese meaning) and ask the user to look words up from a transcript first; when there is no round yet for today, reopening Review after adding words prepares it.
4. The fourth tab, **Graph**, is read-only: it derives transcript ↔ word and word ↔ word relations from the transcripts, the wordbook and the review progress. Point the user at it once; never try to "repair" graph data (there is nothing persisted to repair).

### 5d. Reading task

- If a transcript exists: read it and choose a 200–400 word passage (or the first 10–20 segments) that fits 10 minutes. Tell the user to open the right sidebar **English practice** tab, read that passage, select 3–5 words and press **Ctrl** (**⌘** on macOS), then come back to you.
- If there is no transcript yet: tell the user to drop an episode into `recordings/` and say "transcribe it"; give the same instructions once it is ready.

## Step 6 — Reply with exactly three sections

Use the user's language. Keep it short.

**Done** — what you installed or verified (with versions), which directories you created, which file you transcribed (or why none), how many wordbook entries you completed, the export path, and anything you skipped.

**Waiting on you** — only actions the user alone can take, each with the exact place:

- browser login/authorization for Bailian;
- restarting DSH so a newly installed `bl`/poppler is picked up;
- adding/enabling the plugin on the Plugins page;
- dropping an episode into `recordings/`;
- opening the right sidebar **English practice** panel and doing today's round on the third tab, **Review**;
- opening the fourth tab, **Graph**, to see how today's words connect to the transcripts (optional, read-only);
- opening the right sidebar **English practice** panel and checking the **Environment check** card.

Do not list things you already did.

**Start now** — one 10-minute reading task: which passage, which 3–5 words to look up with Ctrl/⌘, and what to do afterwards (for example, "ask me to review these words").

## Failure matrix

| Symptom | What to do |
|---|---|
| `english_transcribe` / `english_vocab` missing | Give the Plugins page steps; continue Steps 2–4; skip Step 5. |
| `bl` missing | Install via the official doc, npm or the binary installer; verify `bl --version`. |
| `bl auth status` shows not authenticated | Run `bl auth login --console` in the background; wait for the browser; re-check. |
| No Node/npm | Use the binary installer from the install doc. |
| poppler missing | Give the platform command; note PDF import only; do not block. |
| No audio in `recordings/` | Ask the user to add one; skip transcription. |
| Audio already transcribed | Do not transcribe again; use the existing transcript. |
| No pending wordbook entries | Export and say there was nothing to fill. |
| Recall fails to load | Ask the user to refresh the page first; if it still fails, restart DSH (host changes need a restart) and reopen the panel's third tab. Never edit `.dsh-english/recall.json` by hand. |
| Graph is empty or says nothing to connect | It is derived: it is empty when the wordbook has no words or no transcript contains them. Transcribe/import material and look words up first; there is no graph data to fix. |
| `lookup` fails | Skip that entry, continue, report the error. |
| Transcription fails | Report the exact error; do not retry more than once; do not start another file. |
| PATH/restart needed | Put "restart DSH" in **Waiting on you**; do not restart it yourself. |
| Approval/UAC prompt | Tell the user what to approve; do not bypass it. |

## Idempotency

Running this guide again must not duplicate work:

- check the `audio` fields in `transcripts/*.json` before transcribing;
- check the pending count before looking up;
- creating existing directories is a no-op;
- exporting the wordbook repeatedly is safe.

## Security and privacy

- No telemetry. Transcripts, the wordbook and the cache stay in the user's workspace.
- The only outbound content is the audio sent to Bailian ASR for transcription and the text sent through the plugin's DSH-backed lookup. Do not send workspace content anywhere else.
- Never print, store or echo API keys or credentials. Report masked status only.
- Do not edit files outside the workspace, the DSH profile, or the plugin manifest.
