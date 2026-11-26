// Everything needed to show a MapLibre globe, kept in one place.
// maplibre-gl is loaded on demand (code-split), so the rest of the app never pays for it
// and keeps working if it fails to load.
import { createSpinner } from "./globeSpin.js";

// No API key is needed for the default OpenStreetMap tiles. To use another tile provider later,
// set VITE_MAP_TILE_URL (and VITE_MAP_ATTRIBUTION) in the build environment.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
export const TILE_URL = env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION =
    env.VITE_MAP_ATTRIBUTION ||
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export function buildStyle({ tileUrl = TILE_URL, attribution = ATTRIBUTION } = {}) {
    return {
        version: 8,
        sources: { base: { type: "raster", tiles: [tileUrl], tileSize: 256, maxzoom: 19, attribution } },
        layers: [{ id: "base", type: "raster", source: "base" }]
    };
}

export function hasWebGL() {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
}

export function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
        return false;
    }
}

let loading = null;
export function loadMaplibre() {
    if (!loading) {
        loading = Promise.all([
            import("maplibre-gl"),
            import("maplibre-gl/dist/maplibre-gl.css"),
            import("maplibre-gl/dist/maplibre-gl-worker.mjs?url")
        ])
            .then(([mod, , worker]) => {
                const lib = mod.default || mod;
                lib.setWorkerUrl(worker.default);
                return lib;
            })
            .catch((error) => {
                loading = null; // allow a retry after a network failure
                throw error;
            });
    }
    return loading;
}

// Creates a globe-projection map with the attribution always visible (required by OpenStreetMap).
export function createGlobe(maplibregl, container, { center = [-40, 25], zoom = 1.5, maxZoom = 18 } = {}) {
    const map = new maplibregl.Map({
        container,
        style: buildStyle(),
        center,
        zoom,
        minZoom: 0.6,
        maxZoom,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    map.touchZoomRotate.disableRotation();
    // The projection can only be set once the style has loaded.
    map.on("style.load", () => map.setProjection({ type: "globe" }));
    return map;
}

// Starts the slow rotation (unless the visitor prefers reduced motion) and stops it for good
// as soon as the visitor drags, pinches, scrolls or uses the keyboard on the map.
export function attachAutoSpin(map) {
    const spinner = createSpinner(map);
    map.on("movestart", (event) => {
        if (event && event.originalEvent) spinner.stop();
    });
    if (!prefersReducedMotion()) spinner.start();
    return spinner;
}
