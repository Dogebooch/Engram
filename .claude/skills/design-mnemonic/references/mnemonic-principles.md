# Picture-mnemonic principles (the evidence base)

Load this when you want the *why* behind a design choice, or a fully worked scene to copy. The
SKILL.md method is the operational version of what's here.

---

## 1. Phonetic encoding — the keyword method

A board term (drug, enzyme, pathogen, syndrome) is abstract and unpicturable. The **keyword method**
(Atkinson & Raugh, Stanford 1975) makes it concrete in two linked steps:

1. **Acoustic link** — break the term into phonetic chunks and map each chunk to a concrete keyword
   that *sounds like* it. `albuterol` → "Albu-**TROLL**"; `famotidine` → "Fa-**MOAT**-idine";
   `vasopressin` → "**VASE**-press-in".
2. **Imagery link** — tie the keyword object to the meaning through an **interactive** image, not a
   label sitting next to it. The duck doesn't stand by a pot; it *hides its head under* the pot.

Original result: 88% recall with the method vs 28% free-study. It works because of **dual coding**
(Paivio) — a verbal trace and a visual trace stored on independent channels recall better together
than either alone.

**Rules.** A weak keyword or a vague image kills the effect — push for a *specific, concrete,
drawable* object. Encode the whole term, not just the first syllable (`anaphylaxis` → **ANA**conda +
**PHYL**o scales + **AXE**s, not just "anaconda"). Prefer keywords that can *act*: a troll can chase,
a moat can block — props that just sit there waste the image.

Sources: [memory-improvement-tips](https://www.memory-improvement-tips.com/keyword-method.html),
[ifioque](https://www.ifioque.com/psyche/keyword-mnemonic).

---

## 2. Make the image act out the fact — interaction beats co-location

Three classic levers for visual associations are **interaction, vividness, bizarreness** — and
**interaction is the strongest** for paired-associate learning. An image where the items *do
something to each other* encodes the *relationship*, which is usually the testable part.

- A beta-blocker should be **blocking** a receptor-door, not standing near it.
- An enzyme inhibitor should be **jamming** the machine, not labeled "inhibitor."
- The disease is a **villain** doing harm; the drug is a **hero** stopping it. The *verb* between them
  is the mechanism you're testing.

This is also enactive/generative encoding: the more the scene makes you *act out* the causal story,
the deeper the trace.

Sources: [Picmonic](https://www.picmonic.com/pages/hack-usmle-studying-with-the-mnemonic-power-of-pictures/),
[ScienceDirect — bizarre imagery review](https://www.sciencedirect.com/science/article/pii/S0166411508605130).

---

## 3. Spatial layout — method of loci + clustering

The **method of loci** encodes items as images placed along a familiar, ordered set of locations;
position itself carries information, and recall is a walk through the space.

- **One coherent setting per scene** (a jungle clearing, a Six Flags park, a fabric store) — not a
  generic ER. A vivid distinct locus is the spatial scaffold.
- **Bind each item to a definite spot** and keep it there. Explicit item↔locus binding is what makes
  loci work; a symbol floating "somewhere" loses the spatial cue.
- **Position encodes priority / category.** Put cornerstone treatments nearest the patient; refractory
  / last-resort items in a far "back-up" zone. Foreground = central/most-tested; periphery = caveats.
- **Cluster related facts** into a sub-region (all the "side effects" in one corner). Spatial
  proximity = semantic grouping (Gestalt), which chunks the scene for the reader.

Sources: [Method of loci (Wikipedia)](https://en.wikipedia.org/wiki/Method_of_loci),
[MoL systematic review & meta-analysis (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12514325/).

---

## 4. Cognitive load — chunk, focus, don't overcrowd

Working memory holds ~4–7 chunks. A scene that names 15 unrelated props is a wall, not a mnemonic.

- **≤ ~7 chunks per scene.** If a topic has more, split into Sections (sub-scenes) or separate
  Picmonics. A dense Sketchy SOAP scene is really 4 sub-scenes (S/O/A/P), not one.
- **One clear focal point** — usually the patient or the central villain. The eye needs an anchor.
- **Whitespace is a feature.** Leave room between clusters; a crowded canvas defeats both loci and
  legibility. (This is why Engram backgrounds are authored as locus-only with "distinct areas, no
  characters" — symbols go *on top* of clean zones.)

Source: [chunking & cognitive load (Pearson)](https://www.pearson.com/en-au/schools/insights-news/unlocking-the-power-of-chunking-reducing-cognitive-load/).

---

## 5. Distinctiveness — bizarre, exaggerated, emotional (with caveats)

The **Von Restorff / distinctiveness effect**: the odd item in a set is remembered best. Picmonic
leans on this with humorous, irregular characters (the Pencil Villain = penicillin).

- **Exaggerate.** A giant anaconda crushing a patient beats "patient with hives." Bigger, weirder,
  funnier, scarier — within reason.
- **Charge it emotionally.** Peril, heroism, absurdity, humor. Neutral medical props are forgettable.
- **Caveats from the data.** Bizarreness helps mainly in a **mixed** scene (some plain, some bizarre)
  and its edge is strongest short-term; don't make *everything* bizarre (it stops being distinctive)
  and never sacrifice **legibility** for weirdness. Distinctiveness that you can't decode is wasted.

Source: [Distinctiveness & the mnemonic benefits of bizarre imagery (Springer)](https://link.springer.com/chapter/10.1007/978-1-4612-4676-3_4).

---

## 6. Consistency across scenes — recurring symbols

A symbol should **always mean the same thing** (Sketchy's recurring icons; a wheelchair = stasis
everywhere it appears). Reuse builds a personal visual vocabulary so a glance recalls the concept
without re-decoding.

- Before inventing a new pun, search the user's ingested Pixorize/Sketchy/Picmonic library with
  `scripts/find_existing_symbols.py "<term>"` and reuse the established visual the source program
  already uses — that consistency is the whole point. Also check the curated
  `tools/video-ingest/glossary.json`; propose a new glossary entry (don't silently add) when you coin
  a recurring pun.
- Within one scene, **reuse one `{sym:UUID}` across facts** when a single image legitimately encodes
  two facts — it becomes one placeholder with two hotspots.

---

## The 95th-percentile yield lens

Before designing, judge yield as a **top-decile (95th-percentile) ABEM/ABIM scorer** would — the bar
Pixorize hires its content team against. That reviewer doesn't encode every true statement; they
encode the **discriminating, repeatedly-tested** facts: the buzzword associations, the "most likely
diagnosis" pivots, the first-line-vs-next-step distinctions, the classic traps. Trivia that wouldn't
move a score gets cut so it doesn't clutter the loci. When the scene-vs-symbol-vs-skip call is
genuinely unclear, defer to the `high-yield-fact` skill.

---

## Worked example — a small scene (drug, facts-only)

**Topic:** Albuterol (SABA) for acute asthma.

**95th-percentile yield cut:** keep MOA (β2 agonist → bronchodilation), the first-line-in-acute-
exacerbation role, and the tested side effects (tachycardia, tremor, hypokalemia). Drop pharmacokinetic
minutiae.

**Cast & setting:** a mountain-**troll** (Albu-**TROLL** = albuterol) is the hero, in a **lung-shaped
cave** (the locus). The villain is an **asthma boa** squeezing the bronchial tubes.

**Design (Section → Fact → symbol → why):**

- **Mechanism**
  - *Beta-2 agonist relaxes bronchial smooth muscle* — Albu-TROLL **pries the boa's coils open**,
    widening the cave tunnels → β2 agonism → bronchodilation; *the troll forcing the tubes open is
    the dilation* (interaction = mechanism).
- **Use**
  - *First-line for acute asthma exacerbation* — the troll stands **front-and-center, first in line**
    at the cave mouth → rescue/first-line; *foreground position = highest priority* (loci).
- **Side effects** (clustered in one corner of the cave)
  - *Tachycardia* — a **racing drum** on the troll's chest → fast heart; *drum-beat = heart rate*.
  - *Tremor* — the troll's **hands visibly shaking** → tremor; *shaking hands depict the symptom*.
  - *Hypokalemia* — a **banana ("K") sinking into a drain** → low potassium; *banana = K+, draining =
    low* (dual code: the letter K and the falling action).

Notice: every bullet has a sound-alike or a depicting metaphor, the side effects are *clustered*, the
first-line fact is encoded by *position*, and the mechanism is an *interaction* — not five labels.

The matching design JSON (what `make_engram_package.py` consumes):

```json
{
  "name": "Albuterol (SABA) — acute asthma",
  "tags": ["pharm", "pulm"],
  "sections": [
    { "name": "Mechanism", "facts": [
      { "fact": "Beta-2 agonist relaxes bronchial smooth muscle",
        "symbols": [{ "key": "albuterol-troll",
          "description": "Albu-TROLL prying the asthma boa's coils open, widening the lung-cave tunnels",
          "meaning": "beta-2 agonist -> bronchodilation",
          "encoding": "Albu-TROLL sounds like albuterol; troll forcing tubes open = dilation" }] } ] },
    { "name": "Use", "facts": [
      { "fact": "First-line for acute asthma exacerbation",
        "symbols": [{ "key": "albuterol-troll",
          "description": "the same troll standing front-and-center, first in line at the cave mouth",
          "meaning": "first-line acute rescue",
          "encoding": "foreground / first-in-line position = highest clinical priority" }] } ] },
    { "name": "Side effects", "facts": [
      { "fact": "Tachycardia",
        "symbols": [{ "key": "racing-drum",
          "description": "a fast-beating drum strapped to the troll's chest, lower-left cluster",
          "meaning": "tachycardia", "encoding": "drum-beat = heart rate, racing = fast" }] },
      { "fact": "Tremor",
        "symbols": [{ "key": "shaking-hands",
          "description": "the troll's hands visibly shaking, motion lines, same lower-left cluster",
          "meaning": "tremor", "encoding": "shaking hands depict the symptom directly" }] },
      { "fact": "Hypokalemia",
        "symbols": [{ "key": "banana-drain",
          "description": "a banana labeled K sinking into a floor drain, lower-left cluster",
          "meaning": "hypokalemia", "encoding": "banana = K+ (potassium), draining away = low" }] } ] }
  ]
}
```

The reused `albuterol-troll` key appears under two facts → one shared placeholder, two hotspots.
