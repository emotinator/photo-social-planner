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

## Implementation

**Types** (`src/types.ts`) — `ExtraOutputs { altText?, threadsPost? }`; optional `altText?: string[]` and `threadsPost?: string` on both `GenerateResponse` and `Draft`. Optional, so existing IndexedDB drafts need no migration.

**Prompts** (`src/utils/prompts.ts`) — `buildExtraOutputsInstruction()` carries both specs and is appended by `buildSystemPrompt` and `buildTemplateSystemPrompt`. The extras are independent of any post template, so they work in both modes.

**Normalization** (`src/utils/extraOutputs.ts`) — shared by both providers. `extraOutputProperties()` emits JSON-schema fragments for schema-capable providers; `normalizeExtras()` coerces whatever came back (bare string, short array, over-long array) into exactly `imageCount` entries.

**Providers**
- `anthropic.ts` — extras added to both the `social_post` and `template_fill` tool schemas. `max_tokens` raised 1024 → 2048; per-image alt text plus a Threads post can otherwise truncate the JSON mid-object.
- `ollama.ts` — `format: 'json'` enforces no schema, so extras are best-effort and lean on `normalizeExtras`.
- Both strip the extras keys out of `llmFills` so they are never mistaken for template placeholders.

**Store** — `enableAltText` / `enableThreadsPost` (persisted in `psp-gen-settings`), `editAltText` / `editThreadsPost` as editable results. `voiceVariants` changed from `Record<voiceId, string>` to `Record<voiceId, VoiceVariant>` so each voice carries its own extras; picking a voice now swaps caption *and* extras together.

**UI** — "Extra Outputs" checkbox section in Generate; editable alt-text rows (per slide, with a ~125-char guide) and a Threads textarea with a 500-char counter. Deliver shows alt text with a copy button beside each thumbnail, plus a Threads copy block. Plan saves and restores both fields.

## Known limitations

- In classic multi-voice mode, title and hashtags still come from the *last* voice generated while the caption and extras come from the *selected* voice. Pre-existing behaviour, left unchanged.
- A separate Threads post is suppressed when the post's own platform is already Threads.
- Small local models ignore the JSON schema, so alt text quality on `gemma4:e4b` is best-effort; `normalizeExtras` keeps malformed output from breaking the run.
- Threads posts do not feed the repetition context — that still tracks titles and captions only.

## Not verified

The build typechecks and compiles. Prompt quality, alt-text usefulness, and Threads tone are unverified against a real model — that is what this branch is for.
