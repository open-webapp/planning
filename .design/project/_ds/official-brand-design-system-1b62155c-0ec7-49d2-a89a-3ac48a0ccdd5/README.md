# Netskope Design System

A working design system for **Netskope,** a leader in modern security and networking for the cloud and AI era. Use this skill to build well‑branded interfaces, slide decks, and prototypes that look like Netskope.

## Source materials

This system was built from official Netskope brand artifacts and a large icon export:

> - **Corporate slide template (2026)** — cover, agenda, title+content, quotes, Thank You, tables, charts, comparison, and color palettes in 3 background variants (Dark Blue, Light Blue, White).
> - **`2026-01-NS-Confidential-Slide-Template.pptx`** — the live PowerPoint template: **3 slide masters, 25 named layouts** (Cover / Title Slide / Title-only / Title & Bullets / Title+Bullets+Image / Title+Bullets+Half-Image / Blank / Quote / Thank-You × Dark Blue · White · Light Blue), 960×540 (16:9). `slides/index.html` reproduces these layouts as a **PowerPoint-style "New Slide" picker** — see below.
> - **`2021-04-Netskope Primary-Full Color-RGB.svg`** — primary horizontal logo; **`…Rev Color…`** — reversed (white) logo for dark backgrounds.
> - **241 official concept/infrastructure icons** (`*-DK-BLUE.svg` export) — the complete product & security icon vocabulary, now normalized into `assets/icons/`.

> **Note for the reader:** these source files are not all stored in the project (the PPTX decks were processed into extracted assets). Re-attach them via the Import menu if you need the originals.

---

## ⛔ Required intake step: always ask before building

Before building any **new** deliverable (deck, doc, prototype, one-pager, etc.), **always present an upfront questions form to the user**, even when the request appears fully specified with content, slide count, or format. Netskope teams expect this step on every engagement.

**At minimum, ask about:**

1. **Audience** - e.g. customer executives, technical practitioners, internal sales, event attendees.
2. **Purpose and setting** - live presentation, leave-behind, email attachment, event booth.
3. **Tone** - informational, sales-forward, technical deep-dive, executive summary.
4. **Length or duration** - slide count or speaking time.
5. **Classification footer** - which confidentiality footer to stamp on every slide:
   - 2026 © Netskope Confidential. All rights reserved.
   - 2026 © Netskope Internal Use Only. All rights reserved.
   - 2026 © Customer Confidential. All rights reserved.
   - 2026 © Netskope Public. All rights reserved.
6. **Variations** - whether the user wants layout or copy alternatives to choose from.
7. **Assets** - any screenshots, data, quotes, or customer names to include.

In addition to this minimum set, **ask 3-5 questions specific to the request at hand** - e.g. how prominently Netskope products should be named, or whether the piece belongs to a larger campaign it should match.

### Canonical form (mirror this)

Title: **"Quick questions before I build"**. Render with the structured questions form (radio pills, slider, file drop, free text), in this order:

1. **Who is the audience?** - Customer executives / Technical practitioners / Internal sales & enablement / Event attendees / Other / Decide for me
2. **How will this be used?** - Presented live by a speaker / Leave-behind or email attachment / Both / Other / Decide for me
3. **What tone should the copy take?** - Informational & educational / Sales-forward / Technical deep-dive / Executive summary / Other / Decide for me
4. **Speaking time, if presented live** - slider, 5 to 45 minutes, default 10
5. **Which classification footer?** (subtitle: "Stamped on every slide") - the four footers listed above, verbatim, as the options
6. **Would you like variations to choose from?** - No, one strong version / 2-3 options for key slides / Explore a few options / Decide for me
7. **How prominent should Netskope products be?** - Named throughout / Held to the solution slides only / Minimal / Decide for me
8. **Is this part of a larger campaign?** - Standalone piece / Part of a campaign / Other / Decide for me
9. **Any stats, customer quotes, or imagery to include?** (subtitle: "Data slides need cited sources per brand guidelines") - file upload
10. **Anything else I should know?** - free text

Questions 1-5 and 9-10 are the fixed minimum. Swap or extend 6-8 with request-specific questions as needed. A rendered reference of this form is saved at `assets/imagery/intake-form-reference.png`.

**Only skip the form** when the user is making a small edit to existing work, or explicitly says to proceed without questions. **Do not ask about visual style, colors, or fonts** - this design system already answers those.

---

## ▶ Building a Netskope deck (start here)

Decks are a first-class output of this design system. **Default to the HTML deck template** below — it's the canonical starting point. Drop to the native-PPTX generator only when the user specifically needs an editable PowerPoint file.

### 1. HTML deck template  ← DEFAULT starting point

**`slides/Netskope Deck Template.html`** is a ready-to-fork, fully on-brand deck built on `deck-stage.js` (auto-scaling 1920×1080 stage, keyboard nav, thumbnail rail, print-to-PDF). Copy it, swap the content, and you have a deck. It ships with the slide types you'll reuse most:

| Slide | `data-label` / class | Use for |
| --- | --- | --- |
| Brand Cover | `bg-grad` + `cover-full` | full-bleed ReAImagined splash |
| Cover | `bg-grad` | title + subtitle + presenter |
| Section | `bg-light` | soft light-blue section divider |
| Section Dark | `bg-grad-plain` | clean Confident-Blue gradient divider |
| Stat | `bg-white` | three metric cards |
| Bullets | `bg-white` | title + eyebrow + hex bullets |
| Quote | `bg-grad` | premium dark quote |
| Chart | `bg-white` | CSS bar chart |
| Table | `bg-white` | comparison table |
| Closer | `bg-grad` | thank-you / closing line |

- **Shared stylesheet:** `slides/netskope-deck.css` — every background, type scale, and chrome rule. It `@import`s the root `colors_and_type.css`, so all brand tokens flow through; edit the CSS here to restyle *all* decks. Backgrounds use `slides/assets/imagery/{cover,deck-bg-dark,deck-particles}.png` and logos in `slides/assets/logo/`.
- **How to build:** copy `Netskope Deck Template.html` → keep only the `<section>`s you need (duplicate/reorder freely) → replace placeholder copy → page numbers auto-stamp (skip with `data-no-pageno`). Pull imagery from `assets/`, feature icons from the 241-icon library.
- Best for: previews, web/clickable delivery, screenshots, PDF, and as the design reference for any other deck output.

There is also a layouts playground (`slides/index.html` + `slides/layouts.js` + `slides/builder.js`) reproducing the 25 native template layouts with a PowerPoint-style "New Slide" picker and in-page editor — useful for exploring layouts, but the **template above is the default starting point for an actual deck.**

### 2. Native, layout-bound PowerPoint  ← only when an editable `.pptx` is required

Generate a real `.pptx` whose every slide is bound to one of the **25 native Netskope layouts** (masters / theme / fonts intact; PowerPoint's **New Slide** still offers all 25).

- **Generator:** `slides/pptx-export/ns-pptx-generate.js` — `generateNetskopePptx({templatePath, outPath, spec})`

- **Base package:** `slides/Netskope-Blank-Native.pptx` (3 masters + 25 layouts + theme + media, no example slides) · full worked deck: `slides/Netskope-Template-Native.pptx`

- **How to use it + spec format:** `slides/pptx-export/README.md`

- **The flow:** take the user's content into a deck spec → run the generator (inside `run_script`, `eval` the file, call `generateNetskopePptx`) → emit the `.pptx`.

  ```js
  { slides: [
    { layout:'title-slide-dark', title:'…', subtitle:'…' },
    { layout:'title-bullets-white', title:'…', heading:'…', bullets:['…', {text:'…', level:1}] },
    { layout:'quote-light', quote:'…', attribution:'…' },
    { layout:'thankyou-dark', title:'Thank You' },
  ]}
  ```

- ⚠️ **Always open the result once in PowerPoint to confirm** — it can't be auto-validated from this environment (it *is* validated structurally: CRC of every part, slide→layout bindings, content-types, rels).

- **Covered:** title / subtitle / bullets / quote text, plus native tables and charts bound to layouts. Picture placeholders arrive as "click to add image" prompts to fill in PowerPoint.

Both paths pull the same foundations: `colors_and_type.css` tokens, Inter/Lora fonts, the logo, and the 241 brand icons.

---

## About the company / product context

**Netskope** (founded 2012, Santa Clara, CA) is a leader in modern security and networking for the cloud and AI era. The company's technology secures and accelerate cloud, data, and AI in real time, everywhere. Key technology in the platform include **secure access service edge (SASE)**, **security services edge (SSE), SW-WAN, zero trust**, **unified data security,** including **AI security,** and network technologies including **digital experience management (DEM).** In 2026 it launched AgentSkope, providing agentic AI to power the modern SOC and NOC.

Two product/surface contexts represented in the materials:

1. **NewEdge** — Netskope's private global network backbone (120+ data centers across 80+ regions, 220+ countries served). Represented through dense quantitative slides (PB, transactions, latency).
2. **Corporate / sales storytelling** — the 2026 slide template covers everything else: cover, agenda, title+content, quotes, thank-you, comparison tables, charts.

We were not given access to the production application UI (e.g. the Netskope admin console / SkopeAI dashboards) or the marketing website codebase. If a product UI or marketing surface is needed, iterate with the user on real screenshots, Figma, or repo access for fidelity.

---

## CONTENT FUNDAMENTALS

How Netskope writes, based on the decks:

### Voice

Our messaging and branding directly informs the way we create content.

**For the Architects of Yes:** This goes to the heart of what we do for our customers, and it is a useful reminder that all of our content needs to underpin what we do for our customers’ organizations.

- The customer, and their goals, challenges and successes, should sit at the heart (and front) of every piece of content we create.  Capture challenges and benefits of change before talking about us and our solutions.

**Powerful simplicity:** We message against bolt-ons and rally for sleek design that truly understands the goals of our customers.  We need to apply this same innovative approach to every piece of content we create.

What does powerful simplicity look like in content?

- Our content **empowers the audience**…

  - … to make informed decisions, not pass a test on the Netskope corporate line. To do this it is always truthful and specific, and does not exaggerate or obscure. All content is created from a starting point of understanding the audience’s goals. It is developed with a clear recognition of what the knowledge contained within enables the audience to do next.

- We **avoid unnecessary complication**

  - The most intelligent person in the room is able to make complicated concepts easy to understand. Our content always works to be easily understood, even when dealing with technical subjects. We can create clear and easily understood content without “dumbing it down.” We avoid the urge to pad out content unnecessary, and cut to the chase on the stuff that is valuable.

### Tone & casing

- **Title Case for slide titles** ("Title and Bullets", "Side-by-side Comparison Slide", "Inside NewEdge: Scale of Netskope Global Data Processing").
- **ALL CAPS for eyebrows / column headers** ("OPTIONAL HEADING", "COLUMN TITLE", "TITLE").
- **Sentence case for body / bullets**: bullets are short noun phrases or imperative fragments ("No budget", "Over budget", "Drive down latency").
- **Branded terms get color, not italics**: "NewEdge" appears in cyan inside titles, e.g. "Winning with **NewEdge**", "Inside **NewEdge**:". The "AI" inside "Re**AI**magined" is set in orange — a signature wordplay that **only the brand team should reproduce**, not invent new variants of.

### Person

Netskope uses an informational / conversational tone.

E.g. Avoid language that is overly formal, or unnecessarily technical.

We are down to earth, and warm. We seek to humanize and demonstrate our humanity.

E.g. Write in a way that it is evident there is a real person behind the keyboard.

Be alert to the risk of publishing generic AI copy that fails to connect with the human audience.

We are relatable experts with valuable experience that we are happy to share.

E.g. We often explain and simplify with anecdotes or examples

Netskope content is branded, or has a named author, and as such we always write in the **first person** (either singular or plural - I/my or we/our) for authenticity. When addressing the audience, **"customers"** and **"enterprises"**, rarely "you".

### Copy style

- **Headline → "Pain → Solution" structures** are common ("Pain #1: Struggling with Costs" → "Solution: Consolidate infra with SASE…"). Use this pattern when comparing competitors.
- **Concrete numbers carry the message**: "12 PB+ daily traffic", "186 Billion+ daily transactions", "11K+ adjacencies", "\~90% < 5 ms". Always pair a big stat with a one-line qualifier underneath.
- **Comparison is direct, almost competitive**: "Compared to other vendors with private infrastructure": Netskope, Zscaler, Cato, Fortinet are named outright with their numbers. Do this when the user asks for a competitive slide.
- **Footnotes & sources matter**: every quantitative slide cites a source ("Source: bgp.he.net/report/exchanges, last updated Q1 2026"). Always include a source line on data slides.
- **No emoji.** No exclamation marks. No casual filler.
- **Em dashes (—)** should never be used in Netskope content.
- When making **bulleted lists**, our house style is to always capitalize the first letter following the bullet and write the entire bulleted copy in sentence case.
- **Ampersands (&)** should only be used in short promo copy, never in prose.
- We avoid excessive **quotation marks** ("") in copy. Well known terms should not require them (e.g. shadow AI) and alternatives can be found when the sentence seems to require them for clarity.
- Always contextualize jargon and spell out **acronyms** on first reference
- **Product naming accuracy:** Netskope One platform (Netskope One); Netskope Zero Trust Engine (the Zero Trust Engine); Netskope Cloud Exchange; Netskope One Gateway; Netskope One Cloud Gateway; Netskope One Client; Netskope One Mobile Client; Netskope One Orchestrator; SASE Fabric; Hybrid Security; Netskope One SkopeAI; NewEdge Network; NewEdge AI Fast Path; Netskope One SASE; Netskope One AI Security; Netskope One Data Security; Netskope One DEM; Netskope One Advanced Analytics; Netskope One SSE; Netskope One Threat Protection; Netskope One UEBA; Netskope One Next Gen SWG (Netskope One NG SWG); Netskope One FWaaS; Netskope One DNSaaS; Netskope One RBI; Netskope One CASB Inline; Netskope One SWG; Netskope One Enterprise Browser; Netskope One CASB; Netskope One SSPM; Netskope One CASB API; Netskope One Private Access; Netskope One Private Application Access; Netskope One Private Optimized Access; Netskope One Private Unified Access; Netskope One SD-WAN; Netskope One Device Intelligence; Netskope One DLP; Netskope One DLP on Demand; Netskope One DLP for Endpoint; Netskope One DLP for AI Gateway; Netskope One DLP for Agentic Broker; Netskope One DSPM; Netskope One AI Gateway; Netskope One Agentic Broker; Netskope One AI Red Teaming; Netskope One AI Guardrails; Netskope One AI Command Center; Netskope One AgentSkope.

---

## VISUAL FOUNDATIONS

### Colors

Named palette per brand guidelines, hex values from the official 2026 theme (`Netskope-2025-DRK-BLUE`):

**Primary (the three blues):**

- **Light Blue** `#D9FAFF` — soft surfaces and backgrounds.
- **Netskope Blue** `#00A9CE` — the active mid blue: highlights, links, brand-wordmark emphasis (“NewEdge”).
- **Deep Blue** `#081A59` — dominant brand color: hero backgrounds, navigation, primary buttons.

**Secondary:**

- **Teal** `#008C95`
- **Lightning Green** `#AFF097`
- **Netskope Orange** `#FF8200` — **accent only.** Never a primary surface or extended block of color. Reserved for energy moments and AI callouts.

**Neutrals:**

- **Mono White** `#FFFFFF`
- **Netskope Gray** `#53565A` — a neutral brand gray; pure black is avoided.
- A derived UI ink scale (`--ns-ink-050` → `--ns-ink-900`) extends Netskope Gray for product surfaces.

**Gradients (four named, never modified):**

1. **Iced Blue** — Netskope Blue + Light Blue. Best legibility: Deep Blue copy.
2. **Confident Blue** — Netskope Blue + Deep Blue. Best legibility: Mono White copy.
3. **Confident Green** — Teal + Lightning Green. Best legibility: Mono White or Netskope Gray copy.
4. **Neon Green** — Netskope Blue + Lightning Green (reversible). Best legibility: Mono White or Netskope Gray copy.

Every gradient has an off-frame halo whose epicenter sits beyond the visible edge — never as a hot spot in the middle of the layout.

### Type

Two brand typefaces, both shipped locally in `assets/fonts/`:

- **Primary: Inter** — Regular (400), Medium (500), SemiBold (600). **Bold, ExtraBold, and Super weights are not permitted** for headlines per the brand guidelines. Inter Regular is the go-to weight; reserve SemiBold for emphasis runs only.
- **Secondary: Lora** (variable, weights 400–700 used at 400/500/600). Serif accent for short premium statements. **No italics, no bold** in headlines. Pair only when matched 50/50 with Inter at the **same size and weight**, on titles ≤ 5 words across ≤ 2 lines.

**Usage:**

- **Display & headlines**: Inter Regular (or Medium for emphasis), tight line-height (1.05–1.1), slight negative letter-spacing.
- **Body**: Inter Regular 16px / line-height 1.5.
- **Eyebrows**: Inter SemiBold 12px ALL CAPS, letter-spacing 0.14em, in Teal.

### Backgrounds

Four signature treatments, in order of frequency:

1. **Confident Blue gradient** — the title-slide cover and hero sections. Use `--ns-grad-confident-blue` (or the legacy `assets/imagery/title-slide-cover.png` for matching photographic feel).
2. **Solid Mono White** — default content slides.
3. **Solid Light Blue tint** (`#D9FAFF`) — section-start alternative; softens data-heavy layouts.
4. **Iced / Confident Green / Neon Green gradients** — used sparingly for variety and as backdrops behind product screens or photography.

No hand‑drawn illustrations, no painterly photography, no full‑bleed lifestyle imagery. The brand is technical and diagrammatic.

### Imagery

- **Diagrams** of network topology (clients, ISPs, data planes, IXPs) — flat, schematic, single‑color line work over white.
- **Photography**, when used, is **cool‑toned, technical, blue‑grey** — server racks, data center exteriors. Never warm, never lifestyle.

### Animation

Decks are largely static. For interactive surfaces:

- **Standard easing**: `cubic-bezier(0.2, 0, 0, 1)` (the "Material standard" curve).
- **Durations**: 120 / 200 / 320 ms (fast / base / slow). No bounces, no overshoot for utility UI.
- Subtle aurora **shimmer** on hero backgrounds is acceptable (gentle 6–10s cyan glow drift).

### Hover & press states

- **Hover**: 8% lighter on dark surfaces (`color-mix(in srgb, var(--ns-deep-blue) 92%, white)`), 4% darker on light surfaces. Cyan accents brighten to `#22D0EF`. No glow / shadow lift on most elements.
- **Press**: 2px translate down OR 96% scale; the shadow flattens to `--ns-shadow-1`.
- **Focus ring**: 2px solid `--ns-cyan` at 2px offset — never a blue browser default.

### Borders

Hairlines (`1px solid var(--ns-border)` = `#DDE0EC`). Buttons and chips: 1px borders, never 2px+. The brand reads "engineered" — restrained borders, no playful thick frames.

### Shadows

A 3‑tier system (`--ns-shadow-1/2/3`), all navy‑tinted (`rgba(8,26,89, ...)`), never neutral grey. One brand‑specific shadow: **cyan glow** for hero CTAs (`--ns-shadow-glow-cyan`).

### Corner radii

Moderate. Template instructs "Use Rounded Rectangle for boxes" → `--ns-r-md` (8px) for cards and inputs, `--ns-r-lg` (12px) for larger panels, **`--ns-r-photo` (45px)** for image frames in Hero Combo layouts (per spec), `--ns-r-pill` for tags and chips. **Hex shapes** (clip-path, 6-sided) are reserved for data-center markers / scale icons.

### Cards

- 1px border (`--ns-border`).
- 8–12px radius.
- `--ns-shadow-1` resting; lifts to `--ns-shadow-2` on hover (only on interactive cards).
- Padding: 24px standard (`--ns-s-5`).
- Section eyebrow → big metric → 1‑line qualifier is the canonical card content pattern (mirrors the deck).

### Transparency & blur

Used sparingly. Acceptable: 8–12% white overlays on the navy aurora background to layer cards. Backdrop blur (`backdrop-filter: blur(20px)`) only for floating UI on the navy background (e.g. header chip on hero). Avoid frosted-glass tropes on white.

### Layout

- **Generous whitespace** on slides — Netskope decks breathe; they're not Edward Tufte but they aren't Apple either. Slide titles get the top 1/3.
- **8‑col grid** for slide content; **12‑col** for web/UI.
- Logo placement: **top‑center on cover**, **top‑left on internal slides**, with a thin cyan rule under it.
- Confidentiality footer: small, bottom‑center on every slide. Never omit on internal decks.

---

## ICONOGRAPHY

Netskope ships an official **concept & infrastructure icon library** — 241 single-line icons covering the entire product/security vocabulary (CASB, SSE, ZTNA, DLP, SWG, NewEdge, threat types, network gear, deployment concepts). These are the **primary, canonical iconography** for the brand and are now part of this system in `assets/icons/`.

### The brand icon set (`assets/icons/` — 241 icons)

- **Style**: single-weight **line/outline** icons, drawn on a **55×55 viewBox**, all in brand **Deep Blue `#081A59`** with a **1.8px stroke**, rounded caps & joins. Clean, technical, engineered — never filled silhouettes, never two-tone, never duotone gradients.
- **Naming**: kebab-case, semantic (e.g. `casb.svg`, `ztna.svg`, `data-loss` → `dlp.svg`, `next-gen-swg.svg`, `remote-user-1.svg`, `new-edge.svg`, `generative-ai.svg`). The source filenames (which carried a `-DK-BLUE` / `DRK-BLU_` color suffix) were normalized; see `assets/icons/_manifest.json` for the full **source → clean-name** map.
- **Browse them all**: open **`icon-index.html`** at the project root — a searchable gallery of every icon. The compact specimen lives in `preview/brand_icons.html`.
- **Usage**: reference directly as an `<img>` — `<img src="assets/icons/ztna.svg" width="48">`. The dark-blue stroke is baked in (presentation attributes, not a `<style>` block, so they survive SVG sanitizers). They sit naturally on white, Light-Blue `#D9FAFF`, and other pale surfaces. **On dark/navy surfaces** they disappear — recolor by inlining the SVG and swapping `stroke="#081A59"` for `#FFFFFF` / Light Blue / cyan, or wrap in a pale chip.
- **Sizing**: 40–64px in cards and feature grids; 32–40px inline with headings. Keep them comfortably padded — these are illustrative concept icons, not dense 16px UI affordances.

### Small UI utility icons (substituted)

The 241-icon set is illustrative/conceptual; it does **not** cover tiny product-chrome affordances (search, chevron, close, bell, kebab menu, sort arrows). For those we substitute **Lucide** (`https://unpkg.com/lucide@latest`) at \~1.75px stroke — its geometric, cool line style matches the brand set. ⚠️ **Flagged**: if Netskope's product team uses a specific chrome icon library (Material Symbols, custom set), swap it in.

```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
<i data-lucide="search"></i>
```

### Logo & rules

- **Logo**: vector SVG only — full color (`assets/logo/netskope-logo-primary.svg`) and reversed white (`assets/logo/netskope-logo-reversed.svg`). The "atom" mark may be used solo at small sizes (≥ 90px digital min).
- **No emoji**, **no Unicode "icons"** (★, ✓, →), **no hand-drawn SVG**. If a concept icon exists in `assets/icons/`, use it; for chrome use Lucide.

---

## Index — what's in this folder

```
README.md                  ← you are here
SKILL.md                   ← Agent Skill manifest (cross-compatible w/ Claude Code)
colors_and_type.css        ← all CSS vars (color, type, spacing, shadow, motion)
icon-index.html            ← searchable gallery of all 241 brand icons

assets/
  logo/                    ← primary + reversed Netskope wordmarks (SVG)
  imagery/                 ← title-slide cover, world map, brand backgrounds
  fonts/                   ← Inter (Regular/Medium/SemiBold) + Lora variable, served locally
  icons/                   ← 241 official concept/infra icons (kebab-case .svg, #081A59)
                             + _manifest.json (source→clean-name map)

preview/                   ← cards rendered into the Design System tab
  type_*.html              ← typography specimens
  color_*.html             ← palettes & semantic tokens
  spacing_*.html           ← scale / radius / shadow
  comp_*.html              ← buttons, inputs, cards, badges, tabs
  brand_*.html             ← logos, gradients, icon set

slides/
  Netskope Deck Template.html    ← ★ DEFAULT deck starting point (deck-stage.js based)
                                   Brand Cover · Cover · Section · Section Dark · Stat ·
                                   Bullets · Quote · Chart · Table · Closer
  netskope-deck.css              ← shared deck stylesheet (imports ../colors_and_type.css)
  deck-stage.js                  ← auto-scaling 1920×1080 stage: nav, thumbnails, print-PDF
  assets/imagery/{cover,deck-bg-dark,deck-particles}.png  ← deck backgrounds
  assets/logo/                   ← logos referenced by the deck template
  index.html               ← layouts playground (builder) — explore the 25 native layouts
  layouts.js               ← "New Slide" layout picker (PowerPoint-style master/layout)
  builder.js               ← in-page editor (drag, resize, text, image-drop, undo)
  image-slot.js            ← drag-and-drop image placeholder web component
  Netskope-Blank-Native.pptx     ← NATIVE PowerPoint starter: 3 masters + 25 layouts +
                                   theme + fonts + 1 Cover slide. Open it and PowerPoint's
                                   "New Slide" offers all 25 Netskope layouts natively.
  Netskope-Template-Native.pptx  ← full native template incl. all 38 example slides
  pptx-export/             ← content → native layout-bound .pptx generator + README
                           25 layouts in 3 families (Dark Blue / White / Light Blue):
                           Cover, Title Slide, Title-only, Title+Bullets,
                           Title+Bullets+Image, Title+Bullets+Half-Image, Blank,
                           Quote, Thank-You — plus utility layouts (Table,
                           Side-by-side, Three-column, Bar Chart, Color Palette,
                           Basic Shapes). 1920×1080 (16:9).

uploads/                   ← original upload files (kept as source-of-truth)
```

---

## Caveats

- **Brand guidelines reconciled with the official PDF + theme.xml.** Color names and gradient definitions are canonical. Hex values come from `theme1.xml` of the 2026 corporate template.
- **Fonts shipped locally.** Inter and Lora `.ttf` files live in `assets/fonts/` and are wired up via `@font-face` in `colors_and_type.css`. No Google Fonts dependency for brand type.
- **Brand icon library is real & complete.** 241 official concept/infrastructure icons in `assets/icons/`, normalized to Deep Blue `#081A59` line style. Only tiny product-chrome affordances (search/chevron/close) fall back to **Lucide** — swap if Netskope's chrome set is known.
- **Icon styling note.** Source SVGs shipped with empty `<defs>` and `class="cls-N"` (no class definitions), so they'd render as black silhouettes. We baked the stroke style onto each element as presentation attributes (`stroke="#081A59"`…) rather than a `<style>` block, because the asset pipeline sanitizes `<style>` out of SVGs.
