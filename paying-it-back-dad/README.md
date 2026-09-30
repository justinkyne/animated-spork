# “Paying It Back, Dad”

A satirical, vertical (9:16) political ad. In May 2026 a Putin ally paid for Don Jr.'s
wedding parties. Asked whether the money was repaid, President Trump said his son told him,
*“No, I'm paying it back, Dad.”* The ad has ordinary Americans try the same excuse on
their own bills. It doesn't go well.

**Logline:** *A Putin ally picked up their tab. Who's picking up yours?*

| File | What it is |
|---|---|
| `index.html` | The ad as a self-contained, playable web page: animation, synthesized sound, and three cuts. Open it and tap to play. |
| `out/paying-it-back-dad.mp4` | Full cut, 64s, 1080×1920, H.264/AAC. Ready to post. |
| `out/paying-it-back-dad-30.mp4` | :30 cut (≈33s) for Reels, Shorts, and X |
| `out/paying-it-back-dad-15.mp4` | :15 cut (≈16s). It opens cold on the “Dad” quote, then runs the meme. |
| `out/poster.png` | Cover/thumbnail frame: the receipt stamped **ОПЛАЧЕНО** (“PAID”) |
| `render.mjs` | Re-renders any cut to MP4 or a still (see [Rendering](#rendering)) |
| `fonts/` | Bundled Google Fonts (all SIL Open Font License), so the page renders the same offline |

---

## Why it should travel

1. **Hook in under 2 seconds.** It opens like a dreamy wedding reel, but the post header
   reads *“Sponsored by **a Putin ally**.”* The mismatch stops the scroll.
2. **Receipts, literally.** The corruption appears as an itemized bill:
   $100,000/night island, ~$70,000 fireworks, sailor-suit dancers, paid via a Dubai entity.
   The stamp is in Russian. Every number on it is sourced.
3. **The affordability turn uses their own words.** The President's “I'm paying it back,
   Dad” is the whole joke. Viewers watch that excuse fail at the grocery checkout, with the
   landlord, with the car insurer, and with the IRS. This is the privilege gap, shown and
   not lectured.
4. **Scale that anyone can feel.** One night on that island costs more than the median
   American household earns in a year. The fireworks alone cost more than two average
   American weddings.
5. **A built-in meme format.** The line *“I'm paying it back, Dad”* is designed for
   stitches and duets: people film themselves saying it to their own bills.
   Hashtag: **#PayingItBackDad**.
6. **The close asks a question instead of making a claim.** *“In America, that's called a
   gift. In Moscow, it's called an investment.”* Then: *“A Putin ally picked up their tab.
   Who's picking up yours?”* A question invites comments, and comments feed the algorithm.

It is designed to work with the sound off: every beat is on-screen text. The synthesized
sound design (music box, record scratch, receipt printer, stamps, a “declined” buzzer)
adds punch when the sound is on.

---

## Script: full cut (64s)

| Time | Picture | On-screen text | Sound |
|---|---|---|---|
| 0:00 | Night sky over a private island, palms, string lights, fireworks reflected in the water. The picture slowly pushes in. | Script title **Don & Bettina** · *The Bahamas · May 2026*. A social-post header reads **Don & Bettina's Wedding Weekend** · *Sponsored by* **a Putin ally** (typed on, red highlight). | Sweet music-box arpeggio, firework pops |
| 0:03 | Wedding-reel captions | *A private island.* → *Fireworks over the water.* → *Two nights of parties.* | Music continues |
| 0:08 | **Glitch, then a hard cut to paper** | **SO WHO PAID FOR IT?** / **UMAR KREMLEV** / *Russian oligarch. Putin ally.* | Record scratch, then a heavy thud |
| 0:10 | A timeline builds | **Apr 22:** Putin awards him Russia's Order of Friendship. **May 19–20:** He's in Putin's delegation to China. **Days later:** He bankrolls Don Jr.'s wedding weekend. (highlighted) | Typewriter ticks |
| 0:15 | **THE BILL** *(as reported by ProPublica)*. A thermal receipt slides up and prints. | PRIVATE ISLAND $100,000/NIGHT · FIREWORKS SHOW ~$70,000 · SAILOR-SUIT DANCERS YES · PAID VIA DUBAI ENTITY · BILLED TO: **A PUTIN ALLY** · СПАСИБО! COME AGAIN | Receipt-printer buzz per line |
| 0:20 | A red rubber stamp slams onto the receipt | **ОПЛАЧЕНО** · *(That's Russian for “PAID.”)* | Stamp thud |
| 0:23 | **FOR SCALE**: animated bars | *One night on that island…* $100,000 vs. median U.S. household, 1 year, $87,460 → **THEIR ONE NIGHT > YOUR WHOLE YEAR.** *The fireworks alone…* ~$70,000 vs. two average U.S. weddings, $68,400 → **TWO OF YOUR WEDDINGS. UP IN SMOKE.** | Risers, hits |
| 0:30 | Black. Quotes. | *Don Jr.'s spokesperson, to ProPublica:* **“Umar is a personal friend of Don.”** | Tick |
| 0:33 | | *Asked if Don Jr. paid back the Putin ally…, President Trump said:* **“He said, ‘No, I'm paying it back, Dad.’”** (“Dad” in red) | Silence, so it lands |
| 0:36 | Stamp | **PROOF OF REPAYMENT: NONE PROVIDED** (footnote: ABC News, Sept. 2026) | Stamp thud |
| 0:39 | Paper | **GREAT EXCUSE. / LET'S ALL TRY IT.** | Two hits |
| 0:41 | Four bill cards, 2.3s each, each with a speech bubble: *YOU: “I'm paying it back, Dad.”* | GROCERIES, Total: $214.87 → **DECLINED** · RENT, Past due: $1,850 → **EVICTION NOTICE** · CAR INSURANCE, Renewal: $1,340. Up again. → **POLICY CANCELED** · THE IRS, Balance due: $3,212 → **AUDITED** | Whoosh, stamp; a “declined” buzzer on the first card |
| 0:50 | Black | **WEIRD.** / **IT ONLY WORKS WHEN DAD'S THE PRESIDENT.** | Hit |
| 0:53 | Black | *In America, that's called a gift.* / *In Moscow, it's called an investment.* (red) | Low boom |
| 0:56 | Full red | *A Putin ally picked up their tab.* / **WHO'S PICKING UP YOURS?** | Low boom |
| 1:00 | End card | **#PayingItBackDad** · *Send this to someone who pays full price for everything.* · *Satire. But every quote and dollar figure about the wedding is real.* · Sources | Music box returns: one sweet, ironic chord |

### Cutdowns

- **:30** — sponsored hook, then the bill and stamp, then the “Dad” quote and stamp, then
  “Let's all try it” with groceries and rent, then “Only works when Dad's the President,”
  then the close and the end card.
- **:15** — opens cold on the President's quote (the on-screen label supplies the context),
  then groceries and rent, then “Only works when Dad's the President,” then the end card.

### Optional voiceover (for a narrated version)

Read it as a deadpan wedding-video narrator who slowly realizes what they're reading:

> “Don and Bettina. A private island. Fireworks over the water. Paid for by…
> *(record scratch)* …a Putin ally. Asked if his son paid it back, the President said:
> ‘He said, “No, I'm paying it back, Dad.”’ Great excuse. Let's all try it.
> *(beat)* Huh. It only works when Dad's the President.
> A Putin ally picked up their tab. Who's picking up yours?”

Don't use AI voice clones of Trump or Don Jr. Show the real quotes as on-screen text,
or use the actual news clip where you have the rights to it.

---

## Launch kit

**TikTok / Reels caption**
> Try telling your landlord “I'm paying it back, Dad.” 🙃 Every quote and number about the
> wedding is real. Sources are in the comments. #PayingItBackDad

**X / Threads**
> A Putin ally paid for Don Jr.'s wedding parties: a $100K/night private island and ~$70K
> in fireworks. The President's explanation: “He said, ‘No, I'm paying it back, Dad.’”
> Great. Let's all try that with our landlords. #PayingItBackDad

**Pinned comment (sources)**
> ProPublica (Sept. 14, 2026); NBC, ABC, CNN, and Time coverage (Sept. 2026); U.S. Census
> Bureau, *Income in the United States: 2025*; The Knot 2026 Real Weddings Study. The
> grocery, rent, insurance, and IRS bills are illustrative.

**UGC prompt (the trend)**
> Stitch this and tell us which bill you'd like to “pay back, Dad.” Film yourself saying it
> to your rent portal, your pharmacy receipt, or your student-loan statement.
> #PayingItBackDad

**Hooks worth A/B testing:** (a) the “Sponsored by a Putin ally” wedding reel (full and
:30); (b) a cold open on the “Dad” quote (:15); (c) use `out/poster.png` (the Russian
“PAID” stamp) as the cover image.

---

## Fact-check ledger

Every factual claim in the ad, with its source. The grocery, rent, insurance, and IRS
amounts in the montage are illustrative, not statistics.

| On screen | Source |
|---|---|
| Wedding weekend in the Bahamas, May 2026 | [CNN, May 21, 2026](https://www.cnn.com/2026/05/21/politics/donald-trump-jr-bettina-anderson-wedding) |
| A Putin ally “bankrolled” the wedding weekend; two nights of parties (Saturday and Sunday) | [ProPublica](https://www.propublica.org/article/donald-trump-jr-wedding-bankrolled-russian-oligarch-umar-kremlev-putin) · [NBC News](https://www.nbcnews.com/politics/politics-news/donald-trump-jr-russian-oligarch-umar-kremlev-ties-putin-wedding-celeb-rcna597735) · [ABC News](https://abcnews.com/Politics/russian-oligarch-paid-parts-donald-trump-jrs-wedding/story?id=136425474) |
| Umar Kremlev: Russian oligarch, Putin ally, head of a boxing federation | [Time](https://time.com/article/2026/09/14/umar-kremlev-russian-businessman-donald-trump-jr-wedding-celebrations/) · [Axios](https://www.axios.com/2026/09/14/umar-kremlev-donald-trump-jr-wedding-bahamas) · [Rolling Stone](https://www.rollingstone.com/politics/politics-news/putin-ally-umar-kremlev-paid-don-jr-wedding-1235626155/) |
| Apr 22: Putin awards him the Order of Friendship | [NV (Kyiv), “Putin honored Umar Kremlev weeks before…”](https://english.nv.ua/nation/putin-honored-umar-kremlev-weeks-before-donald-trump-jr-s-wedding-50643432.html) · [Time](https://time.com/article/2026/09/14/umar-kremlev-russian-businessman-donald-trump-jr-wedding-celebrations/) |
| May 19–20: in Putin's delegation to China | Reported in [Time](https://time.com/article/2026/09/14/umar-kremlev-russian-businessman-donald-trump-jr-wedding-celebrations/) and [Axios](https://www.axios.com/2026/09/14/umar-kremlev-donald-trump-jr-wedding-bahamas) profiles; visit dates from [Wikipedia](https://en.wikipedia.org/wiki/2026_visit_by_Vladimir_Putin_to_China). **Re-read the original wording before posting** (see checklist). |
| Private island: $100,000/night. Fireworks: ~$70,000. Paid via a Dubai entity. Sailor-suit dancers. | [ProPublica](https://www.propublica.org/article/donald-trump-jr-wedding-bankrolled-russian-oligarch-umar-kremlev-putin), as summarized by [The Hill](https://thehill.com/homenews/administration/6090368-russian-oligarch-trump-wedding-gift/). These are the island's nightly rate and the fireworks company's typical price, which is why the receipt says “/NIGHT” and “~”. |
| “Umar is a personal friend of Don.” | Trump Jr. spokesperson to [ProPublica](https://www.propublica.org/article/donald-trump-jr-wedding-bankrolled-russian-oligarch-umar-kremlev-putin) |
| “He said, ‘No, I'm paying it back, Dad.’” | President Trump, Sept. 18, 2026: [ABC News](https://abcnews.com/Politics/trump-donald-trump-jr-repaid-russian-oligarch-wedding/story?id=136571775) · [CNN](https://www.cnn.com/2026/09/18/politics/trump-jr-wedding-russian-billionaire) · [The Hill](https://thehill.com/homenews/administration/6098914-donald-trump-jr-umar-kremlev-wedding-gift-paid-back/) |
| Proof of repayment: none provided | [ABC News](https://abcnews.com/Politics/trump-donald-trump-jr-repaid-russian-oligarch-wedding/story?id=136571775): the White House and the Trump Organization had not provided evidence when asked |
| Median U.S. household income, 2025: $87,460 | [U.S. Census Bureau, Sept. 15, 2026](https://www.census.gov/library/publications/2026/demo/p60-289.html) |
| Average U.S. wedding: $34,200 (so two weddings cost $68,400) | [The Knot 2026 Real Weddings Study](https://www.theknotww.com/press-releases/the-knot-worldwide-unveils-2026-real-weddings-study) |

The line *“In Moscow, it's called an investment”* is rhetorical commentary. The ad does not
claim a specific quid pro quo, and the caption shouldn't either.

---

## Before you post

- [ ] **Re-check the repayment story.** As of Sept. 30, 2026, no proof of repayment had
  been provided. If proof surfaces, change the “NONE PROVIDED” stamp (in `index.html`,
  search for `s5-stamp`) and re-render.
- [ ] **Re-read the ProPublica piece and the Time/Axios profiles** to confirm the
  receipt's line items and the “May 19–20, Putin's delegation to China” wording.
- [ ] **Organic vs. paid.** Posting organically needs no disclaimer. If a political
  committee pays to place the ad, add the FEC “paid for by” notice:
  `node render.mjs --paidfor "Committee Name"`. That puts it on the end card and keeps it
  on screen for 4s. Platform rules differ: Meta and Google require political-advertiser
  verification, and TikTok does not accept paid political ads at all. This is not legal
  advice; check with counsel or the platform's policy page.
- [ ] Keep the “Satire” line in the caption as well as on the end card.

---

## Rendering

```sh
# preview: open index.html in any browser (tap to play; choose Full / :30 / :15)
python3 -m http.server 8000   # then visit http://localhost:8000/paying-it-back-dad/

# re-render videos (needs Playwright + an ffmpeg with libx264)
node paying-it-back-dad/render.mjs             # full cut
node paying-it-back-dad/render.mjs --cut 30
node paying-it-back-dad/render.mjs --cut 15
node paying-it-back-dad/render.mjs --still 21.3 --out poster.png
```

Every frame and sound is a pure function of time, so renders are frame-exact and
repeatable. To edit copy, change the text in `index.html`. Timings are set in the `SC`
table and the per-scene `UPD` functions.
