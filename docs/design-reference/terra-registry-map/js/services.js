'use strict';
/* SERVICE LAYER: every method is a MOCK. Replace bodies with REST or contract calls; keep return shapes. */
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const log=(a,t,s)=>AUD.unshift(["2026-10-28 "+new Date().toTimeString().slice(0,5),a,t+" (simulated)",s||0]);
/* ---- SERVICE LAYER (all mock) ---- */
const svc={async approvePending(id){await delay(200);const p=P.find(x=>x.id===id);p.st="approved";log("Registrar","Approved "+id,1)},
 async approveSale(id,w){await delay(200);const p=P.find(x=>x.id===id);p.sale[w]=true;log(w==="regOk"?"Registrar":"Citizen","Sale approval on "+id,1);if(p.sale.sellerOk&&p.sale.regOk){p.owner=p.sale.buyer;p.st="approved";delete p.sale;log("System","Title of "+id+" would transfer atomically on-chain","1")}},
 async create(i){await delay(400);const used=P.filter(p=>p.area===i.area).map(p=>p.cell),c=[...Array(12).keys()].find(x=>!used.includes(x));const k=P.length;
  const p={id:"TR-"+i.area.slice(0,3).toUpperCase()+"-"+String(100+k),area:i.area,cell:c,addr:i.addr,owner:i.owner,st:"pending",pts:cellPts(i.area,c,k),size:i.size+" m²"};P.push(p);log("Citizen","Lodged "+p.id);return p}};
