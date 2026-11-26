import test from "node:test";
import assert from "node:assert/strict";
import * as geo from "../src/lib/geo.js";


test("normalizeLoc accepts good coordinates and rounds to 6 decimals", () => {
    assert.deepEqual(geo.normalizeLoc(39.09973456, -94.57862198), { lat: 39.099735, lng: -94.578622 });
    assert.deepEqual(geo.normalizeLoc("39.1", "-94.5"), { lat: 39.1, lng: -94.5 });
    assert.deepEqual(geo.normalizeLoc(-90, 180), { lat: -90, lng: 180 });
});

test("normalizeLoc rejects anything that is not a usable coordinate", () => {
    for (const [lat, lng] of [
        [91, 0.5], [-91, 0.5], [10, 181], [10, -181],
        [NaN, 5], [5, Infinity], [null, null], [undefined, 5], ["", ""], ["abc", "def"],
        [0, 0], ["0", "0"], [{}, []], [true, false]
    ]) {
        assert.equal(geo.normalizeLoc(lat, lng), null, `should reject (${String(lat)}, ${String(lng)})`);
    }
});

test("wrapLng keeps longitude in range", () => {
    assert.equal(geo.wrapLng(190), -170);
    assert.equal(geo.wrapLng(-190), 170);
    assert.equal(geo.wrapLng(0), 0);
    assert.equal(geo.wrapLng(180), -180);
    assert.equal(geo.wrapLng(540), -180);
});

test("formatCoords writes hemispheres", () => {
    assert.equal(geo.formatCoords({ lat: 39.0997, lng: -94.5786 }), "39.09970° N, 94.57860° W");
    assert.equal(geo.formatCoords({ lat: -33.8688, lng: 151.2093 }), "33.86880° S, 151.20930° E");
    assert.equal(geo.formatCoords(null), "");
});

test("boundsOf", () => {
    assert.equal(geo.boundsOf([]), null);
    assert.equal(geo.boundsOf(null), null);
    assert.deepEqual(geo.boundsOf([{ lat: 10, lng: 20 }]), [[20, 10], [20, 10]]);
    assert.deepEqual(geo.boundsOf([{ lat: 10, lng: 20 }, { lat: -5, lng: 40 }, null, { lat: NaN, lng: 1 }]), [[20, -5], [40, 10]]);
});

test("demoPlacement is stable: the same parcel always gets the same point", () => {
    for (const pid of [1, 2, 3, 17, 250, "5", 7n]) {
        assert.deepEqual(geo.demoPlacement(pid), geo.demoPlacement(pid));
    }
    assert.deepEqual(geo.demoPlacement(3), geo.demoPlacement("3"));
});

test("demoPlacement: exactly 40 cities, first 40 parcels all land in different cities", () => {
    assert.equal(geo.DEMO_PLACES.length, 40);
    const cities = new Set();
    for (let pid = 1; pid <= 40; pid += 1) cities.add(geo.demoPlacement(pid).place);
    assert.equal(cities.size, 40);
});

test("demoPlacement: always inside the continental USA and close to its city", () => {
    for (let pid = 0; pid < 500; pid += 1) {
        const p = geo.demoPlacement(pid);
        assert.ok(p.lat > 24 && p.lat < 50, `lat ${p.lat}`);
        assert.ok(p.lng > -125 && p.lng < -66, `lng ${p.lng}`);
        const city = geo.DEMO_PLACES.find((c) => c.name === p.place);
        assert.ok(geo.distanceKm(p, city) < 4, `pid ${pid} is ${geo.distanceKm(p, city).toFixed(1)} km from ${p.place}`);
        assert.notEqual(geo.normalizeLoc(p.lat, p.lng), null);
    }
});

test("demoPlacement copes with junk ids without throwing", () => {
    for (const bad of [undefined, null, NaN, "x", -4, 1.9]) {
        const p = geo.demoPlacement(bad);
        assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }
});

test("every demo city is a plausible US location (sanity check on the hand-written list)", () => {
    const names = new Set();
    for (const c of geo.DEMO_PLACES) {
        assert.ok(c.lat > 25 && c.lat < 49 && c.lng > -125 && c.lng < -67, c.name);
        assert.ok(!names.has(c.name), `duplicate ${c.name}`);
        names.add(c.name);
    }
});
