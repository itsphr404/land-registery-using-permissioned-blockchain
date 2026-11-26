// Location helpers. Pure functions with no browser or React dependencies, so they are unit-testable.

const round6 = (value) => Math.round(value * 1e6) / 1e6;

// Accepts numbers or numeric strings. Returns { lat, lng } rounded to 6 decimals (about 0.1 m),
// or null for anything that is not a usable coordinate. Exactly (0, 0) is rejected because it is
// almost always a default value and not a real parcel location.
export function normalizeLoc(lat, lng) {
    const toNumber = (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value);
    const la = toNumber(lat);
    const lo = toNumber(lng);
    if (typeof la !== "number" || typeof lo !== "number") return null;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
    if (la === 0 && lo === 0) return null;
    return { lat: round6(la), lng: round6(lo) };
}

// Keeps a longitude inside [-180, 180).
export function wrapLng(lng) {
    return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function formatCoords(loc) {
    if (!loc) return "";
    const ns = loc.lat >= 0 ? "N" : "S";
    const ew = loc.lng >= 0 ? "E" : "W";
    return `${Math.abs(loc.lat).toFixed(5)}° ${ns}, ${Math.abs(loc.lng).toFixed(5)}° ${ew}`;
}

// Great-circle distance in kilometres.
export function distanceKm(a, b) {
    const rad = (deg) => (deg * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// [[west, south], [east, north]] around a list of { lat, lng }, or null for an empty list.
export function boundsOf(locs) {
    const valid = (locs || []).filter((loc) => loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));
    if (valid.length === 0) return null;
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const { lat, lng } of valid) {
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
    }
    return [[west, south], [east, north]];
}

// Inland US cities used for DEMO placements of parcels that have no recorded location.
// Inland on purpose, so a small jitter around each one still lands on land. Exactly 40 entries:
// the placement step (13) is coprime with 40, so the first 40 parcel ids all get different cities.
export const DEMO_PLACES = [
    { name: "Kansas City, MO", lat: 39.0997, lng: -94.5786 },
    { name: "Denver, CO", lat: 39.7392, lng: -104.9903 },
    { name: "Austin, TX", lat: 30.2672, lng: -97.7431 },
    { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
    { name: "Minneapolis, MN", lat: 44.9778, lng: -93.265 },
    { name: "Nashville, TN", lat: 36.1627, lng: -86.7816 },
    { name: "Atlanta, GA", lat: 33.749, lng: -84.388 },
    { name: "Phoenix, AZ", lat: 33.4484, lng: -112.074 },
    { name: "Salt Lake City, UT", lat: 40.7608, lng: -111.891 },
    { name: "Omaha, NE", lat: 41.2565, lng: -95.9345 },
    { name: "Albuquerque, NM", lat: 35.0844, lng: -106.6504 },
    { name: "Charlotte, NC", lat: 35.2271, lng: -80.8431 },
    { name: "Columbus, OH", lat: 39.9612, lng: -82.9988 },
    { name: "Indianapolis, IN", lat: 39.7684, lng: -86.1581 },
    { name: "St. Louis, MO", lat: 38.627, lng: -90.1994 },
    { name: "Oklahoma City, OK", lat: 35.4676, lng: -97.5164 },
    { name: "Des Moines, IA", lat: 41.5868, lng: -93.625 },
    { name: "Boise, ID", lat: 43.615, lng: -116.2023 },
    { name: "Billings, MT", lat: 45.7833, lng: -108.5007 },
    { name: "Fargo, ND", lat: 46.8772, lng: -96.7898 },
    { name: "Wichita, KS", lat: 37.6872, lng: -97.3301 },
    { name: "Memphis, TN", lat: 35.1495, lng: -90.049 },
    { name: "Louisville, KY", lat: 38.2527, lng: -85.7585 },
    { name: "Little Rock, AR", lat: 34.7465, lng: -92.2896 },
    { name: "Birmingham, AL", lat: 33.5186, lng: -86.8104 },
    { name: "Dallas, TX", lat: 32.7767, lng: -96.797 },
    { name: "Cincinnati, OH", lat: 39.1031, lng: -84.512 },
    { name: "Pittsburgh, PA", lat: 40.4406, lng: -79.9959 },
    { name: "Madison, WI", lat: 43.0731, lng: -89.4012 },
    { name: "Sioux Falls, SD", lat: 43.5446, lng: -96.7311 },
    { name: "Cheyenne, WY", lat: 41.14, lng: -104.8202 },
    { name: "Las Vegas, NV", lat: 36.1699, lng: -115.1398 },
    { name: "Tucson, AZ", lat: 32.2226, lng: -110.9747 },
    { name: "Raleigh, NC", lat: 35.7796, lng: -78.6382 },
    { name: "Knoxville, TN", lat: 35.9606, lng: -83.9207 },
    { name: "Lincoln, NE", lat: 40.8136, lng: -96.7026 },
    { name: "Spokane, WA", lat: 47.6588, lng: -117.426 },
    { name: "Colorado Springs, CO", lat: 38.8339, lng: -104.8214 },
    { name: "Amarillo, TX", lat: 35.222, lng: -101.8313 },
    { name: "Springfield, MO", lat: 37.209, lng: -93.2923 }
];

const DEMO_STEP = 13;
const MAX_JITTER_LAT = 0.02; // degrees, about 2.2 km
const MAX_JITTER_LNG = 0.025; // degrees, about 2 km at US latitudes

const jitter = (seed) => {
    const x = Math.sin(seed * 127.1 + 3.3) * 43758.5453;
    return x - Math.floor(x) - 0.5; // [-0.5, 0.5)
};

// A stable, made-up location in the USA for a parcel that has no recorded location.
// The same parcel id always gives the same point, for every visitor. It is display-only.
export function demoPlacement(pid) {
    const n = Math.abs(Math.trunc(Number(pid))) || 0;
    const place = DEMO_PLACES[(n * DEMO_STEP) % DEMO_PLACES.length];
    return {
        lat: round6(place.lat + jitter(n * 2 + 1) * 2 * MAX_JITTER_LAT),
        lng: round6(place.lng + jitter(n * 2 + 2) * 2 * MAX_JITTER_LNG),
        place: place.name
    };
}
