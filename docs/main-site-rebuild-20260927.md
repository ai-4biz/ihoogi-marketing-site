# Main mini-site rebuild — 27 September 2026

## Decision

Lead with the business pain and a concrete product mechanism: incoming inquiries look alike, but some deserve attention sooner. iHoogi asks business-specific questions, ranks incoming inquiries and explains the fit before the first conversation. Personal setup lowers the effort required to try it.

This is a review branch, not a production deployment. Scope is the main marketing page. The beauty page, ads, audiences, application, domain and hosting settings are unchanged.

## History reviewed

Repository baseline: `79c72ee974760b24a36262d10de5fa08a1a4d8f7`.

Surveyed all 174 commits available across fetched branches, extracted and compared the visible text of the 101 main-page revisions on main, and examined branch-specific variants. These comparisons identify messaging and structure changes; they do not establish which version converted better. No version-linked analytics or controlled experiments were available.

| Source | Strength recovered |
| --- | --- |
| `f25e20f` | The full journey from inquiry to understanding, action and marketing insight. |
| `734340f` | Start with the business, then create the questions. |
| `2dcc570` | Concrete team workflows and source-quality context. |
| `6771985` | How setup works, mobile follow-up, source-quality illustration and founder context. |
| `40eaf543` | Personal setup offer, existing customer testimonial and consent-aware attribution. |
| `5a697de`, `eabb337` | Connect the business-learning story to the actual smart link. |
| `45eb604`, `a160b8f` | Useful alternative language connecting the business profile to prioritization. |
| `17cfe9e` through `c36e1bf` | Keep the clearer, shorter opening; restore the mechanism and evidence removed by successive compression. |

## Page journey

1. **Recognize the pain:** You brought in inquiries. Know who to call first — and why.
2. **Understand the product immediately:** Smart link, tailored questions, ranking and an explanation. A fictional inquiry example shows the inputs and why it fits.
3. **See the mechanism:** Business profile → relevant questions → ranked inquiry with context.
4. **Picture the working day:** Mobile/email alerts, call/WhatsApp/email, team routing, statuses, reminders and configured customer next steps.
5. **Understand the reasons to choose it:** Business-specific criteria, explainable priorities, actions connected to the inquiry, and personal setup with Rona.
6. **Understand marketing value:** Compare inquiry quality by source, filter by answers, and understand the conditional Meta feedback capability.
7. **Build trust:** Preserve the existing Ris/Risport testimonial and restore Rona's founder context.
8. **Know the offer and next step:** Introductory business questionnaire, personal setup, then rank the first 50 incoming inquiries free. No credit card or commitment.
9. **Resolve objections:** Lead generation versus inquiry qualification, suitability, existing CRM, human judgment and what happens after the offer.

## Content boundaries

- “50 free inquiries” means free ranking of incoming inquiries, not a supply of leads.
- The inquiry card and source chart are explicitly illustrative, not screenshots or customer results. No personal customer data is shown.
- The existing testimonial's Hebrew wording is unchanged. It is one customer's account, not a guaranteed outcome.
- Meta feedback is conditional on connection and measurement settings. No promised advertising performance improvement.
- No categorical claims that competitors lack these features; benefits are explained through the product's own workflow.
- No videos previously removed pending publication permission and no historic screenshots containing customer names were restored.
- Use existing clean brand and founder assets. Additional Drive illustrations were reviewed, but a labeled HTML example explains the product more clearly than a decorative image containing invented UI text.

## Implementation

- Rebuilt the static bilingual main page, keeping the existing brand palette, logo, owl, founder and brand image.
- Fixed navigation targets. Preserved a single primary destination: the guided setup questionnaire.
- Hebrew is readable without JavaScript; English text, image alternatives, navigation labels, document title and direction switch together. Removed selector-based translations aimed at deleted elements.
- Preserved the Meta pixel ID, existing consent storage key, attribution forwarding and `StartQuestionnaire` intent event. CTA clicks do not emit `Lead`.
- Added an explicit consent guard so questionnaire-click events are not invoked after marketing consent is withdrawn.
- Mobile styles use a single-column flow, a collapsible menu, larger touch controls and a contextual bottom CTA hidden at the hero/final offer and behind cookie consent.
- Kept the existing CNAME and legal links.

## Verification

See the validation results appended below. Source and DOM tests cannot establish visual quality in a real browser. The cloud browser rejected the local-file protocol, so no desktop/mobile visual pass is claimed. Before merge, open the supplied standalone review file or run `python3 -m http.server 8080` in a local checkout, then review at 390px and 1440px and follow the guided-setup link without submitting test contact details.

## After the main page

Adapt the same promise and mechanism to the beauty workflow, using the beauty-specific asset and offer. Then align the ad and landing destination, verify measurement with consent in the actual browser/application flow, and evaluate audience decisions with sufficient data. Do not infer audience quality from the six clicks cited in prior context.

### Completed checks

- `node --check`: inline JavaScript parses successfully.
- Static HTML checks: no duplicate IDs, broken local anchors or missing referenced local assets. CNAME remains `www.ihoogi.co.il`.
- Isolated DOM execution with jsdom (external resource loading disabled): all primary CTAs retain attribution and the guided-setup destination; Hebrew/English text and direction round-trip; menu open, navigation close and Escape close work; simulated section intersections control mobile CTA visibility.
- Consent scenarios: no Meta script/event before consent; accepting loads one PageView; questionnaire clicks emit intent only, not Lead; withdrawing consent suppresses subsequent intent events; saved essential/all choices are respected.
- `git diff --check`: clean.
- Not completed: real-browser desktop/mobile visual inspection, live questionnaire submission, real Meta delivery verification or conversion testing. DOM checks are not a replacement for those checks.


## Review changes accepted on 27 September

The original fictional hero inquiry card was removed after Rona found it unclear. The current hero places Hoogi beside a phone frame containing an edited copy of her supplied system screen. The name and contact details were replaced using the built-in image editing tool; the page labels it as based on a system screen with replacement contact details. The original unredacted screenshot is not included in the repository. The generated asset is `assets/img/mobile-inquiry-demo.png`.

Subsequent confirmed offer: both assisted setup and self-service receive the first 50 incoming inquiries ranked free. Two clearly distinguished CTAs now link to those flows, with attribution preserved for both. Company inquiries can contact office@ihoogi.com. Rona confirmed over 25 years of experience and plans starting at ₪299/month excluding VAT.

The page uses Rona's first-person voice for setup, with “בנו לי לינק” as the primary action. Necessary Hebrew maqaf punctuation was restored without reintroducing long rhetorical dashes. Cookie consent now appears as a compact strip in normal document flow before the header, rather than a fixed overlay. Reopening preferences scrolls to the strip and focuses its controls. DOM checks cover consent and language behavior; real viewport rendering remains unverified in this environment.

Image-edit prompt: preserve the supplied screenshot layout, Hebrew, score 85, hot badge, contact buttons and answers; replace only the name with “לקוח לדוגמה”, phone with “05X-XXXXXXX” and email with “name@example.com”. The page composition uses HTML/CSS and the existing owl asset.


### Brand image correction

Rona rejected the old flat owl asset beside the screenshot. The hero now uses a single generated photograph based on the original Rona/Hoogi brand images, with a phone facing the viewer and the demonstration UI supplied as a reference. It is labeled as a product illustration, not an unedited screenshot. Built-in image editing was used; the complete resulting image was encoded as WebP at its original dimensions for web delivery. No application logic changed.

Prompt: preserve Rona's identity and the established dimensional teal/orange Hoogi character from the original office/cafe references; compose them together naturally with a prominent portrait phone showing the supplied demo inquiry, score 85 and contact buttons; warm original brand atmosphere, realistic hands, no additional marketing text or invented performance numbers.
