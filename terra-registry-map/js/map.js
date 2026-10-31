'use strict';
/* App state and the satellite-style map (pan, zoom, fly-to, markers, search). Swap the drawn base layer for real map tiles here. */
/* ---- STATE ---- */
const S={view:"map",role:"citizen",sel:null,q:"",on:{approved:1,sale:1,disputed:1,court:1,pending:1},msg:"",form:{addr:"",owner:"",size:"",area:"Northfield"},err:{},rq:"",rs:""};
const W=2000,H=1250;let V={x:0,y:0,w:W,h:H},anim=0,dragged=false;
/* ---- MAP ---- */
const base=(()=>{let s=`<rect width="${W}" height="${H}" fill="#38482a"/>`;const gr=["#43562f","#2f3f23","#4d5e35","#566339","#3a4c2b","#6b6b45"];
 for(let i=0;i<190;i++){const x=rnd(i)*W,y=rnd(i+300)*H,w=60+rnd(i+9)*190,h=40+rnd(i+19)*120;s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${gr[i%6]}" opacity=".55" transform="rotate(${Math.round(rnd(i+5)*40-20)} ${x} ${y})"/>`}
 for(let i=0;i<260;i++)s+=`<circle cx="${rnd(i+700)*W}" cy="${rnd(i+900)*H}" r="${3+rnd(i)*7}" fill="#26361c" opacity=".6"/>`;
 s+=`<path d="M-20 560C300 520 520 640 800 600S1300 450 1500 520 1850 420 2040 470" fill="none" stroke="#3d6b8a" stroke-width="34" opacity=".85"/><path d="M-20 560C300 520 520 640 800 600S1300 450 1500 520 1850 420 2040 470" fill="none" stroke="#6aa3c4" stroke-width="10" opacity=".5"/>`;
 [[0,460,2000,0],[0,720,2000,40],[740,0,0,1250],[1250,0,60,1250]].forEach(r=>s+=`<path d="M${r[0]} ${r[1]}L${r[0]+r[2]||W} ${r[1]+r[3]}" stroke="#b9b29c" stroke-width="9" opacity=".8"/>`);
 s+=`<path d="M0 460H2000M0 730H2000M740 0V1250M1280 0V1250M0 1000H2000M1000 0V1250" stroke="#cfc8b2" stroke-width="7" opacity=".7" fill="none"/>`;
 return s})();
function layer(){const r=Math.max(V.w/95,5),sw=V.w/420;
 return Object.keys(AREAS).map(a=>`<text x="${AREAS[a][0]}" y="${AREAS[a][1]-14}" font-size="${Math.max(V.w/42,14)}" font-family="Fraunces,Georgia,serif" font-style="italic" fill="#fff" stroke="#000" stroke-width="${V.w/900}" paint-order="stroke">${a}</text>`).join("")+
 P.map(p=>{const pp=p.pts.map(q=>q.join(",")).join(" "),cx=p.pts.reduce((a,q)=>a+q[0],0)/4,cy=p.pts.reduce((a,q)=>a+q[1],0)/4,on=S.on[p.st],c={approved:"#5BC48A",sale:"#EBB444",disputed:"#EE6A57",court:"#69AEE8",pending:"#E4E4E4"}[p.st],sel=S.sel===p.id;
  const bld=V.w<700?`<rect x="${cx-14}" y="${cy-10}" width="28" height="20" fill="#d8d2c4" opacity=".55"/>`:"";
  return `<g opacity="${on?1:.12}" data-id="${p.id}" tabindex="${on?0:-1}" role="button" aria-label="${p.id}, ${ST[p.st][0]}, ${esc(p.addr)}" style="cursor:pointer"><polygon points="${pp}" fill="${c}" fill-opacity=".38" stroke="${sel?"#fff":c}" stroke-width="${sel?sw*3:sw*1.4}" ${p.st==="pending"?`stroke-dasharray="${sw*5} ${sw*3}"`:""}/>${bld}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="#fff" stroke-width="${sw*1.2}"/><text x="${cx}" y="${cy+r*.38}" text-anchor="middle" font-size="${r*1.15}" font-weight="700" font-family="monospace" fill="#111">${ST[p.st][1]}</text></g>`}).join("")}
function paint(){const m=$("map");if(!m)return;m.setAttribute("viewBox",`${V.x} ${V.y} ${V.w} ${V.h}`);$("mk").innerHTML=layer()}
function fly(cx,cy,w){const rc=$("map").getBoundingClientRect(),ar=rc.height/rc.width||.625;w=Math.min(Math.max(w,160),W);const T={w,h:w*ar};T.x=Math.min(Math.max(cx-T.w/2,0),W-T.w);T.y=Math.min(Math.max(cy-T.h/2,0),H-T.h);
 const A={...V},t0=performance.now(),d=matchMedia("(prefers-reduced-motion:reduce)").matches?1:650;cancelAnimationFrame(anim);
 const step=t=>{const u=Math.min((t-t0)/d,1),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;["x","y","w","h"].forEach(k=>V[k]=A[k]+(T[k]-A[k])*e);paint();if(u<1)anim=requestAnimationFrame(step)};anim=requestAnimationFrame(step)}
function zoom(f,cx,cy){const rc=$("map").getBoundingClientRect(),ar=rc.height/rc.width||.625;cx=cx??V.x+V.w/2;cy=cy??V.y+V.h/2;const w=Math.min(Math.max(V.w*f,160),W),h=w*ar;V.x=Math.min(Math.max(cx-(cx-V.x)*w/V.w,0),W-w);V.y=Math.min(Math.max(cy-(cy-V.y)*h/V.h,0),H-h);V.w=w;V.h=h;paint()}
function focusPlot(id){const p=P.find(x=>x.id===id);S.sel=id;S.on[p.st]=1;const cx=p.pts.reduce((a,q)=>a+q[0],0)/4,cy=p.pts.reduce((a,q)=>a+q[1],0)/4;if(S.view!=="map"){location.hash="map"}else render();setTimeout(()=>fly(cx,cy,300),30)}
function search(q){q=q.trim().toLowerCase();S.rq=q;if(!q){S.msg="";return}
 const a=Object.keys(AREAS).find(x=>x.toLowerCase().includes(q));
 if(a){S.msg="Showing "+a;S.rs=a;fly(AREAS[a][0]+190,AREAS[a][1]+130,520);return}
 const p=P.find(x=>(x.id+x.addr+x.owner).toLowerCase().includes(q));if(p){S.rs="";focusPlot(p.id);S.msg="Found "+p.id;return}
 S.msg="No area or plot matches “"+q+"”. Try Northfield, Lakeview, Harbour or Orchard."}
