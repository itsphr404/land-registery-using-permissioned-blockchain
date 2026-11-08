'use strict';
/* MOCK DATA ONLY: areas, plots, audit entries. Replace with real data. */
/* ---- MOCK DATA ---- */
const AREAS={Northfield:[300,260],Lakeview:[1050,170],Harbour:[1330,760],Orchard:[380,780]};
const OWN=["Asha Kapoor","Meera Iyer","Daniel Fernandes","Farah Siddiqui","Imran Qureshi","Lena Park","Noor Haddad","Karan Mehta","Priya Nair","Omar Sheikh","Elena Rossi","Vikram Rao"];
const PAT=["approved","sale","approved","disputed","approved","court","pending","approved","sale"];
const cellPts=(a,c,k)=>{const [ax,ay]=AREAS[a],i=c%4,j=c/4|0,x=ax+i*104,y=ay+j*84;return[[0,0],[88,0],[88,68],[0,68]].map((p,m)=>[Math.round(x+p[0]+(rnd(k*9+m)-.5)*12),Math.round(y+p[1]+(rnd(k*9+m+5)-.5)*12)])};
const P=[];Object.keys(AREAS).forEach((a,ai)=>PAT.forEach((st,n)=>{const k=ai*9+n,c=n+(n>5?1:0)+(n>2?0:0);
 const p={id:"TR-"+a.slice(0,3).toUpperCase()+"-"+String(n+1).padStart(3,"0"),area:a,cell:c,addr:"Plot "+(n+1)+", "+a,owner:OWN[(k*5)%12],st:PAT[(n+ai*2)%9],pts:cellPts(a,c,k),size:240+Math.round(rnd(k)*500)+" m²"};
 if(p.st==="sale")p.sale={buyer:OWN[(k*3+1)%12],price:"₹ "+(40+Math.round(rnd(k+2)*60))+",00,000",funded:true,sellerOk:rnd(k)>.5,regOk:false};
 if(p.st==="court")p.court={no:"CC-2026-"+(100+k),court:"District Court, "+a,hearing:"2026-11-"+String(5+n).padStart(2,"0")};
 if(p.st==="disputed")p.dispute="Boundary claim by neighbouring owner, filed 2026-09-14";
 P.push(p)}));
const AUD=[["2026-10-27 09:12","Registrar","Approved TR-NOR-001"],["2026-10-26 15:40","Court officer","Hearing set for CC-2026-105"],["2026-10-25 11:05","Citizen","Listed TR-LAK-011 for sale"],["2026-10-24 14:22","Surveyor","Survey verified TR-ORC-007"]].map(e=>[...e,0]);
AUD[1][3]=1;
