# Run the AgriLens app

Run commands from the repository root with Node.js 22 or newer. The app has no
runtime packages. Its local Node server serves browser modules and proxies
`GET /api/config` and `POST /api/compare` to the Comparison service. It also
serves a server-side Gemini assistant endpoint.

## Deploy on Vercel

Import the GitHub repository and set **Root Directory** to `app`. Select **Other**
for the framework preset. `vercel.json` supplies the build command and `dist` output
directory. No start command is required. Set server-side `GEMINI_API_KEY` to enable the assistant.

The build copies only `index.html` and `src/` into `dist/`. Vercel serves those
files and forwards the two public API endpoints to
`https://agriapi.mohamedayman.net`. API caching stays disabled. The local Node
server is not used on Vercel, so `COMPARISON_BASE_URL` affects local proxying and assistant retrieval, while
the deployed form uses the rewrite destinations. Keep those origins aligned.
To change the deployed API, update both rewrite destinations in `vercel.json`.

After deployment, open `/api/config` on the website's domain, complete a comparison,
and switch historical scenarios to verify the deployed routing.

## Use the deployed API

Start the app. No local backend is required:

```sh
npm start --prefix app
```

Open <http://localhost:5173>. Select four crops and a priority, then choose
**Compare rotations**. Each alternative card immediately compares the alternative
with your unchanged rotation. Both columns show each season's crop, water range,
historical heat exposure, and diversity and soil notes.
Use **See details & stress test** to switch historical scenarios and inspect
reasons and sources. Routine screens omit the repeated prototype review warning;
scientific limitations remain under Sources and limitations.
Hottest and driest scenarios are eligible rotation anchors, not record-wide extremes.

If Comparison uses another address, set `COMPARISON_BASE_URL` in the app server's
environment. It defaults to `https://agriapi.mohamedayman.net`. Set `APP_PORT` to change 5173
or `APP_HOST` to change the loopback bind address. The app server reads process
environment variables and npm start/dev load `app/.env.local`, not the repository `.env` file. The browser always calls
the app's own origin, so no CORS adjustment is needed.

## Use a local backend

Start the pinned backend with [the backend runbook](../docs/BACKEND.md), then start
the app in another terminal with an explicit local override:

```sh
COMPARISON_BASE_URL=http://127.0.0.1:8000 npm start --prefix app
```

## Use synthetic development fixtures

Stop any Comparison process occupying port 8000, then start its fixture server:

```sh
python3 tools/dev.py fixtures comparison
```

Start the app in another terminal with the local override above. Synthetic labels
remain visible. Select a Comparison fixture profile from [the fixture catalog](../fixtures/README.md)
to develop unavailable, missing-metric, or fewer-plan states. Fixture results are
recorded cases, so arbitrary crop edits require the real Comparison engine.
The app never switches to fixtures after an outage.

## Language

Use **العربية** in the header to switch to Arabic, or **English** to switch back.
The app stores the language preference in browser storage. If storage is blocked,
the switch still works for the current session. English remains the default.

Arabic includes the three screens, crop names, known region name, controls,
units, missing values, validation, service recovery, status announcements and
page title. It uses right-to-left layout and Arabic number formatting while
preserving API crop IDs, numeric values, source URLs and crop slot order.
Switching languages preserves choices, results and expanded detail sections
without making another API request. AgriLens remains a Latin wordmark.

Arabic also translates the current service's scientific notes, reasons, warnings,
assumptions, limitations and source descriptions. Complete sentences and bounded
templates in `src/i18n.js` preserve qualifiers, years and provenance. Unknown future
wording retains its original text. Source URLs and API payloads remain unchanged.
Unknown service errors show Arabic recovery guidance alongside the original
message. Add translations to `src/i18n.js`; do not replace arbitrary rendered text.

## Run verification

```sh
npm test --prefix app
```

The browser harness requires an external Playwright installation with Chromium.
Use an installed `playwright` package, or set `PLAYWRIGHT_MODULE` to its absolute
`index.mjs` path. Set `CHROMIUM_BIN` if using system Chromium. No browser dependency
is added to this app.

```sh
npm run test:browser --prefix app
```

To also exercise the deployed API, run:

```sh
TEST_REAL_BACKEND=1 npm run test:browser --prefix app
```

The harness starts an app server on an unused port and closes its server and
browser afterward. Screenshots go to ignored `.local/app-verification/`.
Checks cover configuration failure, keyboard controls, mobile overflow, the three
screens, preserved input, missing metrics, fewer plans, unavailable scenarios,
retry, source navigation, and responses arriving after the user edits choices.
The real-backend check covers the deployed API and all scenarios. Set
`COMPARISON_BASE_URL=http://127.0.0.1:8000` to run it against a local backend instead.

## Design implementation

The [Field Shift Figma design](https://www.figma.com/design/kBGVFvZFv8iDrOQmYjKCwf/?node-id=2-4)
supplies the palette, Readex Pro typography, field-strip brand mark, crop
illustrations, metric icons, form surfaces and comparison cards. Presentation is
in `src/styles.css` and `src/views.js`. API validation remains in `src/api.js`
and navigation/request state in `src/main.js`.

The English layouts are adapted to the three approved screens. The Figma file's
landing page, additional setup pages, area, irrigation and soil inputs, balanced
priority and example scientific claims are outside the current
public contract and are not implemented. Supported crops come from the API.
Wheat, maize and faba bean use the matching Figma illustrations. Soybean has a
local SVG botanical illustration in the same palette. Other crops retain their
names without borrowing another crop's image. Crop slot order and
scientific labels follow `START_HERE.md`.

Assets are local in `src/assets/`, including the Readex Pro font and its OFL
license. The local server explicitly serves the maintained SVG and font files;
Vercel includes them through the existing `src/` copy. No Figma download URLs or
external font requests are required at runtime.

Browser verification also exercises local image loading, illustration dimensions,
summary updates and source disclosures at phone, tablet and desktop widths.
The `design-*.png` screenshots use labelled synthetic fixtures with supported
crop identifiers for visual checks; they are not scientific results.

The app displays returned values and reasons. It computes no agronomic scores,
savings or forecasts. Unknown values read **Not evaluated**. Alternative titles
use neutral numbering because stable API IDs do not guarantee a lower-water or
more-diverse result for every priority. Details show each returned crop sequence.
Scenario errors keep the previous scenario explicitly labelled. Editing crops
or priority invalidates old results. Browser Back and Edit choices preserve
in-memory input; a page reload starts the configured example.

Research acceptance, design-owner review, deployment, and the required tests with
two unfamiliar people remain separate work. App verification does not approve
scientific inputs or check off the entire project definition of done.

## Gemini assistant

The assistant panel uses `gemini-3.5-flash-lite`, currently listed with free input
and output tokens in [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite).
Create a key in [Google AI Studio](https://aistudio.google.com/api-keys) for a free-tier
project. Set `GEMINI_API_KEY` in the app server's environment, or Vercel's server-side
environment settings. Never put it in `src/`, a browser-prefixed variable or Git.
Local npm start/dev also load the ignored `app/.env.local` file. `GEMINI_MODEL` overrides the model;
check that an override is available on your project's free tier. The code does not
enable billing, upgrade tiers or switch to a paid fallback. Google controls quotas
and billing; a paid project key may incur charges. Each question can use up to four
model requests. Missing keys and quota failures preserve manual form access.

Deploy the updated Comparison service before testing search. Its new
`POST /api/knowledge` reads the current checked Crop/Climate snapshots via existing
internal APIs, including data stored by those services in MongoDB. It does not
search archived snapshots or unrelated collections. The static fixture server does
not implement search; use the actual Comparison engine in fixture mode for that.

Chat receives current choices, displayed results and their original request.
Gemini can search project data with source links and return a complete form action.
The browser validates that action, ignores it if the page changed, fills the form
and calls the existing comparison flow. Try “What does Not evaluated mean?” or
“Enter maize, wheat, soybean, faba bean in that order, prioritize less water and
compare the historical average” against the corresponding real config. Incomplete
choices should produce a follow-up question. Unsupported crops must not submit.
Chat and choices go to Google, whose free tier may use content to improve products;
the popup omits introductory copy at the owner's request. History stays in browser memory and is
cleared with New chat or reload. No server chat persistence is added.

The local process limits assistant starts to eight per minute and two concurrent
turns. Limits are per process, including per warm Vercel instance, rather than a
shared deployment quota. The provider's free-tier quotas remain the final limit.
A 60-second Vercel function limit covers the 45-second model deadline.

Verify with `npm test --prefix app`, `npm test --prefix services/comparison`, and
`npm run test:browser --prefix app`. Browser tests cover automatic comparisons,
text escaping, unsafe source links, stale actions and Arabic mobile UI; model tests
stub Gemini to reproduce tool calls and quota errors without consuming quota.
A real key is required for a live model smoke test.
