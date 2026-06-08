# CHARTRIDGE — Oral Presentation: Outline, Slides & Script

**Course:** Data Visualization · **Presentation date:** 2026-06-09
**Format:** Oral, in class · **Time budget:** < 10 minutes total (includes the video demo) · **Language:** English · **Slides:** 4:3, exported to PDF · **Presenter:** one team member

> ⚠️ Fill in every `[ ]` placeholder (team number, names, student IDs, contributions, your video link) before exporting.

---

## 0. How to use this document

This pack contains three things:
1. **Slide-by-slide outline** — what to put on each 4:3 slide (keep slides sparse; the words are spoken, not printed).
2. **Speaker script** — what the single presenter says, written to be lively and timed.
3. **Video-demonstration script** — narration + on-screen actions for the < 5 min MP4 that plays during slide 7.

**Timing plan (target ≈ 9:00, hard cap 10:00):**

| Segment | Slides | Time |
|---|---|---|
| Live intro (hook → data → idea → cartridges → principles) | 1–6 | ~3:45 |
| **Video demonstration** (plays in slide 7) | 7 | ~4:00 |
| Live wrap (insights → contributions → references → thanks) | 8–11 | ~1:00 |
| Buffer | — | ~0:15 |

**Production tips:** Build slides in PowerPoint/Google Slides → **Design ▸ Slide Size ▸ Standard (4:3)** → export **PDF**. Record the demo with OBS Studio or your screen recorder at **1920×1080 (16:9)** or 4:3, add captions/narration in English, export **MP4 (H.264)**. Embed the MP4 in slide 7 *and* keep a standalone copy as a fallback.

---

## 1. SLIDE-BY-SLIDE OUTLINE (what's *on* each slide)

### Slide 1 — Title / Team
- **CHARTRIDGE** (big, pixel font) + tagline **"Insert a cartridge. Play the data."**
- Subtitle: *An interactive visualization system for the video-game sales industry.*
- **Team [TEAM #]** · Members: `[Name — Student ID]`, `[Name — Student ID]`, `[Name — Student ID]`, `[Name — Student ID]`
- Course · Date 2026-06-09
- (Visual: a screenshot of the arcade cabinet menu.)

### Slide 2 — Topic & Questions
- Topic: **Video-game sales & industry, 1980–2024.**
- The questions we set out to answer:
  - Which **genres** dominated which **eras**?
  - Do **review scores** track **sales** — where are the *hidden gems* vs *over-hyped blockbusters*?
  - How do **consoles** rise, peak, and die — and which **regions/genres** drove them?

### Slide 3 — The Data (be honest about it)
- Dataset: **Video Game Sales 1980–2024** (Divekar, 2026) — **64,016 rows**.
- Columns: title, console, genre, publisher, developer, **critic_score**, **total_sales**, **na/jp/pal/other_sales**, release_date.
- The catch (one chart/callout): `critic_score` ~10% present · `total_sales` ~30% · **both present = 4,126 games** · usable window **1995–2017**.
- **20 genres**, each its own hue, organized into **5 color families** for legibility; regions = **NA / JP / PAL / Other** (real per-region sales).

### Slide 4 — The Idea: CHARTRIDGE
- Our system's name: **CHARTRIDGE** — a retro **arcade-cabinet** OS where each visualization is a **game cartridge**.
- Why a cabinet? The chrome *carries information*: D-pad = year scrubber, buttons = region, the screen = the chart. (Tufte: chrome → controls.)
- Three coordinated views that share state — pick a region or genre once, it follows you across cartridges.

### Slide 5 — The Three Cartridges
| Cartridge | What it is | Answers |
|---|---|---|
| **HIGH SCORE** | Genre streamgraph + critic-score × sales scatter | quality vs. sales, hidden gems |
| **CONSOLE WARS** | Console-lifecycle ridgeline + year playhead | platform lifecycles, regional strength |
| **GENRE WARP** | Radial genre spiral + focus inset | genre peaks & era dominance |
- (Visual: one screenshot of each.)

### Slide 6 — Design Principles (quick, credible)
- **20 genre hues grouped into 5 families + click-to-focus** so color never works alone; colorblind mode collapses to the 5 families.
- **Position/length for quantities; linear insets** where radial hurts precision (Mackinlay; Cleveland & McGill).
- **High data density** — many marks per pixel (20 genres × 23 years in one stream; ~4,000 scored titles in the scatter) (Tufte, 2002).
- **Overview → zoom/filter → details-on-demand** (Shneiderman).
- **Coordinated multiple views** + **honest on-screen sample size** (data integrity).

### Slide 7 — Video Demonstration
- Just a title: **"Live Demonstration"** + the embedded MP4 (autoplay on click).
- (Speaker stays quiet; the video has its own narration/captions.)

### Slide 8 — What We Found (post-video recap, optional/brief)
- Japan's market leaned hard into **Story/RPGs**; the West into **Action & Shooters**.
- **PS2 → X360 → PS3 → PS4** show textbook birth-peak-death lifecycles.
- The scatter exposes **critically-loved low-sellers** (top-left) vs **big sellers reviewers disliked**.

### Slide 9 — Team Contributions
- `[Name]` — `[e.g., data pipeline & aggregation]`
- `[Name]` — `[e.g., CONSOLE WARS + shell/cabinet]`
- `[Name]` — `[e.g., HIGH SCORE linking + scatter]`
- `[Name]` — `[e.g., GENRE WARP + visual design/report]`

### Slide 10 — References
- Divekar, A. (2026). *Video Game Sales 1980–2024* [Dataset]. `[source/URL]`.
- Bostock, M. et al. *D3.js v7* — https://d3js.org
- Shneiderman, B. (1996). *The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations.*
- Cleveland, W. S., & McGill, R. (1984). *Graphical Perception.*
- Mackinlay, J. (1986). *Automating the Design of Graphical Presentations.*
- Tufte, E. R. (2002). *The Visual Display of Quantitative Information* (data density).
- Roberts, J. C. (2007). *State of the Art: Coordinated & Multiple Views.*

### Slide 11 — Thank You / Q&A
- **CHARTRIDGE** logo + "Insert a cartridge. Play the data." + team # + a "Thanks — questions?" line.

---

## 2. SPEAKER SCRIPT (the one presenter)

> Delivery notes: energetic, conversational, ~150 wpm. Pause where marked `(beat)`. Don't read bullets — tell the story.

### Slide 1 — Title  *(~0:20)*
"Good [morning/afternoon], everyone. We're **Team [#]**, and what if exploring a giant spreadsheet of video-game sales felt less like *work*… and more like switching on a console? *(beat)* That's the idea behind our system — **CHARTRIDGE**. Our motto: **insert a cartridge, play the data.**"

### Slide 2 — Topic & Questions  *(~0:35)*
"Our topic is the **video-game industry** — four decades of sales and reviews. We came in with three real questions. One: which **genres** owned which **eras**? Two: do good **reviews** actually mean good **sales** — and where are the *hidden gems*? And three: how do **consoles** live and die, and what drove them? Three questions… which became our three cartridges."

### Slide 3 — The Data  *(~0:45)*
"The dataset is Divekar's *Video Game Sales 1980–2024* — about **sixty-four thousand** rows. But here's the honest part, and it shaped everything: most of those rows are **catalog metadata**. Only about **ten percent** have a critic score, **thirty percent** have sales, and just **four thousand one hundred and twenty-six** have *both*. *(beat)* So instead of pretending we have 64,000 points, CHARTRIDGE **states its real sample size on screen**, and focuses on the trustworthy window — **1995 to 2017**. And every one of the twenty genres gets its own color — but we organize them into **five color families**, so the palette reads as five clear regions instead of twenty-color soup."

### Slide 4 — The Idea  *(~0:40)*
"So we built CHARTRIDGE as a **retro arcade cabinet**. And the cabinet isn't decoration — every part *does a job*. The **slider** is the year scrubber, the **buttons** pick the sales region, and the **screen** is the live chart. The chrome becomes the controls. *(beat)* And the three views **share one brain** — choose Japan, or spotlight RPGs, and that choice **follows you** from cartridge to cartridge. That's *coordinated views* — it makes three charts feel like one machine."

### Slide 5 — The Three Cartridges  *(~0:35)*
"Quick tour. **HIGH SCORE** links a genre **streamgraph** to a **score-versus-sales** scatter — that's our quality story. **CONSOLE WARS** is a **ridgeline** of every console's lifecycle, with a year playhead. And **GENRE WARP** spins the timeline into a **radial disc** to show which genres peaked when. You'll see all three in a moment."

### Slide 6 — Design Principles  *(~0:30)*
"A few quick design commitments. First, **color never works alone** — all twenty genre hues, but grouped into five families, plus click-to-focus to isolate one; the colorblind toggle drops it to those five safe colors. Second, where a radial chart hurts precision, we pair it with a **linear inset** — gestalt *and* exact reading. And we push for **high data density**, Tufte-style — one stream packs twenty genres across twenty-three years; the scatter, four thousand titles. Overview, then zoom and filter, then details on demand. Now — let's actually play it."

### Slide 7 — Video  *(~4:00, presenter silent)*
*(Click to play the demo. Stand to the side. Let the video's narration carry it. Be ready to advance the instant it ends.)*

### Slide 8 — What We Found  *(~0:30)*
"So what did the data tell us? **Japan** leaned hard into **Story and RPGs** while the West chased **Action and Shooters**. The consoles trace **textbook** birth-peak-death curves — PS2 handing off to X360, to PS3, to PS4. And the scatter surfaces the fun stuff: critically-*loved* games that barely sold, sitting right next to blockbusters reviewers couldn't stand."

### Slide 9 — Contributions  *(~0:20)*
"Credit where it's due: `[Name]` built the **data pipeline**; `[Name]` the **cabinet and CONSOLE WARS**; `[Name]` the **linked HIGH SCORE** views; and `[Name]` the **radial GENRE WARP** and our report."

### Slide 10 — References  *(~0:10)*
"Our data is Divekar 2026; the system is built on **D3 version 7**; and our design choices follow Shneiderman, Cleveland & McGill, and Mackinlay."

### Slide 11 — Thanks  *(~0:10)*
"That's CHARTRIDGE — three cartridges, one machine. Thanks for playing — we'd love your questions."

---

## 3. VIDEO-DEMONSTRATION SCRIPT (< 5:00 MP4, 16:9 or 4:3)

> Record the real app (`npm run dev`). Narrate live or add English captions. Keep cursor movements slow and deliberate. Target ≈ 4:00.

**[0:00–0:25] — Team & system intro (on-screen title card + voice)**
> "This is **CHARTRIDGE**, by **Team [#]** — `[Name]`, `[Name]`, `[Name]`, `[Name]`. It's an interactive visualization system for forty years of video-game sales, built with D3.js… and it boots like a game console."
*(Show the power-on screen: "LOADING MARKET MEMORY… 64,016 RECORDS · 18,922 WITH SALES · 4,126 SCORED", then the cartridge menu.)*

**[0:25–1:05] — Design of the system**
> "The screen is the chart; the cabinet around it is the controls. On the left, the cartridge slots. On the right, a live **HIGH SCORES** leaderboard. Down here, the **region** buttons and the **year** slider. And critically — whatever region or genre you pick is **remembered** as you switch cartridges."
*(Hover the rails; click a region button to show charts react; point at the leaderboard.)*

**[1:05–2:05] — CONSOLE WARS (lifecycles & regions)**
> "Let's insert **CONSOLE WARS**. Each row is a console; height is its sales that year; color is the genre that drove it; and rows are sorted by peak year — so the whole industry reads as a diagonal cascade. Press **play**, and the year sweeps forward smoothly while the side panel shows the top game each year."
*(Press ▶, let it sweep a few years.)*
> "Now watch what region does. Switch to **Japan** — and the Nintendo handhelds *swell*, glowing purple, because Japan loved **role-playing games**. Click a console to see its top titles."
*(Click TOTAL→JP; click a console row.)*

**[2:05–3:15] — HIGH SCORE (quality vs sales + the new interactions)**
> "Next, **HIGH SCORE**. Up top, the genre streamgraph shows the era hand-off. Below, every dot is a game reviewers scored — sales on a log axis, critic score going up, and the dots animate into place. It's dense, so to filter we just **click a genre group in the legend** — let's isolate **Story** — and both panels fade everything else."
*(Click the "Story" legend chip.)*
> "Top-left is the gold mine: **critically-loved, low-selling hidden gems.** To grab them, I **click and drag a box** around that corner — and the leaderboard on the right instantly becomes my selection, ranked by **critic score**."
*(Drag a marquee over the top-left cluster; show the badge + the rail updating.)*

**[3:15–3:55] — GENRE WARP (the disc)**
> "Finally, **GENRE WARP** spins the timeline into a disc — angle is the year, radius is sales, stacked by genre. Click a band to **focus** it, and a linear inset gives you the exact trend — the radial shape *and* the precise numbers together. And notice — Japan is still selected from before. One machine."
*(Click a family band; show the inset; note persisted region.)*

**[3:55–4:20] — Wrap**
> "Three cartridges, one coordinated machine — turning sixty-four thousand rows into stories you can *play*. CHARTRIDGE: insert a cartridge, play the data."
*(End on the menu or logo.)*

---

## 4. Pre-flight checklist
- [ ] Slides set to **4:3**, exported as **PDF**, all `[placeholders]` filled.
- [ ] Team number + every member's **name and student ID** on slide 1.
- [ ] Project topic, questions, data, **system name** all introduced.
- [ ] **Video embedded** (and a standalone **MP4/M4V/MOV** backup on the USB/drive).
- [ ] Video has **English captions or narration** + team info on its title card.
- [ ] **Contributions** slide filled; **References** complete with the dataset link.
- [ ] Rehearsed end-to-end **under 10:00** (time the video inside it).
- [ ] One presenter chosen; laptop audio tested for the video.