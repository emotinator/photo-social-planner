# Photo Social Planner

A personal desktop tool for drafting social media posts from photographs. Drop images, add notes, pick an LLM, and generate ready-to-post captions with previews — all running locally in your browser.

Built with **Preact + Vite + TypeScript**. Spiritual successor to [Photo Overlay EXIF](https://github.com/eerana/photo-overlay-exif).

---

## Features

- **Image workspace** — drag-and-drop photos, reorder, thumbnail previews
- **LLM-powered generation** — Ollama (local) or Claude (Anthropic API) generate titles, captions, and hashtags from your images + notes
- **Caption templates** — define post structures with `[LLM ...]` and `[User ...]` placeholders; mix AI-generated content with your own snippet sets
- **Snippet sets** — reusable pick-lists (gear, lighting, locations, @mentions) you select per post
- **Caption voices** — define multiple writing tones (narrative, technical, educational); generate a variant per voice and compare side-by-side
- **Content length controls** — title word-count slider (1w–8w) and caption paragraph slider (micro–3 paragraphs) with live character budget aware of platform limits and template overhead
- **Instagram preview** — real-time preview matching IG's layout, carousel nav, dynamic aspect ratios
- **Deliver tab** — download all images as zip, individual downloads, copy caption/hashtags to clipboard
- **Plan tab** — save drafts, set planned post dates, drag-to-reorder, status tracking (draft → planned → posted), overdue/today flags
- **Export/Import** — back up all templates, snippets, voices, and settings as a single JSON file
- **Dark/Light theme** — system-matched or manual toggle, persisted across sessions
- **All data stays local** — IndexedDB for drafts/images/templates, localStorage for settings; API keys never leave your machine except to authenticate

---

## Requirements

- **Node.js** 18+ and npm
- **One of the following LLM providers:**
  - [Ollama](https://ollama.com) running locally (free, no API key needed)
  - An [Anthropic API key](https://console.anthropic.com/) for Claude

### Recommended Ollama models

For image analysis, use a vision-capable model:

```bash
ollama pull gemma4        # default, good balance
ollama pull llava         # solid vision model
ollama pull llama3.2-vision  # Meta's vision model
```

---

## Install & Run

```bash
# Clone the repo
git clone https://github.com/eerana/photo-social-planner.git
cd photo-social-planner

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app opens at **http://localhost:5173**.

### Production build

```bash
npm run build
npm run preview   # serves the dist/ folder
```

### Anthropic API proxy

The Vite dev server includes a built-in proxy to avoid CORS issues with the Claude API. No extra setup needed — requests to `/api/anthropic` are forwarded to `https://api.anthropic.com` automatically. This only works in dev mode (`npm run dev`).

---

## Configuration

### Settings tab

1. **Ollama** — Base URL defaults to `http://localhost:11434`. Click "Test Connection" to verify.
2. **Claude (Anthropic)** — Paste your API key (`sk-ant-...`). Stored in localStorage only.

All settings — provider, model, platform, template, caption/title length — are **automatically saved** and restored on next launch.

---

## How to Use

### 1. Add Images (Images tab)

- Drag photos onto the app, or click the **+** button in the header to browse
- Reorder images by dragging within the image strip
- Add **notes** about the images — context the LLM uses when generating

### 2. Generate a Draft (Generate tab)

- Pick a **provider** (Ollama or Claude) and **model**
- Choose a **platform** (Instagram, with Threads/LinkedIn coming)
- Optionally select a **template** (see below)
- Adjust **title length** (1–8 words or unlimited) and **caption length** (micro to 3 paragraphs)
  - The budget readout shows approximate characters vs. the platform's max
  - In template mode, static template text is subtracted from the budget
- Optionally select one or more **caption voices** — multiple voices generate a variant each so you can compare
- Click **Generate Draft**
- Edit the title, caption, and hashtags as needed
- The Instagram preview updates live in the canvas area as you edit
- Click **New Post** at the top to clear the workspace and start fresh

### 3. Templates & Snippets (Templates tab)

**Create a template:**

Write the post structure as text with placeholders:

```
[LLM Title]

[LLM Caption]

Shot in [User Lighting] conditions.
Gear: [User Camera-Gear]

.
.
.

[LLM Hashtags]
```

- `[LLM ...]` placeholders are filled by the AI during generation
- `[User ...]` placeholders reference a **snippet set** — you pick one option per post

**Create snippet sets:**

- Name must match the `[User ...]` reference exactly (e.g., "Lighting" matches `[User Lighting]`)
- Add multiple options (e.g., "Natural light", "Studio strobe", "Golden hour")

**Create caption voices:**

- Give each a name ("Warm Narrative", "Technical Breakdown") and a description that instructs the LLM how to write

**Export/Import:**

- "Export All" downloads a JSON file containing all templates, snippet sets, voices, and app settings
- "Import" restores everything from a previously exported file

### 4. Deliver (Deliver tab)

- **Download All as Zip** — bundles all images into a named zip file
- **Download individual** images
- **Copy Caption** / **Copy Hashtags** / **Copy Full Post** to clipboard
- Follow the workflow steps: download images → open platform → paste caption
- Instagram preview shows alongside in the canvas area

### 5. Plan (Plan tab)

- **Save Draft** — saves current workspace (images, caption, template state) to IndexedDB
- **Overwrite vs Save New** — when editing a previously saved draft, choose to update it in-place or save as a new copy
- **Auto-title** — drafts are named from the title field, or the first words of the caption if no title is set
- **Set planned date** — click the calendar icon on any draft card; setting a date auto-transitions to "planned" status
- **Drag to reorder** — grab the handle on the left to arrange posts in your preferred order
- **Status cycle** — click the status badge to cycle: draft → planned → posted
- **Overdue** flag (red) and **today** flag appear automatically based on planned dates
- **Platform tags** — colored badges showing which platform each draft targets
- The currently-editing draft is highlighted in the list

---

## Project Structure

```
src/
  app.tsx                  # Root component, global drag-drop overlay
  main.tsx                 # Entry point
  types.ts                 # All shared TypeScript types & platform configs
  store/
    index.ts               # Preact signals (reactive state)
    storage.ts             # IndexedDB CRUD, image utilities, export/import
  providers/
    registry.ts            # Provider registry
    ollama.ts              # Ollama API integration (vision + JSON mode)
    anthropic.ts           # Claude API via Vite proxy (tool_use for structured output)
  utils/
    prompts.ts             # System/user prompt builders with length & voice injection
    templateParser.ts      # Regex parser for [LLM ...] and [User ...] placeholders
  components/
    layout/
      Header.tsx           # Logo, theme toggle, add photos
      Sidebar.tsx          # Tab navigation + tab panel rendering
      Canvas.tsx           # Main content area, preview routing
    tabs/
      ImagesTab.tsx        # Image management, notes
      GenerateTab.tsx      # LLM generation workflow, length sliders, voice picker, new post
      TemplatesTab.tsx     # Template, snippet set, and voice editors
      DeliverTab.tsx       # Download, zip, clipboard
      PlanTab.tsx          # Draft management, scheduling, drag reorder
      SettingsTab.tsx      # Provider configuration
    preview/
      InstagramPreview.tsx # IG post mockup with carousel
  styles/
    theme.css              # CSS custom properties (dark/light)
    base.css               # All component styles
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| UI framework | Preact | 3KB runtime, React-compatible API |
| State | @preact/signals | Fine-grained reactivity, no boilerplate |
| Build | Vite | Instant HMR, built-in proxy for API CORS |
| Storage | IndexedDB (via `idb`) | Large blob storage for images |
| Settings | localStorage | Lightweight key-value for preferences |
| Zip | JSZip | Client-side zip creation for image bundles |
| Fonts | Google Fonts CDN | Montserrat, DM Mono, Instrument Serif, Syne, Material Symbols |

---

## License

Personal project. Not currently licensed for redistribution.
