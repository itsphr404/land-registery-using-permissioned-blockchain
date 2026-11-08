'use strict';
/* Legal corrections and fractional-share pages. MOCK data and mock svc methods live here; move them into mock-data.js and services.js when integrating. */
const CORR_ROLES=["court","registrar","admin"];
const CORR={open:[{id:"CO-81",pid:P.find(p=>p.st==="approved"&&p.id.startsWith("TR-LAK")).id,field:"Size",old:null,neu:"645 m²",need:3,by:[],unlock:"2026-10-29"}],
 done:[{id:"CO-77",pid:P[0].id,field:"Size",old:"408 m²",neu:"412 m²",date:"2025-08-02",ref:"court order ref CO-77 (demo)"}]};
P[0].size="412 m²";/* matches applied correction CO-77 */
CORR.open[0].old=P.find(p=>p.id===CORR.open[0].pid).size;
const SH=(()=>{const p=P.find(x=>x.st==="approved"&&x.area==="Orchard");return{pid:p.id,addr:p.addr,total:1000,
 holders:[["Investor A",250,"eligible"],["Investor B",150,"eligible"],["Investor C",100,"blocked"]],
 rent:[["2026-08","₹ 40,000",true],["2026-09","₹ 40,000",true],["2026-10","₹ 42,000",false]]}})();
Object.assign(svc,{
 async approveCorr(id,role){await delay(200);const c=CORR.open.find(x=>x.id===id);if(!c.by.includes(role))c.by.push(role);log(ROLES[role],"Approval on correction "+id,1);
  if(c.by.length>=c.need){const p=P.find(x=>x.id===c.pid);p.size=c.neu;CORR.open=CORR.open.filter(x=>x!==c);CORR.done.unshift({id:c.id,pid:c.pid,field:c.field,old:c.old,neu:c.neu,date:"2026-10-28",ref:"threshold met; timelock not enforced in demo"});log("System","Correction "+id+" appended as new version; earlier version preserved","1")}},
 async claim(i){await delay(200);SH.rent[i][2]=true;log("Investor","Rent claim for "+SH.rent[i][0])}});
VIEW.corrections=()=>{const can=r=>CORR_ROLES.includes(r);
 const open=CORR.open.map(c=>`<div class="ev"><time>${c.id}<br>${c.pid}</time><div><strong>${c.field}</strong> <span class="old">${esc(c.old)}</span><span class="new">${esc(c.neu)}</span><br><span class="mono">Approvals ${c.by.length} of ${c.need}${c.by.length?" ("+c.by.map(r=>ROLES[r]).join(", ")+")":""} · timelock until ${c.unlock} (displayed, not enforced)</span><br>
 <button class="btn alt" data-a="corr" data-id="${c.id}" ${can(S.role)&&!c.by.includes(S.role)?"":"disabled"} style="margin-top:6px">APPROVE AS ${ROLES[S.role].toUpperCase()}</button>${can(S.role)?"":' <span class="mono">Only court officer, registrar or administrator roles can approve.</span>'}</div></div>`).join("");
 const done=CORR.done.map(c=>`<div class="ev"><time>${c.date}<br>${c.pid}</time><div><span class="stamp st-court">Applied</span> <strong>${c.field}</strong> <span class="old">${esc(c.old)}</span><span class="new">${esc(c.neu)}</span><br><span class="mono">${esc(c.ref)} · earlier version kept in history</span></div></div>`).join("");
 return `<h1>Legal <i>corrections</i></h1><p class="sub">A correction never edits history. It is proposed with a court-order reference, approved by a threshold of authorised roles, then appended as a new version.</p><div class="k">Proposed</div>${open||'<p class="sub">No open requests.</p>'}<div class="k">Applied</div>${done}`};
VIEW.shares=()=>{const W=600;let x=0;
 const seg=SH.holders.map((h,i)=>{const w=h[1]/SH.total*W,ok=h[2]==="eligible",r=`<rect x="${x}" y="0" width="${w}" height="46" fill="${ok?(i?"url(#hc)":"url(#hv)"):"none"}" stroke="currentColor" ${ok?"":'stroke-dasharray="4 3"'}/><text x="${x+6}" y="28" font-size="11" font-family="monospace" fill="currentColor">${h[0].replace("Investor ","")} ${h[1]/10}%</text>`;x+=w;return r}).join("");
 const held=SH.holders.filter(h=>h[2]==="eligible").reduce((a,h)=>a+h[1],0);
 return `<h1>Fractional <i>shares</i></h1><p class="sub">Plot <span class="mono">${SH.pid}</span> (${esc(SH.addr)}) split into ${SH.total} tokens. Simulated: real issuance, identity claims and compliance checks need the PropertyToken, IdentityRegistry, ComplianceModule and RentDistributor contracts.</p>
 <div style="border:1.5px solid var(--ink);background:var(--sheet);padding:6px"><svg viewBox="0 0 600 46" style="display:block;width:100%;color:var(--ink)" role="img" aria-label="Share allocation"><defs><pattern id="hv" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--forest)" stroke-width="2"/></pattern><pattern id="hc" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0H8M0 0V8" stroke="var(--blue)" stroke-width="1.4"/></pattern></defs>${seg}</svg></div>
 <div class="k">Holders and compliance (demo issuer)</div>${SH.holders.map(h=>`<div class="lead"><span>${h[0]}</span><i></i><span>${h[1]} tokens · ${h[2]==="eligible"?"✓ eligible":"✕ transfer blocked, identity claim missing"}</span></div>`).join("")}<p class="mono">${held} of ${SH.total} tokens held by eligible investors.</p>
 <div class="k">Rent distribution</div>${SH.rent.map((r,i)=>`<div class="lead"><span>${r[0]}</span><i></i><span>${r[1]} · ${r[2]?"distributed":`pending <button class="btn alt" data-a="claim" data-i="${i}" ${S.role==="investor"?"":"disabled"}>CLAIM (SIMULATED)</button>`}</span></div>`).join("")}${S.role==="investor"?"":'<p class="mono" style="color:var(--mute)">Switch to the Investor demo role to claim.</p>'}`};
document.addEventListener("click",async e=>{const b=e.target.closest('[data-a="corr"],[data-a="claim"]');if(!b)return;
 if(b.dataset.a==="corr"){await svc.approveCorr(b.dataset.id,S.role);toast("Approval recorded (simulated)")}else{await svc.claim(+b.dataset.i);toast("Claim recorded (simulated)")}render()});
