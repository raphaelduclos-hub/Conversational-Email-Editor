# Conversational Email Editor — Technical Spec

> Dev spec for the Conversational Email Editor prototype. Read by Claude Code as persistent context.
> For full product rationale, user stories, and success metrics, see the companion feature spec (docx).

## What We're Building

A two-panel web app where users edit AI-generated emails via natural language conversation. Left panel = chat. Right panel = live HTML email preview. The user types instructions like "Make the hero section dark blue with white text" and the preview updates in real-time.

Inspired by [Migma](https://migma.ai). Not a drag-and-drop editor — a conversational one with a lightweight visual property editor as complement.

## Product Context

Brevo is a SaaS marketing automation platform. Our users are mostly SMB marketers who need to create and send email campaigns fast. The Aura AI initiative generates emails from a prompt, but users currently have to jump into a complex drag-and-drop editor to fix anything. This conversational editor is the fast lane: talk to the AI, see the email update, export when done.

## Tech Stack

| Layer | Choice | Package |
|-------|--------|---------|
| Framework | Next.js 15 (App Router) | `next` (Turbopack) |
| Chat UI | Vercel AI SDK `useChat` | `ai`, `@ai-sdk/openai` |
| Components | shadcn/ui + Tailwind | `tailwindcss` |
| LLM | GPT-4o (migrating to Claude, see Slice 8) | via Vercel AI SDK |
| HTML parsing | cheerio (server) | `cheerio` via `/api/parse-sections` |
| State | React state | Built-in hooks |

## Layout

Two-panel horizontal split. Chat panel fixed 420px, preview takes remaining space. Desktop-only (min 1024px). Email preview in sandboxed iframe (`srcdoc`, no scripts), centered at 600px on gray background. Top bar 48px with title + export actions.

## Email HTML Constraints (for AI prompts)

1. **Table-based layout.** No flexbox/grid. Use `<table>`, `<tr>`, `<td>`.
2. **Inline styles only.** Many clients strip `<style>` blocks.
3. **No JavaScript.** Email clients strip all scripts.
4. **Absolute image URLs.** Relative paths won't work.
5. **Width via attributes.** Use `width="600"` on tables, not just CSS.
6. **Background colors via both.** `bgcolor` attribute AND inline style.
7. **Font stacks.** Web-safe fonts with fallbacks.
8. **No CSS shorthand that breaks.** Be explicit with margin/padding.
9. **Max width 600px.** Standard email body width.

## Completed Slices (1-6)

| Slice | What was built |
|-------|---------------|
| 1 | Two-panel layout, chat + live preview, AI edits full HTML, pill-shaped input with loading timer |
| 2 | Section parser (cheerio), click-to-select in preview (postMessage), chip badge in textarea, scoped AI editing |
| 3 | Visual editor mode toggle, property panel (background color, padding, text alignment), surgical HTML updates |
| 4 | Undo/redo with EditSnapshot stack (max 5, FIFO) |
| 5 | Streaming preview (blur + pulse), suggested actions (3 chips above textarea via `/api/suggestions` GPT-4o-mini) |
| 6 | Enhanced sample email template |
| 7 | E-commerce Self-Service UX (sub-element selection, image property panel, conversational UX improvements) |
| 8 | Model Migration & Granular Editing (Model migration, conversational editing, Design mode for text blocks and buttons) |
| 9 | Canvas and action toolbar (Add canvas labels, Multi-component change propagation) |

**Deferred from earlier slices:**
- GenerationContext wiring to AI prompt (Slice 5)
- Animations with Framer Motion (Slice 6)
- UI design polish (Slice 6)

## Upcoming Slices

### Slice 10 — Personalization Variables (Merge Tags)

**Goal:** Let users insert dynamic variables into emails for personalized campaigns.

- Variable picker UI — button near textarea, opens list of available variables
- `{{double_curly}}` syntax: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{unsubscribe_link}}`, etc.
- Click to insert at cursor position
- **Preview mode toggle:** template view (raw variables) vs preview (sample values)
- **Variable definitions panel:** define custom variables and preview values
- **AI awareness:** system prompt includes available variables for natural usage
- Out of scope: real Brevo contact data integration (prototype only)

## Known Issues

### Granular Element Editing (blocking — addressed in Slice 8)

Conversational editing of individual elements (text, prices, small content) fails ~60% of the time with GPT-4o. The AI duplicates elements, loses content, or breaks table structure when asked for surgical changes.

**What works:** section-level chat editing, Visual Editor for property changes.

**Current workaround:** error message when granular element is selected, guiding users to section-level or Visual Editor.

**Fallback approaches if model switch doesn't solve it:**
1. **Structured JSON output** — AI returns change instructions, client applies via DOM manipulation
2. **Hybrid approach** — AI for creative changes, form inputs for simple value edits
3. **Fine-tuned model** — trained specifically for surgical email HTML edits
4. **Component-based architecture** — emails as managed components with predictable state

### Other Issues
- **Parse-sections performance:** called on every HTML change, could debounce
- **Parse-sections errors:** occasional "Unexpected end of JSON input" (empty request body)
- **No tests:** Playwright tests not yet written