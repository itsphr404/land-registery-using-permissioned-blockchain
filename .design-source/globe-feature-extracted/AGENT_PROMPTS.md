# Globe map feature: integration pack

A rotating globe you can zoom anywhere, a location picker on the Register tab, and your parcels shown on the globe. The old district map stays one click away and is the automatic fallback.

---

## 0. Answers first

**Do I need any API keys? No.**

- The default map tiles come from OpenStreetMap's public tile server. It needs no account and no key.
- MapLibre GL JS (the globe library) is open source and needs no key.
- "Use my location" is the browser's built-in feature. No key, but the page must be served over HTTPS (Vercel is) and the visitor must click Allow.
- No new Vercel environment variables are required. No contract changes. No `vercel.json` changes.

**Optional later:** to switch to a commercial tile provider, set `VITE_MAP_TILE_URL` (and `VITE_MAP_ATTRIBUTION`) in Vercel and redeploy. A keyed provider's key would be visible in the browser, so restrict it to your domain, as you did with Alchemy.

**OpenStreetMap's tile server rules:** fine for a small pilot, but the credit "© OpenStreetMap contributors" must stay visible (the code always shows it), and heavy production traffic should use a paid or self-hosted tile source.

---

## 1. What is in the pack

Unzip `globe-feature.zip` (or copy the files) into your project root. Paths are relative to the repo root.

**New files (10)**

| File | Purpose |
|---|---|
| `frontend/src/lib/geo.js` | Coordinate validation, formatting, bounds, and the stable USA "demo placement" for parcels that have no recorded location |
| `frontend/src/lib/globeSpin.js` | Slow auto-rotation (stops when the visitor touches the globe) |
| `frontend/src/lib/maplibreLoader.js` | Lazy-loads MapLibre, builds the OSM style, WebGL check, creates the globe |
| `frontend/src/components/GlobeView.jsx` | The globe map page: sidebar (search, status filters, list), markers, controls |
| `frontend/src/components/PlotCard.jsx` | Parcel card for the globe (copy of MapView's card, plus a Location row) |
| `frontend/src/components/MapPage.jsx` | Map tab wrapper: Globe / District switch, remembers choice, auto-fallback |
| `frontend/src/components/LocationPicker.jsx` | Modal to drop a pin, use device location, or type coordinates |
| `frontend/src/components/globe.css` | Styles for all of the above (uses your existing theme variables) |
| `frontend/test/geo.js`, `globeSpin.js`, `manifestLocation.js` | 21 unit tests |

**Modified files (5)**: built on GitHub `main` as it was during this session. Small edits only:

| File | Edit |
|---|---|
| `frontend/src/lib/manifest.js` | `buildManifest` accepts optional `lat`, `lng` and writes them into `meta`. Without a location the output is byte-for-byte unchanged. |
| `frontend/src/lib/manifestMeta.js` | Returns `lat`, `lng` from the manifest (sanitised; a bad location is ignored, never breaks the manifest). |
| `frontend/src/hooks/useParcels.js` | Each parcel gets `loc` and `locKind` (`"recorded"` or `"demo"`). |
| `frontend/src/components/RegisterView.jsx` | Optional "Location" field and picker; saves lat/lng into the manifest and local details. |
| `frontend/src/App.jsx` | Map tab renders `MapPage` instead of `MapView`. |

`MapView.jsx` is **not modified**. It is the district map and the fallback.

---

## 2. Install the one dependency

```bash
cd frontend
npm install maplibre-gl@6.17.0 --save-exact
```

Pinned to an exact version on purpose (6.17.0 was published 2026-11-07, over two weeks before this was written). Commit the updated `package.json` and `package-lock.json`.

---

## 3. Prompts for your agent

Use **Prompt A** to do everything in one go, or **Prompts B1 to B4** for a stricter step-by-step run. All of them assume the pack is unzipped somewhere the agent can read, called `PACK/`.

### Prompt A: everything at once

```text
You are integrating a "globe map" feature into my land-registry project (React + Vite frontend in /frontend, Solidity contracts elsewhere).

HARD RULES
- Do NOT touch /contracts, /deployments, hardhat config, or any .env file. No contract changes.
- Do NOT delete or edit frontend/src/components/MapView.jsx. It must keep working as the fallback map.
- My repo has recent fixes made by other people/agents. For the 5 MODIFIED files below, do NOT blindly overwrite: diff PACK's version against my current file and merge only the new lines. If my file has diverged, keep my changes and re-apply the feature edits by hand.
- The 10 NEW files can be copied as-is.
- Never commit secrets. No API key is needed for this feature.

STEPS
1. cd frontend && npm install maplibre-gl@6.17.0 --save-exact
2. Copy the NEW files from PACK/frontend/ into frontend/ keeping paths:
   src/lib/geo.js, src/lib/globeSpin.js, src/lib/maplibreLoader.js,
   src/components/GlobeView.jsx, PlotCard.jsx, MapPage.jsx, LocationPicker.jsx, globe.css,
   test/geo.js, test/globeSpin.js, test/manifestLocation.js
3. Merge these edits into my existing files:
   a. src/lib/manifest.js: import normalizeLoc from "./geo.js" (WITH the .js extension, so Node tests can import it). buildManifest takes optional lat, lng; if normalizeLoc(lat,lng) is valid, add meta.lat/meta.lng, otherwise leave meta exactly { area, addr, size, cell }.
   b. src/lib/manifestMeta.js: import normalizeLoc from "./geo.js"; after building `details`, add details.lat/lng only if normalizeLoc(meta.lat, meta.lng) is valid.
   c. src/hooks/useParcels.js: import { demoPlacement, normalizeLoc } from "../lib/geo"; after `size` is computed: `const recorded = normalizeLoc(meta.lat, meta.lng); const loc = recorded || demoPlacement(pid);` and add `loc: { lat: loc.lat, lng: loc.lng }, locKind: recorded ? "recorded" : "demo"` to the returned parcel object, next to `pts`.
   d. src/components/RegisterView.jsx: import Suspense and lazy from react; import formatCoords from "../lib/geo"; add `const LocationPicker = lazy(() => import("./LocationPicker"));` above the component; add state `location` (null) and `pickerOpen` (false); pass `lat: location?.lat, lng: location?.lng` into buildManifest; where local details are saved (`current[String(parcelId)] = {...}`) append `...(location ? { lat: location.lat, lng: location.lng } : {})`; call setLocation(null) after a successful registration; add the "LOCATION (OPTIONAL)" block (see PACK's file) just before the "OWNERS AND SHARES" label; render the lazy picker inside <Suspense fallback={null}> AFTER the closing </form> tag, never inside it.
   e. src/App.jsx: replace `import MapView from "./components/MapView"` with `import MapPage from "./components/MapPage"` and `<MapView plots={plots} onSelectView={setActiveTab} />` with `<MapPage plots={plots} onSelectView={setActiveTab} />`.
4. Run, from /frontend: `npm test`, `npm run lint`, `npm run build`. Fix anything that is caused by this work. Pre-existing failures (e.g. tests needing compiled artifacts or the chai package) are not yours to fix; just list them.
5. Report: files added, files changed (show `git diff --stat`), test/lint/build results, and any place where my file had diverged and how you merged.

ACCEPTANCE
- Map tab opens on a rotating globe with "© OpenStreetMap contributors" visible. A "GLOBE | DISTRICT MAP" switch is above it.
- Existing parcels appear as HOLLOW markers at stable spots in the USA, labelled "demo location" in the list and card.
- Switching to DISTRICT MAP shows the old map, unchanged. The choice is remembered after reload.
- If WebGL is unavailable the page shows the district map plus a notice.
- Register tab has an optional Location field; registering without one behaves exactly as before.
- Production build: maplibre-gl is in its own lazy chunk (not referenced from index.html).
```

### Prompt B1: dependency and library layer

```text
In /frontend: run `npm install maplibre-gl@6.17.0 --save-exact`. Copy PACK/frontend/src/lib/{geo.js,globeSpin.js,maplibreLoader.js} and PACK/frontend/test/{geo.js,globeSpin.js,manifestLocation.js} into the same paths. Then apply edits 3a and 3b from Prompt A to src/lib/manifest.js and src/lib/manifestMeta.js (merge, do not overwrite; keep the ".js" extension on the geo import). Do not touch contracts or .env.
Run `npm test`. All 21 new tests must pass. Existing failures that need compiled artifacts or `chai` are pre-existing; list them and move on.
Acceptance: without lat/lng, buildManifest output is byte-identical to before.
```

### Prompt B2: data layer

```text
In /frontend/src/hooks/useParcels.js apply edit 3c from Prompt A: each parcel gets `loc` ({lat,lng}) and `locKind` ("recorded" | "demo"), using normalizeLoc and demoPlacement from ../lib/geo. Merge into my current file; do not overwrite it. Do not change anything else in that hook.
Run `npm run build` and `npm run lint`. Show me `git diff` for this file only.
Acceptance: diff is about 8 added lines; build passes.
```

### Prompt B3: globe page

```text
Copy PACK/frontend/src/components/{GlobeView.jsx,PlotCard.jsx,MapPage.jsx,globe.css} into frontend/src/components/. In src/App.jsx swap MapView for MapPage (edit 3e). Do NOT modify MapView.jsx.
Run `npm run build` and `npm run lint`. Confirm in the build output that maplibre-gl is a separate chunk and index.html does not reference it.
Then start `npm run dev`, open the Map tab, and check: globe renders and rotates, markers are hollow with "demo location", clicking a marker opens the card, the GLOBE / DISTRICT MAP switch works and is remembered after reload.
Acceptance: no new console errors (Alchemy 400 log-limit messages are known and ignorable).
```

### Prompt B4: location picker on the Register tab

```text
Copy PACK/frontend/src/components/LocationPicker.jsx into frontend/src/components/. Apply edit 3d from Prompt A to RegisterView.jsx, merging with my current file (it contains recent fixes: wrapFileKey receives raw bytes, grantAccessBatch receives bytes not hex; do not undo those). The picker must render AFTER the closing </form> tag; every button inside it must be type="button".
Run `npm test`, `npm run lint`, `npm run build`.
Manual check: Register tab > PICK ON GLOBE opens a modal globe; clicking drops a draggable pin; typing coordinates and pressing Enter sets the pin WITHOUT submitting the registration form; USE THIS LOCATION fills the field; registering without a location still works as before.
```

---

## 4. Verification checklist (do this on the deployed site)

Automated (already green in my run; re-run after merging):

```bash
cd frontend && npm test && npm run lint && npm run build
```

Manual, in Brave or Chrome:

1. **Map tab:** spinning globe, credit text "© OpenStreetMap contributors" bottom-right. Dragging stops the spin. The **SPIN** button restarts it.
2. **Your existing parcels:** hollow markers in the USA, list rows say "demo location". Clicking one shows "demo placement · no location recorded".
3. **Filters and search:** status chips hide markers. Searching an area name (for example "Orchard") zooms to its parcels. Searching a plot ID selects it.
4. **District map:** click DISTRICT MAP. It should look and behave exactly as before. Reload: your choice is remembered.
5. **Register with a location:** unlock the vault, open Register, click PICK ON GLOBE, drop a pin (use a **test location, not a real home**), confirm, submit. Afterwards the parcel shows as a solid marker at that spot. In the same browser this is immediate; in another browser or incognito it appears once the manifest is read, which needs `VITE_PINATA_GATEWAY` set.
6. **Phone:** open the site on a phone over HTTPS, tap USE MY LOCATION, allow access. Expect a few metres outdoors. On a laptop, expect it to be rough and drag the pin.
7. **Fallback:** in a browser with WebGL disabled, the Map tab should show the district map with a notice.
8. **Console:** only the known Alchemy `400` log-limit lines may appear.

---

## 5. Rollback

- **Quick, no deploy of old code:** in `MapPage.jsx`, change the default in `readMode` from `"globe"` to `"district"`. The globe stays available behind the switch.
- **Full:** in `App.jsx`, import `MapView` again instead of `MapPage`. All new files can stay unused.
- Parcels registered with a location keep working: the extra `lat`/`lng` fields in their manifests are ignored by the old code.

---

## 6. What was and was not tested

**Tested:**
- 21 unit tests (coordinates, demo placement, spinner, manifest compatibility).
- 32 component checks in a simulated browser with a recording stand-in for MapLibre. They cover markers, selection, filters, search, fallback, and every picker path including permission denied and typed input. Two deliberate bugs were caught by them.
- Production build and lint.
- The existing suites that could run in my environment pass alongside the new tests (45 of 45). `revert.js` could not run there because it needs the `chai` package, so run `npm test` on your side.

**Not tested (cannot be done outside a real browser):**
- How the globe actually looks and feels, real tile loading, and real phone GPS.
- A full registration on Sepolia with a location, from pin to manifest on Pinata and back. The manifest round trip is unit-tested, and the Register edits are small and reviewed by diff.
- `.mapwrap` height: the new switch bar adds a little height above the map. If the page scrolls oddly, adjust it in `globe.css` / `index.css`.

---

## 7. Known limits and later work

- **Public and permanent:** coordinates go into the public manifest and cannot be deleted. Use fake locations in the pilot.
- **A pin is not proof of ownership.** The surveyor's verification is the safeguard. The app labels recorded pins as "recorded pin" and does not call them verified.
- **Demo placements** are display-only, stable per parcel id, labelled and drawn hollow. Existing parcels keep them because their manifests cannot be edited.
- **`PlotCard.jsx` duplicates MapView's card** on purpose, so the old map stays untouched. Later cleanup, once the globe is trusted:

```text
Refactor frontend/src/components/MapView.jsx to use PlotCard (frontend/src/components/PlotCard.jsx) instead of its inline card, keeping behaviour identical, then delete the duplicated JSX. Run tests and build; compare the card for each status (approved, pending, sale, court, disputed) before and after.
```

- **Next features (not built):** polygon boundary drawing, overlap warnings between parcels, and location edits through the Corrections flow (check how it versions manifests first).
