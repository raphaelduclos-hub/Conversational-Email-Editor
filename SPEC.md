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

**Deferred from earlier slices:**
- GenerationContext wiring to AI prompt (Slice 5)
- Animations with Framer Motion (Slice 6)
- UI design polish (Slice 6)
- Export functionality (Slice 4)

## Current Slice

### Slice 7 — E-commerce Self-Service UX (IN PROGRESS)

**Goal:** Transform the prototype into a usable tool for e-commerce users who need to customize marketing emails quickly.

**Status:** 7.1 complete, 7.2 partial, 7.3 complete

**1. Granular sub-element selection (complete)**
- Sub-element parser identifies headings, buttons/CTAs, images, text blocks
- Click on sub-element shows chip with element type (e.g., "H1: Welcome to our sale")
- AI editing of sub-elements disabled — returns helpful error (see Known Issues)

**2. Image property panel (partial)**
- Image selection in Design mode shows dedicated property panel
- Working: image preview, file upload (base64, max 2MB), URL field, alt text, width control (px/%), alignment
- Width updates use inline style (CSS priority over HTML attribute), images centered with `margin: 0 auto`
- Section background color targets main `width="600"` table's first `<td>` (known limitation with complex nesting)
- Pending: Unsplash integration, link URL (clickable images)

**3. Conversational UX improvements (complete)**
- Larger auto-expanding textarea (3-4 lines default)
- Context-aware inline suggestions based on selection
- Generation context notes ("Updated Hero heading")

## Upcoming Slices

### Slice 8 — Model Migration & Granular Editing

**Goal:** Switch to a more capable model to unlock reliable granular element editing (text blocks, prices, individual content) — the key limitation today (~60% failure rate with GPT-4o).

**1. Model migration**
- Switch from GPT-4o to **Claude Sonnet 4.5** (`claude-sonnet-4-5-20251001` via `@ai-sdk/anthropic`)
- Update `/api/chat` and `/api/suggestions` routes
- Verify streaming behavior and response format remain compatible with Vercel AI SDK

**2. Unlock granular conversational editing**
- Re-enable conversational editing of individual sub-elements (headings, text, buttons, images, prices)
- Remove the workaround error message from Slice 7.1
- Validate surgical HTML modifications work reliably (target: <10% failure rate)
- If still unreliable, explore structured JSON output or hybrid approach (see Known Issues)

**3. Design mode for text blocks and buttons**
- Extend the visual property panel to support text blocks and buttons (not just images/sections)
- Text blocks: inline text editing, font size, font weight, color
- Buttons: label text, link URL, background color, text color, border radius, padding

### Slice 9 — UX Polish (post-demo feedback, 2026-03-23)

**Goal:** Address usability issues surfaced during hands-on demo testing.

**1. Rethink conversational/visual mode switching**
- The sidebar toggle doesn't work well — when you've already selected an element in conversational mode, you don't think to go switch mode on the left panel
- Adopt the Migma approach: switch between conversational and visual editing directly from the conversation window
- Related: the "Visual Editor" toggle is currently not positioned below the textarea as specced

**2. Add canvas labels**
- Add visible labels/annotations on the email preview canvas so users can identify sections at a glance

**3. Fix padding controls**
- Padding property editing in the visual editor doesn't behave as expected
- Investigate and fix

**4. Benchmark Lovable**
- Study Lovable's editor UX and identify patterns/ideas worth adopting

**5. Multi-component change propagation**
- When a change should logically affect multiple components (e.g., brand color), there's no mechanism to propagate it
- Design a solution for propagating style/content changes across multiple email components

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
