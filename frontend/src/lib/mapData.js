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
    x = ax + i * 104,
    y = ay + j * 84;
  return [
    [0, 0],
    [88, 0],
    [88, 68],
    [0, 68],
  ].map((p, m) => [
    Math.round(x + p[0] + (rnd(k * 9 + m) - 0.5) * 12),
    Math.round(y + p[1] + (rnd(k * 9 + m + 5) - 0.5) * 12),
  ]);
};

// Generate base district plots from zip's mock-data.js
const OWN_NAMES = [
  "Asha Kapoor", "Meera Iyer", "Daniel Fernandes", "Farah Siddiqui",
  "Imran Qureshi", "Lena Park", "Noor Haddad", "Karan Mehta",
  "Priya Nair", "Omar Sheikh", "Elena Rossi", "Vikram Rao"
];
const PAT = ["approved", "sale", "approved", "disputed", "approved", "court", "pending", "approved", "sale"];

export function generateDistrictPlots() {
  const list = [];
  Object.keys(AREAS).forEach((a, ai) => {
    PAT.forEach((st, n) => {
      const k = ai * 9 + n;
      const c = n + (n > 5 ? 1 : 0) + (n > 2 ? 0 : 0);
      const plot = {
        id: "TR-" + a.slice(0, 3).toUpperCase() + "-" + String(n + 1).padStart(3, "0"),
        area: a,
        cell: c,
        addr: "Plot " + (n + 1) + ", " + a,
        owner: OWN_NAMES[(k * 5) % 12],
        st: PAT[(n + ai * 2) % 9],
        pts: cellPts(a, c, k),
        size: 240 + Math.round(rnd(k) * 500) + " m²",
      };
      if (plot.st === "sale") {
        plot.sale = {
          buyer: OWN_NAMES[(k * 3 + 1) % 12],
          price: "1." + (2 + Math.round(rnd(k + 2) * 8)) + " ETH",
          funded: true,
          sellerOk: rnd(k) > 0.5,
          regOk: false,
        };
      }
      if (plot.st === "court") {
        plot.court = {
          no: "CC-2026-" + (100 + k),
          court: "District Court, " + a,
          hearing: "2026-11-" + String(5 + n).padStart(2, "0"),
        };
      }
      if (plot.st === "disputed") {
        plot.dispute = "Boundary claim by neighbouring owner, filed 2026-09-14";
      }
      list.push(plot);
    });
  });
  return list;
}
