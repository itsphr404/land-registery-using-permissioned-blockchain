export const ROLES = {
  citizen: "Citizen",
  surveyor: "Surveyor",
  registrar: "Registrar",
  court: "Court officer",
  issuer: "Issuer",
  admin: "Administrator",
};

export const VIEWS = {
  map: "Map",
  dashboard: "Dashboard",
  registry: "Registry",
  sales: "Sales and escrow",
  register: "Register",
  corrections: "Corrections",
  shares: "Shares",
  audit: "Audit trail",
};

export const ST = {
  approved: ["Approved", "✓"],
  sale: ["On sale", "ETH"],
  disputed: ["Disputed", "!"],
  court: ["Court case", "§"],
  pending: ["Pending", "…"],
};

export const AREAS = {
  Northfield: [300, 260],
  Lakeview: [1050, 170],
  Riverside: [1050, 500],
  Downtown: [300, 500],
  Harbour: [1330, 760],
  Orchard: [380, 780],
};

export const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 3.3) * 43758.5453;
  return x - Math.floor(x);
};

export const cellPts = (a, c, k) => {
  const [ax, ay] = AREAS[a] || [400, 400];
  const i = c % 4,
    j = (c / 4) | 0,
    // Keep a deliberate buffer between parcels. The buffer must be larger
    // than the bounded terrain jitter so adjacent cells cannot overlap.
    x = ax + i * 120,
    y = ay + j * 96;
  return [
    [0, 0],
    [88, 0],
    [88, 68],
    [0, 68],
  ].map((p, m) => [
    Math.round(x + p[0] + (rnd(k * 9 + m) - 0.5) * 4),
    Math.round(y + p[1] + (rnd(k * 9 + m + 5) - 0.5) * 4),
  ]);
};
