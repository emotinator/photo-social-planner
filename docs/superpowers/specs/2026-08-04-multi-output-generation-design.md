# Multi-output generation: alt text + Threads post

Status: **on trial** — built on `multi-output-generation` for hands-on evaluation before merge.

## Goal

Alongside the Instagram caption, optionally generate:

1. **Alt text** — Instagram's per-image alt field, tuned to serve screen readers and Instagram's content understanding at once.
2. **Threads post** — a native Threads post with its much smaller character budget.

Each is opt-in via a checkbox, so you can request them together with the caption or leave them off.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Data model | One draft holds all outputs (`altText`, `threadsPost` on `Draft`) | Matches the workflow — one shoot, several surfaces. No image duplication in IndexedDB, no change to the Plan queue. |
| Call strategy | One LLM call returns everything, as extra JSON keys | Zero added latency. On local Ollama, re-sending images dominates cost; and it stays sane with multi-voice (1 call per voice, not 3×). |
| Alt text style | Descriptive-first, natural keywords | Alt text is both a screen-reader description and a content signal. Keyword-stuffing degrades the former and reads as spam. Searchable terms are included only where genuinely true of the photo. |
| Threads style | Written independently, fixed 300–500 char spec | A condensed Instagram caption reads as a truncated crosspost. No new slider — the existing caption/title sliders stay Instagram-only. |
| Carousels | One alt text per image, array in slide order | Instagram sets alt per slide. The model already receives all images in order, so this costs nothing extra. |
| Threads length | Credits block reserved out of the 500, target given in words | A first trial overshot 500 by 47 characters. Models cannot count characters reliably, so the target is expressed in words with a safety margin held back. |
| Credits block | Editable in Settings, appended at generation time | Appending at generation puts the whole post — text plus credits — in one editable field, so the per-post `In Frame` / `Agency` handles are edited where everything else is edited. |
| Result layout | Nested tab strip: Post / Alt Text / Threads | Three stacked outputs make the panel long. Tabs appear only when more than one output exists. |

## Implementation

**Types** (`src/types.ts`) — `ExtraOutputs { altText?, threadsPost? }`; optional `altText?: string[]` and `threadsPost?: string` on both `GenerateResponse` and `Draft`. Optional, so existing IndexedDB drafts need no migration.

**Prompts** (`src/utils/prompts.ts`) — `buildExtraOutputsInstruction()` carries both specs and is appended by `buildSystemPrompt` and `buildTemplateSystemPrompt`. The extras are independent of any post template, so they work in both modes.

**Normalization** (`src/utils/extraOutputs.ts`) — shared by both providers. `extraOutputProperties()` emits JSON-schema fragments for schema-capable providers; `normalizeExtras()` coerces whatever came back (bare string, short array, over-long array) into exactly `imageCount` entries.

**Providers**
- `anthropic.ts` — extras added to both the `social_post` and `template_fill` tool schemas. `max_tokens` raised 1024 → 2048; per-image alt text plus a Threads post can otherwise truncate the JSON mid-object.
- `ollama.ts` — `format: 'json'` enforces no schema, so extras are best-effort and lean on `normalizeExtras`.
- Both strip the extras keys out of `llmFills` so they are never mistaken for template placeholders.

**Store** — `enableAltText` / `enableThreadsPost` (persisted in `psp-gen-settings`), `editAltText` / `editThreadsPost` as editable results. `voiceVariants` changed from `Record<voiceId, string>` to `Record<voiceId, VoiceVariant>` so each voice carries its own extras; picking a voice now swaps caption *and* extras together.

**Threads budget** (`calcThreadsBudget`) — reserves the credits block length plus a 60-character safety margin out of the 500, then states the remainder to the model as a word count (~52 words for the default block). The margin absorbs both model overshoot and the per-post handles typed into the `In Frame` / `Agency` slots, which the stored block cannot know about.

**UI** — "Extra Outputs" checkbox section in Generate. Results sit behind a nested tab strip (Post / Alt Text / Threads) that appears only when more than one output exists; each tab carries a badge showing its count or length, turning red when over limit so a problem is never hidden behind an unselected tab. The Threads field holds the complete post including credits, so the handles are editable there. Settings holds the credits block with a live budget readout and detects zero-width characters that would silently consume the limit. Deliver shows alt text beside each thumbnail with a copy button, plus a Threads copy block. Plan saves and restores both fields.

## Known limitations

- In classic multi-voice mode, title and hashtags still come from the *last* voice generated while the caption and extras come from the *selected* voice. Pre-existing behaviour, left unchanged.
- A separate Threads post is suppressed when the post's own platform is already Threads.
- Small local models ignore the JSON schema, so alt text quality on `gemma4:e4b` is best-effort; `normalizeExtras` keeps malformed output from breaking the run.
- Threads posts do not feed the repetition context — that still tracks titles and captions only.

## Verification

Tried hands-on against a local Ollama model: outputs generate, the Threads length overshoot was found and fixed this way, and the editing flow was reworked in response.

Not verified: Threads length compliance across repeated runs. A compliance harness was written and started, then killed because it was competing for the GPU with live testing. The live character counter is the backstop.

Incidental finding while benchmarking on an M4 Max: `gemma4:26b` runs at 65.8 tok/s versus `e4b` at 61.0 and `31b` at 16.3, making 26b both the fastest and the strongest of the three. Forcing `num_ctx: 8192` changed throughput by under 1% and was not adopted.
