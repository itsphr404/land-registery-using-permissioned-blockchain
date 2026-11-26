import test from "node:test";
import assert from "node:assert/strict";
import { createSpinner } from "../src/lib/globeSpin.js";


function fakeMap(zoom = 1.5) {
    const state = { lng: 0, lat: 20, zoom, jumps: 0 };
    return {
        state,
        getCenter: () => ({ lng: state.lng, lat: state.lat }),
        getZoom: () => state.zoom,
        jumpTo: ({ center }) => { state.lng = center[0]; state.lat = center[1]; state.jumps += 1; }
    };
}
// manual frame scheduler so the test controls time
function scheduler() {
    let queue = [];
    let id = 0;
    return {
        raf: (fn) => { id += 1; queue.push({ id, fn }); return id; },
        caf: (cancelId) => { queue = queue.filter((item) => item.id !== cancelId); },
        run: (now) => { const batch = queue; queue = []; batch.forEach((item) => item.fn(now)); },
        pending: () => queue.length
    };
}

test("rotates east at the configured speed while zoomed out", () => {
    const map = fakeMap(1.5), s = scheduler();
    const spinner = createSpinner(map, { degreesPerSecond: 10, raf: s.raf, caf: s.caf, isHidden: () => false });
    const t0 = performance.now();
    spinner.start();
    assert.equal(spinner.isOn(), true);
    s.run(t0 + 50); s.run(t0 + 100);              // two frames of 50 ms
    assert.ok(Math.abs(map.state.lng - 1) < 0.2, `moved ${map.state.lng} degrees`);   // 100 ms * 10 deg/s = 1 degree
    assert.equal(map.state.lat, 20);
});

test("stop() halts movement and cancels the pending frame", () => {
    const map = fakeMap(), s = scheduler();
    const spinner = createSpinner(map, { raf: s.raf, caf: s.caf, isHidden: () => false });
    spinner.start();
    s.run(performance.now() + 30);
    const before = map.state.jumps;
    spinner.stop();
    assert.equal(spinner.isOn(), false);
    assert.equal(s.pending(), 0);
    s.run(performance.now() + 500);
    assert.equal(map.state.jumps, before);
});

test("does not rotate when zoomed in or when the tab is hidden", () => {
    const zoomed = fakeMap(8), s1 = scheduler();
    const a = createSpinner(zoomed, { raf: s1.raf, caf: s1.caf, isHidden: () => false });
    a.start(); s1.run(performance.now() + 50);
    assert.equal(zoomed.state.jumps, 0);

    const hiddenMap = fakeMap(1), s2 = scheduler();
    const b = createSpinner(hiddenMap, { raf: s2.raf, caf: s2.caf, isHidden: () => true });
    b.start(); s2.run(performance.now() + 50);
    assert.equal(hiddenMap.state.jumps, 0);
    assert.equal(b.isOn(), true, "still scheduled so it resumes when visible again");
});

test("a long pause between frames does not make the globe jump", () => {
    const map = fakeMap(), s = scheduler();
    const spinner = createSpinner(map, { degreesPerSecond: 10, raf: s.raf, caf: s.caf, isHidden: () => false });
    spinner.start();
    s.run(performance.now() + 60_000);   // a minute later
    assert.ok(map.state.lng <= 1.01, `jumped ${map.state.lng} degrees`);   // dt is clamped to 100 ms
});

test("start() twice does not double the speed", () => {
    const map = fakeMap(), s = scheduler();
    const spinner = createSpinner(map, { raf: s.raf, caf: s.caf, isHidden: () => false });
    spinner.start(); spinner.start();
    assert.equal(s.pending(), 1);
});

test("longitude wraps at the antimeridian", () => {
    const map = fakeMap(); map.state.lng = 179.9;
    const s = scheduler();
    const spinner = createSpinner(map, { degreesPerSecond: 100, raf: s.raf, caf: s.caf, isHidden: () => false });
    const t0 = performance.now();
    spinner.start(); s.run(t0 + 100);
    assert.ok(map.state.lng < -170 || map.state.lng > 179, `lng ${map.state.lng}`);
    assert.ok(map.state.lng >= -180 && map.state.lng < 180);
});
