# DIRECTION SHEET — Type and nothing else
seed 2145826622 · drawn 2026-10-30 · redraws: 2 · sector personal-portfolio · tone technical
Brief: AI engineer who ships production LLM systems, formerly full-stack and cloud

| | |
| --- | --- |
| Direction | Type and nothing else |
| Hero | Void, then statement on axis |
| Type | Newsreader |
| Colour | Teal on paper |
| Sections | work (Quiet ledger, side preview) → about (Two columns, highlighted words) → how-it-works (Itinerary on a slip) → proof (Names as one sentence) → contact (Address in display rows) |
| Motion | Masked headline |
| Photographs | the "Mountain" set, as atmosphere |

This is the direction for this build. Adopt it. Do not blend it with the layout you would have made anyway,
and do not redraw because it is unfamiliar: unfamiliar is the point. Redraw a slot only when it conflicts
with a stated brand constraint or needs an asset that does not exist, and say why in your report.

The parts of this sheet were written separately and will disagree in small ways. Settle every disagreement in this order:
**house rules** (including type no smaller than 13px and body text of 16px or more) → **the direction** (the idea, the composition habits, where the
one accent goes) → **the type system and the palette** (which face does which job, the five size steps, which colour is the ground and where the
accent goes) → **the hero blueprint** → **the section blueprints**. Under each blueprint below, "Adjusted for this page" lists where it disagrees.
In practice: take geometry from blueprints (columns, proportions, what sits where) and take everything else from above them. Map every size a
blueprint names onto one of your five type steps instead of adding a sixth. Use one button shape, one corner radius and one pair of page margins on
the whole page, whatever individual blueprints say. If a blueprint names a kind of typeface (a light serif, a heavy grotesk), use the dealt face.

## 1. The idea
The first screen is made only of words, colour and space, good enough that nobody misses a picture there. Pictures arrive later, large and few, as relief from the type. This is the honest answer when a subject has nothing worth photographing: instead of inventing illustrations, set what you have to say as well as it can be set. The typography carries a point of view through scale (one enormous statement, everything else small), through measure (a narrow, bookish column or a full-width line), and through one committed colour.

Before anything else, write one sentence in your notes: "On this page, <the subject's own material> becomes <the device>."
Fill the first blank from your inventory of what only this client has (its name and what it means, its street, its numbers, its
constraint), then put the nearest competitor in the sentence: if it still works, the idea is the category's, not the client's.
Then name the one live thing the visitor can do on the page (SKILL.md step 4).

## 2. Composition
First screen: the statement, two lines at most, set at 9–14vw and occupying the full width with tight leading, positioned in the upper two-thirds. One supporting sentence at 20–24px sits bottom-left on the same margin and the single action sits bottom-right on the same baseline. No navigation bar; two or three links in a top corner. Sections that follow are typographic set pieces, each different: a list of five to eight capabilities set at 4–6vw one per line; a paragraph at 28–36px in a 28ch column pushed to the right half; a pair of large numerals with a sentence each; a single quotation filling a colour field. Each section uses a different horizontal position (left, right, full) so the page has movement without imagery.

## 3. Type — Newsreader
One news serif with optical sizes: light and very tight when huge, open and bookish at 18px. Suits long-form stories, culture pieces, journals and research write-ups.
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap" rel="stylesheet">
```
- Display: **Newsreader** — weight 300 with optical sizing on · tracking -0.05em · leading 0.9 · sentence case at 12–14vw; chapter headings drop to the text weight at about 30px
- Text: **Newsreader** — 400 for body, 500 for emphasis, italic for titles · leading 1.6 · tracking 0
```css
:root {
  --step-small: clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem);
  --step-body: clamp(1.125rem, 1.05rem + 0.3vw, 1.3125rem);
  --step-lead: clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);
  --step-head: clamp(2rem, 1.3rem + 3.2vw, 4rem);
}
```
This direction lives or dies on the face and its settings. Display at tight tracking and leading; text sizes few and far apart (for example 15, 22, 34 and the display size). Use real typographic detail: proper quotes, balanced line breaks, hung punctuation where it helps.
The direction decides sizes and how many of them; the type system decides how this face is set. Where the two give different tracking or leading, use the values of the type system: they are tuned to this face.
The display size itself comes from the hero blueprint below.

## 4. Colour — Teal on paper
```css
:root {
  --bg: #f7f9f8;
  --surface: #ebf0ee;
  --ink: #06525c;
  --muted: #2f737d;
  --accent: #06525c;
  --accent-ink: #f7f9f8;
  --field-1: #06525c;  --field-1-ink: #f7f9f8;
}
```
Cool white paper and a single teal used for every word, shape and button, with no black anywhere. The accent is that same teal filled solid, for the button and for one inverted band with paper-coloured type.
Either one saturated ground for the whole page with a single ink, or paper and ink with one section inverted and one in the accent as a full field. Colour does the job images would have done.

## 5. Imagery
**The project has no photographs of its own yet.** First choice: **real pictures of the subject's world from the open collections**: its city and street in old postcards and photographs, an old map of the neighbourhood, its materials up close, its trade in engravings, museum objects of its kind (references/imagery.md §3). Start with `node C:/Users/CARDONA/Desktop/personal/.agents/skills/design-taste-frontend/scripts/assets.mjs "engineer"`, then queries from your inventory (its street, its materials, its trade's tools and history). Download what you use into the project with `--get` and credit every one on the page (`--credits` prints the footer line). They show the world around the client, never the client's own room, dish, product, person or team. Second, for what no honest picture exists of: draw the subject's own things in code, large, in one flat graphic language and the palette's real colours (its tiles, its windows, its objects; references/imagery.md §8). Third: the dealt photographs, only where an honestly generic picture fits (the sea, the weather, a material), never one a visitor could take for the thing itself and never an unrelated scene. One treatment for all of them. If this direction is built on photographs, plan the set before building (four to six pictures of one family) and reuse them at different crops and scales instead of finding or drawing a new picture for every slot; keep drawings as `<symbol>` + `<use>` or generate them with a small script so the page stays light. List every found picture (with its source and licence), every dealt photograph and every drawing that stands in for photography in your report.

The first screen has no picture. Further down, real pictures of the subject's world (found with scripts/assets.mjs) arrive large and few: a full-bleed photograph between two type sections, a looping clip in one band, an archival image beside a list. Do not add icons, shapes, patterns or abstract graphics to compensate for anything.

**Floor (the inspector checks it):** at least four real pictures on the page, usually six to twelve; SVG drawings do not count. One moving picture where an honest clip exists: `node <skill>/scripts/assets.mjs --video "<query>"`, used as a muted loop with a poster frame. Whatever this direction says about pictures, it is carried out with real ones.

Photographs dealt for this build, from the "Mountain" set (peaks, alpine valleys, snow and rock)
Order of preference for imagery: (1) the project's own photographs and product shots; (2) images you generate, if an image tool is
available; (3) real pictures of the subject's world found in the open collections (assets.mjs, downloaded and credited on the page);
(4) drawings of the subject in code; (5) these. They are real photographs (Unsplash licence, served by picsum.photos) of places, light and
texture. They are atmosphere, never a stand-in for a specific product, dish, person or interface. List the ones you use in your report so
they can be replaced.
- `https://picsum.photos/id/866/1600/1000` — Snowy mountain peak behind a snow slope under pink-tinted clouds · mid tone · dusky blue, soft pink, white · calm area: top · native landscape · photo: Samuel Zeller
- `https://picsum.photos/id/426/1600/1000` — Layered blue mountains and a hazy valley under streaked clouds · mid tone · slate blue, teal, pale grey · calm area: top · native landscape · photo: Ales Krivec
- `https://picsum.photos/id/591/1600/1000` — Jagged rock pinnacle rising through swirling white cloud · light tone · white, grey, tan · calm area: left · native portrait · photo: Billy Onjea
- `https://picsum.photos/id/66/1600/1000` — Lone mountain peak beyond open grassland under heavy grey cloud · mid tone · grey, olive green · calm area: top · native landscape · photo: Nicholas Swanson
- `https://picsum.photos/id/918/1600/1000` — Rocky peak wrapped in sunlit cloud above a forested valley · mid tone · warm gold, dark green, grey brown · calm area: top · native landscape · photo: David Marcu
- `https://picsum.photos/id/809/1600/1000` — Rocky mountain peak breaking through thick white clouds · light tone · white, slate grey, blue grey · calm area: left · native landscape · photo: Namphuong Van
- `https://picsum.photos/id/565/1600/1000` — Snowy peak veiled in cloud with birds crossing a white sky · light tone · white, pale grey, dark brown · calm area: top · native landscape · photo: René Reichelt
- `https://picsum.photos/id/906/1600/1000` — Sunlit snowy pyramid peak against a clear blue sky · mid tone · sky blue, white, dark slate · calm area: top · native landscape · photo: Andras Toth
The last two path numbers are width and height: request the exact crop you render (`/1200/1500` for a 4:5 portrait, `/2400/1350` for a hero) and
add `?grayscale` to desaturate. Use three to six of them, not all eight. Always set `width`, `height`, `alt` and `loading="lazy"` (not on the hero image).
Other sets that fit this brief: fog-and-quiet, architecture, sky-and-space, object-still — `node draw.mjs --photos <set>` prints one in full; `--photos list` shows all sets. Taking photographs from another set is your call and is not a redraw; keep them to one light and one treatment.

## 6. Hero — Void, then statement on axis
A deliberate void: the upper 60% of the viewport holds nothing but the top row. That row, 44px from the top on 48px margins, has the wordmark at the left margin, two text links starting exactly on a vertical axis at 42% of the width, and the single action at the right margin as a text link. Everything else hangs from the same axis in the bottom third. The statement starts on the 42% line: two lines at clamp(56px, 6.6vw, 104px), regular or medium weight, tracking -0.04em, leading 0.95, running towards the right margin, with its last baseline 72px above the bottom edge. Left of the axis, in columns 1-4, one supporting sentence at 18px in the soft ink, max 32ch, is bottom-aligned to the statement's last baseline. Nothing sits in the left zone above it. No image and no shape; the ground is one flat tone and the ink one colour. The emptiness is composed: three elements share the axis, so the blank area reads as intended and not as a page that failed to load.

On a phone: The axis collapses to the 20px left margin. The top 48% of the screen stays empty under the wordmark row. The statement sets at 12.5vw on two lines, flush left, followed by the sentence at 17px and the action as a text link, the whole block ending 28px above the bottom edge. The two links fold behind a menu word.
Headline: A 3-6 word statement, at most 30 characters over two lines, about 15 per line at 6.6vw from the axis.

Adjusted for this page:
- It sets a sentence large over several lines: jurors read that as a long headline. Either cut it to a two-line headline at display size, or keep it a statement at 36px or less on three lines (24px, four lines on a phone).
- Its action is a text link: the primary action on the first screen is a real button (filled or solid-bordered, 44px or taller), placed where the blueprint puts the link. A second action may stay a link.

## 7. Sections, in order
Each is a composition to rebuild with this project's content. Keep the geometry; change the subject. Re-order or drop a
section when the argument of the page needs it (see references/copy.md), never to fall back to a card grid.

### 1. work — Quiet ledger, side preview (list)
A plain ledger in one column 560px wide whose left edge sits at 22% of the viewport width. A heading of two or three words at 24–28px in medium weight, then 32px of space, then one row per project, 44px tall: the name at 16px in full ink at the left, the kind of work at 14px in the soft ink starting at 55% of the column, and the year right-aligned with tabular figures. Nothing is drawn between rows; the three fixed starts make the columns. Hovering or focusing a row keeps it in full ink, drops the others to the soft ink, and shows that project's image in the empty area right of the column: a 4:3 frame 300px wide, `position: absolute`, its top aligned to the hovered row, 64px from the column's right edge, appearing with a 150ms fade. Holds 6–20 rows; group by year with 28px of extra space.
On a phone: The column fills the width with 20px margins. Rows are 52px tall: name at the left, year at the right, kind of work on a second line at 13px. There is no hover preview; instead the first three projects each show a 16:10 image at full column width above their row.

### 2. about — Two columns, highlighted words (statement)
The story is set as text far larger than anything else on the page: 110–160 words at clamp(22px, 2.1vw, 32px), tight leading 1.18, in the soft ink, flowing through two columns that fill the full width between 24px margins (`columns: 2; column-gap: 32px`, justified, with hyphenation on). No heading. The name at the start is in full ink. Six or seven single words or short phrases carry a flat highlighter background in three or four palette colours, built with an inline `background-color`, `box-decoration-break: clone` and 0.1em of horizontal padding; they mark the facts a scanning reader wants (a place, a year, a client, a skill). The final short sentence is highlighted entire in the strongest colour and is the link to contact. Padding 120px top and bottom. No image and no portrait.
On a phone: One column at 20px, left-aligned and unjustified, leading 1.25, with 18px margins. Keep four or five highlights so no line carries two. The final highlighted sentence sits on its own line with 24px above it and works as a full-width tap target.

### 3. how-it-works — Itinerary on a slip (table)
The process is printed as an itinerary or receipt. One paper-coloured slip 420–480px wide stands on a contrasting flat ground at columns 7–11; its bottom edge is a zigzag cut with clip-path and its top edge is straight. The heading, two to four words at clamp(40px, 4.4vw, 68px), sits in columns 1–5 with a 30ch paragraph, top-aligned with the slip. On the slip, in the text face at 16px with tabular figures: stages grouped under time headings that carry the order ('Monday', 'Midweek', 'Friday'), each heading in bold with 28px above it. Under a heading, two to four rows; each row has what happens on the left, a duration or time on the right, and a leader of round 4px dots between. The final row is inverted, paper-coloured text on a full-width ink bar 44px tall, and states the result: what the reader holds at the end and the total time.
On a phone: The heading and paragraph come first. The slip follows at full width minus 16px margins, keeping its zigzag bottom edge. Rows keep left text, dots and right value on one line; long descriptions wrap under the left text. The inverted final row stays full width.

### 4. proof — Names as one sentence (statement)
Client, press or partner names are written out as one run-on sentence and set large: clamp(40px, 5vw, 76px), leading 1.0, flush left across all twelve columns, wrapping naturally over five to seven lines. Names are separated by commas and the list ends with a full stop. All names are set in a dimmed ink (still at least 3:1 against the ground), so the block reads as texture; one name at a time is lit in the full ink, and the lit name moves through the list every two seconds (a class toggled by a short script, with a 400ms colour transition). The sentence opens with two or three plain words in the full ink that act as the heading: the phrase that introduces the names. Nothing else is in the section: no logos, no columns, and 120px of space above and below.
On a phone: The same sentence at 9vw, wrapping over ten to fourteen lines; cut the list to the twelve strongest names so it stays within one and a half screens. The lit name still cycles. Margins are 20px and there are no other elements.

Adjusted for this page:
- It names a kind of typeface: use the dealt faces (display Newsreader, text Newsreader) and their settings; capitals only where the type system sets them.
- It sets a sentence large over several lines: jurors read that as a long headline. Either cut it to a two-line headline at display size, or keep it a statement at 36px or less on three lines (24px, four lines on a phone).

### 5. contact — Address in display rows (list)
The contact block is a stack of five full-width rows, every one set at the same size, clamp(44px, 6vw, 88px), regular weight, left-aligned with a 20px inset and leading 1.0: the building or venue name, the street, the city with postcode, the opening hours as one compact line, the phone number. Each row is about 150px tall with the text sitting in its lower third; rows are told apart by alternating two flat tones of the section colour as full-width bands, or by 28px of space alone. A sixth row holds a one-word greeting at the same size followed, 24px to its right and centred on the x-height, by a solid round button 0.9em across with an arrow, which opens the email or booking link. Street and phone rows are links (map, call). No heading and no form. Optionally, one small round photograph sits at the right end of the first row.
On a phone: Rows at 9.6vw with 16px insets, about 84px tall; the hours break onto two rows (days, then times). The greeting row becomes a full-width band in the accent colour with the round arrow button at its right end, 56px across.

## 8. Motion — Masked headline
On load, each line of the headline rises from behind its own baseline, about 900ms with a strong ease-out, the second line 110ms after the first; the supporting sentence and the action then fade up together. Nothing else on the page performs. Because headlines are two lines at most, you author the line breaks and wrap each line yourself. Recipe: 'Masked line reveal' in references/motion.md.
This is the signature move, the one loud moment. Around it the page still needs the rest of the motion layer (SKILL.md step 9): an entrance for the parts of every section, feedback on every control, and one moving picture. The inspector fails a page that barely moves. Recipes: references/motion.md.

## 10. Where the richness comes from
Scale contrast and colour mass. A capability list set at 5vw is an image in its own right.

## 11. How this direction goes wrong
Without pictures, weak copy has nowhere to hide: write real sentences. Vary the set pieces; four sections of big-heading-plus-paragraph is a text document, not a design. Keep all headings within two lines.

## 12. Real references
Studied sites that work this way. Take the principle, never the specifics: no names, copy, images or signature assets of theirs.
- **Spatial** (One Page Love, studied score 7.7) `opl-spatial`
  Idea: Typography behaves like sound in a room: plain black statements swell, stretch and bend through an empty white viewport as you scroll.
  Hero: A white viewport holding only the festival dates: two centred lines in Neue Haas Grotesk Roman at roughly 6.7vw, black, tight leading, sitting at the exact vertical middle and spanning about half the width. Large empty fields above and below; no image, no button, no supporting copy. The header is the only other element: a light uppercase wordmark with tight tracking flush to the top-left corner at a 20px inset, and nine small bold uppercase links in a row across the top right. Mobile is the same poster at 40px with a two-line hamburger.
  Worth taking: Open with a single factual line (the dates) centred on an otherwise empty white screen instead of a branded hero.
- **bleibtgleich’26** (Awwwards Site of the Day, studied score 7.5) `aww-bleibtgleich26`
  Idea: One thin vertical rule runs down the page and a tight bold grotesk sentence wraps around it, words stepping from one side of the line to the other.
  Hero: White page, black type. Content sits in a narrow band between 26% and 68% of the width. A 1px vertical rule drops from the top edge at 37% for two-thirds of the height. Left of it: a black blob avatar at the top, a tiny role caption at its foot. Right of it: a tiny location note at the top, the name in two lines of 90px medium grotesk at the bottom. The tagline continues below at the same size, flush to the band's left edge, running past the fold. The upper half is otherwise blank. The handle is split into two pale-grey words fixed in the bottom corners; a black menu pill sits top-right.
  Worth taking: Draw one 1px vertical rule and typeset a large sentence around it, alternating words to either side so the line becomes the text's spine.
- **Belen Jones** (One Page Love, studied score 7.2) `opl-belen-jones`
  Idea: The whole portfolio is one screen: a slowly turning 3D box skinned with project footage behind a floor-to-ceiling list of outlined client names.
  Hero: One viewport, no scroll. A flat pastel field (periwinkle on load) with a large black-edged 3D box, about half the viewport wide, rotating right of centre; each face shows a project film still. Over everything, nine project names are stacked flush-left from top edge to bottom edge in an ultra-bold extended sans at 7.6vw, caps, drawn as thin outlines only, lines almost touching; the active name is filled solid. Two small white pill buttons sit top-right; a two-line mono location and clock bottom-right. On first load only the box is visible, drifting in from the right with its texture mirrored, before the list appears.
  Worth taking: Set a project list as outline-only giant caps over the media and fill just the active line, so the list is both navigation and texture.
Full notes on any of them: `node draw.mjs --site <id>`.

## Always
Headlines two lines or fewer at every width. No eyebrow labels, no monospace, no 01/02/03, no thin rules, no gradients, no shadows at rest,
no cream-and-terracotta, no violet. The frame: one h1 on the first screen that says what this is, equal outer margins, no
section huddled on one side with the other half empty, no blank stretch over half a screen, a heading on every section.
`inspect.mjs` measures all of it.

Saved to C:/Users/CARDONA/Desktop/portfolio-work/professional-evolution-portfolio-wt-redesign/.taste-skill/direction.json · reprint with `node draw.mjs --show`

---

# RUN NOTES — this build (appended after the deal)

## Redraw log (2 redraws, each with a stated reason)

1. **Palette redraw** (`--redraw palette`; dealt "Candy chapters" → redrawn to "Teal on paper", then resolved below).
   Reason: stated brand constraint conflict. The live site is dark-first (evolution milestone
   2026-10-07, "Dark-first theme foundation … keeping the dark-first default") and the approved
   redesign plan (Task 3, Step 2) mandates deep-gray surfaces (`bg #0a0a0a`/`#111`, surface
   `#1a1a1a`, raised `#222`) with one non-cyan accent. The redraw dealt "Teal on paper"
   (`#f7f9f8` paper ground, single teal `#06525c`), which conflicts with two stated constraints
   at once: it is a light palette (dark-first brand) and its one colour is teal (the plan bans
   the "cyan/teal generic accent"). With both dealt palettes conflicting with stated
   constraints, the skill's rule applies: keep the dealt **proportions** and take the colours
   from the subject's stated constraint. See "Palette resolution".

2. **Section redraw** (`--redraw section:work=work-quiet-ledger-preview`; dealt "Book-spine index").
   Reason: the dealt blueprint assumes 20–40 project names; this subject has 5 projects, each
   carrying paired boundary lists (demonstrates / does not demonstrate) plus evidence pointers.
   Five 34px spines would leave the section huddled on one side over mostly empty ground
   (frame violation), and a spine cannot hold the paired-list content. "Quiet ledger, side
   preview" holds 5 rows with the full project names at text size, and its side-preview slot
   carries the paired lists and the evidence pointer (the live thing, below). It also echoes
   the subject's own artefact (the audit ledger / evidence record) and keeps Work's composition
   distinct from Proof's large-name sentence.

## Palette resolution — proportions kept, colours from the subject's stated constraint

Keep the dealt proportions (one ground, one ink, one accent reserved for the action, surfaces
separated by flat tone steps, one full-width field change allowed, no lines between surfaces)
and map them onto the dark-first brand colours the plan mandates:

```css
:root {
  --bg: #0a0a0a;      /* deep gray ground, not pure black — plan Task 3 + dark-first brand */
  --surface: #1a1a1a; /* tone step, not a line */
  --raised: #222222;  /* tone step */
  --ink: #f2efe6;     /* full warm-paper ink, not soft grey (≈16:1 on --bg) */
  --muted: #a8a29a;   /* secondary notes (≈7:1 on --bg) */
  --accent: #f53fd6;  /* magenta, from the dealt Candy chapters palette ("kept for buttons alone") */
  --accent-ink: #0a0a0a;
  --field-1: #f2efe6; /* one inverted paper band, dark ink — the page's one deliberate rest */
  --field-1-ink: #0a0a0a;
}
```

- The accent `#f53fd6` comes from the dealt palette (Candy chapters: "Magenta is kept for
  buttons alone") — the only dealt accent that is neither the banned teal/cyan nor violet. It
  appears on the primary action and, at most, one other thing (the live thing's active state).
- The warm paper ink (`#f2efe6`, not sterile white) pairs with Newsreader: newsprint at night,
  the typography of record — which is this subject's material.
- Sections change field by tone step (`#0a0a0a → #1a1a1a → #222`); one section may invert to
  the paper band (`#f2efe6` ground, `#0a0a0a` ink), preserving "Teal on paper"'s
  one-inverted-band proportion in the dark.
- Verify contrast in Task 3 with the inspector: ink and muted on all three grounds; the accent
  as text only at sizes that pass AA.

## The idea (step 6)

> **On this page, the evidence boundary — every claim paired with what it demonstrates, what it
> does not, and where to check it — becomes the typographic set piece: the claim set at display
> size, its evidence set at text size on the same axis, where a picture would have gone.**

Competitor test: substitute the nearest real competitor — the plan's reference AI-engineer
portfolios (Eugene Yan, Chip Huyen, Lilian Weng). They set claims (essays, project titles,
book notes) but pair none with an explicit does-not-demonstrate list and an evidence-record
pointer. The paired boundary lists with evidence IDs (`ev-*-repository`,
`claim-*-reproduction`) and commit-SHA citations exist only in this subject's case studies
(`case-studies/*.md`, `data/evidence.json`). The sentence fails for them; the idea belongs to
this subject. ✓

Where it shows: the hero (statement = the claim; supporting sentence = the evidence rule on
the same axis), the work ledger (row = claim; side panel = boundaries + evidence pointer), the
itinerary slip (milestone = row; evidence link = the right-hand value), the proof sentence
(the evidence list itself as texture), the contact rows (the address is a set of URLs).

## The one live thing: "Flip the claim"

Every project row in the Work ledger carries its real paired lists. On desktop, hovering or
focusing a row opens the side panel beside it: the claim's "This demonstrates" and "This does
not demonstrate" lists plus its evidence pointer (repository, evidence-record ID). On a phone,
each row is a 44px-tall tap target that expands the two lists in place. Plain fallback without
script: the paired lists are real content in the HTML inside native `<details>` elements —
nothing is hidden from a no-script reader, the keyboard, or a screen reader; script only
animates and syncs the desktop side panel. It never blocks reading, and it is one thing: the
visitor performs the evidence check themselves, which is the page's whole argument.
