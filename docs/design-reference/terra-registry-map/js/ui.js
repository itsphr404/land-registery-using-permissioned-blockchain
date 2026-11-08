'use strict';
/* Plot card, status glyphs, map screen and role queue. */
function card(){const p=P.find(x=>x.id===S.sel);if(!p)return"";const l=(a,b)=>`<div class="lead"><span>${a}</span><i></i><span>${b}</span></div>`;
 let x=l("Owner",esc(p.owner))+l("Size",p.size);
 if(p.sale)x+=l("Asking price",p.sale.price)+l("Escrow",p.sale.funded?"buyer deposit held":"no deposit")+`<button class="btn alt" data-a="sales" style="margin-top:8px">OPEN IN SALES AND ESCROW</button>`;
 if(p.court)x+=l("Case",p.court.no)+l("Court",esc(p.court.court))+l("Next hearing",p.court.hearing)+`<div class="note">Transfers are frozen while the case is open (demo rule).</div>`;
 if(p.dispute)x+=`<div class="note">${esc(p.dispute)}. Sale and fractionalisation blocked until resolved.</div>`;
 if(p.st==="pending")x+=l("Verification","awaiting surveyor and registrar");
 if(p.st==="approved")x+=l("Verification","approved by registrar (demo)");
 return `<div class="card" role="dialog" aria-label="Plot ${p.id}"><button class="x" data-a="close">CLOSE</button><span class="mono">${p.id}</span><h3>${esc(p.addr)}</h3><span class="stamp st-${p.st}">${ST[p.st][0]}</span>${x}</div>`}
const g=s=>`<span class="g ${s}" aria-hidden="true">${ST[s][1]}</span>`;
function mapView(){const cnt=s=>P.filter(p=>p.st===s).length;
 const list=P.filter(p=>S.on[p.st]&&(!S.rs||p.area===S.rs)&&(S.view==="map")).slice(0,40);
 return `<div class="mapwrap"><div class="side"><div class="srch"><input id="q" list="al" placeholder="Search area, plot ID or owner" aria-label="Search" value="${esc(S.rq)}"><button class="btn" data-a="go">GO</button></div><datalist id="al">${Object.keys(AREAS).map(a=>`<option value="${a}">`).join("")}</datalist>
 <p class="mono" role="status" style="color:var(--mute);margin:8px 0 0">${esc(S.msg)}</p>
 <div class="chips" role="group" aria-label="Show plots by status">${Object.keys(ST).map(s=>`<button class="chip" data-s="${s}" aria-pressed="${!!S.on[s]}">${g(s)}${ST[s][0]} ${cnt(s)}</button>`).join("")}</div>
 <div class="res">${list.map(p=>`<button data-id="${p.id}">${g(p.st)}<span><strong class="mono">${p.id}</strong><br><span style="font-size:13px;color:var(--mute)">${esc(p.addr)} · ${ST[p.st][0]}</span></span></button>`).join("")||'<p class="sub">No plots for this filter.</p>'}</div></div>
 <div class="mapbox"><svg id="map" viewBox="${V.x} ${V.y} ${V.w} ${V.h}" role="group" aria-label="Satellite-style map of registered plots"><g>${base}</g><g id="mk">${layer()}</g></svg>
 <div class="zoom"><button data-a="zi" aria-label="Zoom in">+</button><button data-a="zo" aria-label="Zoom out">−</button><button data-a="all" aria-label="Show whole district" style="font-size:11px">ALL</button></div>
 <span class="tag">SIMULATED IMAGERY · drag to pan, scroll to zoom</span>${card()}</div></div>`}
function queue(){const r=S.role,o=[];
 if(r==="registrar")P.filter(p=>p.st==="pending").forEach(p=>o.push([p.id+" awaiting approval",`<button class="btn" data-a="appr" data-id="${p.id}">APPROVE</button>`]));
 if(r==="registrar"||r==="citizen")P.filter(p=>p.sale&&!p.sale[r==="registrar"?"regOk":"sellerOk"]).slice(0,3).forEach(p=>o.push([p.id+" sale needs your approval",`<button class="btn alt" data-a="sales">OPEN</button>`]));
 if(r==="court")P.filter(p=>p.court).forEach(p=>o.push([p.court.no+" · "+p.id+" · hearing "+p.court.hearing,`<button class="btn alt" data-a="loc" data-id="${p.id}">SHOW ON MAP</button>`]));
 if(r==="surveyor")P.filter(p=>p.st==="pending").forEach(p=>o.push([p.id+" survey outstanding",`<button class="btn alt" data-a="loc" data-id="${p.id}">SHOW ON MAP</button>`]));
 if(r==="investor"||r==="admin")o.push([r==="admin"?"Role management is not in this demo":"Fractional ownership is not in this demo",""]);
 return o.length?o.map(x=>`<div class="ev" style="grid-template-columns:1fr auto"><span>${esc(x[0])}</span><span>${x[1]}</span></div>`).join(""):'<p class="sub">Nothing waiting for this role.</p>'}
