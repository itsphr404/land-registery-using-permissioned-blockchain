'use strict';
/* Config: roles, routes, status labels, helpers. */
const ROLES={citizen:"Citizen",surveyor:"Surveyor",registrar:"Registrar",court:"Court officer",investor:"Investor",admin:"Administrator"};
const VIEWS={map:"Map",dashboard:"Dashboard",registry:"Registry",sales:"Sales and escrow",register:"Register",corrections:"Corrections",shares:"Shares",audit:"Audit trail"};
const ST={approved:["Approved","✓"],sale:["On sale","₹"],disputed:["Disputed","!"],court:["Court case","§"],pending:["Pending","…"]};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rnd=n=>{const x=Math.sin(n*127.1+3.3)*43758.5453;return x-Math.floor(x)};
const $=id=>document.getElementById(id);
