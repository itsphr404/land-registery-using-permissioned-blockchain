// Slow automatic rotation for a globe. Works with any object that has getCenter, getZoom and jumpTo,
// so it can be tested with a fake map. Rotation only happens while the globe is zoomed out.
import { wrapLng } from "./geo.js";

export function createSpinner(map, { degreesPerSecond = 3, maxZoom = 3.2, raf, caf, isHidden } = {}) {
    const requestFrame = raf || ((fn) => requestAnimationFrame(fn));
    const cancelFrame = caf || ((id) => cancelAnimationFrame(id));
    const hidden = isHidden || (() => typeof document !== "undefined" && document.hidden);
    let on = false;
    let frame = null;
    let last = 0;

    const tick = (now) => {
        if (!on) return;
        const dt = Math.min(Math.max(now - last, 0), 100); // ignore long gaps, such as a background tab
        last = now;
        if (!hidden() && map.getZoom() < maxZoom) {
            const center = map.getCenter();
            map.jumpTo({ center: [wrapLng(center.lng + (dt / 1000) * degreesPerSecond), center.lat] });
        }
        frame = requestFrame(tick);
    };

    return {
        start() {
            if (on) return;
            on = true;
            last = typeof performance !== "undefined" ? performance.now() : 0;
            frame = requestFrame(tick);
        },
        stop() {
            on = false;
            if (frame !== null) cancelFrame(frame);
            frame = null;
        },
        isOn() {
            return on;
        }
    };
}
