# Run the AgriLens app

Run commands from the repository root with Node.js 22 or newer. The app has no
runtime packages or build step. Its Node server serves browser modules and proxies
only `GET /api/config` and `POST /api/compare` to the Comparison service.

## Use retained research inputs

Start the pinned backend with [the backend runbook](../docs/BACKEND.md).
If its MongoDB and release import are already ready, run:

```sh
.local/mongo-venv/bin/python tools/backend.py run
```

In another terminal, start the app:

```sh
npm start --prefix app
```

Open <http://localhost:5173>. Select four crops and a priority, then choose
**Compare rotations**. Use **See details & stress test** to switch scenarios
and inspect sources. The retained-data prototype stays labelled unreviewed.
Hottest and driest scenarios are eligible rotation anchors, not record-wide extremes.

If Comparison uses another address, set `COMPARISON_BASE_URL` in the app server's
environment. It defaults to `http://127.0.0.1:8000`. Set `APP_PORT` to change 5173
or `APP_HOST` to change the loopback bind address. The app server reads process
environment variables, not the repository `.env` file. The browser always calls
the app's own origin, so no CORS adjustment is needed.

## Use synthetic development fixtures

Stop any Comparison process occupying port 8000, then start its fixture server:

```sh
python3 tools/dev.py fixtures comparison
```

Start the app in another terminal with the same command above. Synthetic labels
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

To also exercise the real backend, start the backend first, then run:

```sh
TEST_REAL_BACKEND=1 npm run test:browser --prefix app
```

The harness starts an app server on an unused port and closes its server and
browser afterward. Screenshots go to ignored `.local/app-verification/`.
Checks cover configuration failure, keyboard controls, mobile overflow, the three
screens, preserved input, missing metrics, fewer plans, unavailable scenarios,
retry, source navigation, and responses arriving after the user edits choices.
The real-backend check covers MongoDB through all three services and all scenarios.

## Handoff to the final design

Replace presentation in `src/styles.css` and screen markup in `src/views.js`.
The stylesheet contains the temporary palette, typography and layout tokens.
Keep API validation in `src/api.js` and navigation/request state in `src/main.js`.
No framework choice is required by the shared contract.

The app displays returned values and reasons. It computes no agronomic scores,
savings or forecasts. Unknown values read **Not evaluated**. Alternative titles
use neutral numbering because stable API IDs do not guarantee a lower-water or
more-diverse result for every priority. Details show each returned crop sequence.
Scenario errors keep the previous scenario explicitly labelled. Editing crops
or priority invalidates old results. Browser Back and Edit choices preserve
in-memory input; a page reload starts the configured example.

Research acceptance, final visual design, deployment, and the required tests with
two unfamiliar people remain separate work. App verification does not approve
scientific inputs or check off the entire project definition of done.
