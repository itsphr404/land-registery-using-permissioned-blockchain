# Terra Registry frontend (map demo)
Plain HTML/CSS/JS, no build step. Open index.html, or run `npx serve .` in this folder.

## Structure
- index.html        shell and script order
- css/styles.css    design tokens (:root variables) and styles, dark mode included
- js/config.js      ROLES, VIEWS (tabs/routes), status labels, helpers
- js/mock-data.js   all demo data (areas, plots, audit). Replace with real data
- js/services.js    `svc.*` service layer. EVERY method is a mock
- js/map.js         state and the map: pan, zoom, fly-to, markers, search
- js/ui.js          plot card, status glyphs, map screen, role queue
- js/views.js       tab views (dashboard, registry, sales, register, audit)
- js/views-extra.js legal corrections and fractional shares pages (own mock data and svc methods)
- js/main.js        render, routing, events

## Routes (hash)
#map, #dashboard, #registry, #sales, #register, #corrections, #shares, #audit

## Integration
1. Replace svc.approvePending / approveSale / create with real API or contract calls, keeping return shapes.
2. Views read the in-memory arrays P (plots) and AUD (audit) directly. Replace them with async fetches, then call render().
3. Real map: the drawn satellite base in map.js is simulated. Use real tiles (Leaflet with Mapbox or OpenStreetMap) and a geocoder for search, and draw plots from stored coordinates. Keep the status glyph logic in ui.js and map.js.
4. Wallet and contract calls belong in services.js behind svc. Never put private keys in the browser; privileged actions belong server-side.
5. The role selector is a demo switch. Enforce authorisation in the backend and contracts, not by disabling buttons.
6. Put API base URL and contract addresses in config.js, read from your deployment config.

## Not implemented
Real wallet, blockchain, IPFS, encryption, KYC, real imagery. Timelocks are displayed, not enforced. Tokenisation, compliance and rent distribution are simulated.
