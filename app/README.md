# Run the AgriLens app

Run commands from the repository root with Node.js 22 or newer. The app has no
runtime packages. Its local Node server serves browser modules and proxies
only `GET /api/config` and `POST /api/compare` to the Comparison service.

## Deploy on Vercel

Import the GitHub repository and set **Root Directory** to `app`. Select **Other**
for the framework preset. `vercel.json` supplies the build command and `dist` output
directory. No environment variables or start command are required.

The build copies only `index.html` and `src/` into `dist/`. Vercel serves those
files and forwards the two public API endpoints to
`https://agriapi.mohamedayman.net`. API caching stays disabled. The local Node
server is not used on Vercel, so `COMPARISON_BASE_URL` only affects local runs.
To change the deployed API, update both rewrite destinations in `vercel.json`.

After deployment, open `/api/config` on the website's domain, complete a comparison,
and switch historical scenarios to verify the deployed routing.

## Use the deployed API

Start the app. No local backend is required:

```sh
npm start --prefix app
```

Open <http://localhost:5173>. Select four crops and a priority, then choose
**Compare rotations**. Use **See details & stress test** to switch scenarios
and inspect sources. The retained-data prototype stays labelled unreviewed.
Hottest and driest scenarios are eligible rotation anchors, not record-wide extremes.

If Comparison uses another address, set `COMPARISON_BASE_URL` in the app server's
environment. It defaults to `https://agriapi.mohamedayman.net`. Set `APP_PORT` to change 5173
or `APP_HOST` to change the loopback bind address. The app server reads process
environment variables, not the repository `.env` file. The browser always calls
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
priority, Arabic translation and example scientific claims are outside the current
public contract and are not implemented. Supported crops come from the API.
Wheat, maize and faba bean use the matching Figma illustrations; other crops
retain their names without borrowing another crop's image. Crop slot order and
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
