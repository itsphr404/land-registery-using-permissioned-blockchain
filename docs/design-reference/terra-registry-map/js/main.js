'use strict';
/* Rendering, routing and event handling. */
function render(){$("nav").innerHTML=Object.entries(VIEWS).map(([k,v])=>`<a href="#${k}" ${S.view===k?'aria-current="page"':""}>${v}</a>`).join("");$("app").innerHTML=VIEW[S.view]();
 const m=$("map");if(m){let d=null;m.onpointerdown=e=>{d={x:e.clientX,y:e.clientY,vx:V.x,vy:V.y};dragged=false};
  m.onpointermove=e=>{if(!d)return;const rc=m.getBoundingClientRect(),dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>4)dragged=true;if(!dragged)return;V.x=Math.min(Math.max(d.vx-dx*V.w/rc.width,0),W-V.w);V.y=Math.min(Math.max(d.vy-dy*V.h/rc.height,0),H-V.h);paint()};
  m.onpointerup=m.onpointerleave=()=>{d=null};
  m.onwheel=e=>{e.preventDefault();const rc=m.getBoundingClientRect();zoom(e.deltaY>0?1.2:.83,V.x+(e.clientX-rc.left)/rc.width*V.w,V.y+(e.clientY-rc.top)/rc.height*V.h)}}}
const toast=t=>{const e=document.createElement("div");e.className="toast";e.setAttribute("role","status");e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),2300)};
function route(){const h=location.hash.slice(1);S.view=VIEWS[h]?h:"map";render()}
document.addEventListener("input",e=>{const k=e.target.dataset&&e.target.dataset.f;if(k)S.form[k]=e.target.value;if(e.target.id==="rq"){S.q=e.target.value;const p=e.target.selectionStart;render();const n=$("rq");n.focus();n.setSelectionRange(p,p)}});
document.addEventListener("change",e=>{if(e.target.id==="rf"){S.rf=e.target.value;render()}});
document.addEventListener("keydown",e=>{if(e.target.id==="q"&&e.key==="Enter"){search(e.target.value);render()}if(e.key==="Escape"&&S.sel){S.sel=null;render()}if((e.key==="Enter"||e.key===" ")&&e.target.dataset&&e.target.dataset.id&&e.target.tagName==="g"){e.preventDefault();focusPlot(e.target.dataset.id)}});
document.addEventListener("click",async e=>{const b=e.target.closest("[data-a],[data-s],[data-id]");if(!b)return;const a=b.dataset.a,id=b.dataset.id;
 if(b.dataset.s){S.on[b.dataset.s]=S.on[b.dataset.s]?0:1;render();return}
 if(!a&&id){if(dragged){dragged=false;return}focusPlot(id);return}
 if(a==="go"){search($("q").value);render()}
 else if(a==="close"){S.sel=null;render()}
 else if(a==="zi")zoom(.7);else if(a==="zo")zoom(1.4);else if(a==="all"){S.rs="";S.msg="";fly(W/2,H/2,W)}
 else if(a==="loc")focusPlot(id);
 else if(a==="map")location.hash="map";else if(a==="sales")location.hash="sales";
 else if(a==="appr"){await svc.approvePending(id);toast("Approved (simulated)");render()}
 else if(a==="sell"){await svc.approveSale(id,b.dataset.w);toast("Approval recorded (simulated)");render()}
 else if(a==="sub"){const F=S.form,E={};if(F.addr.trim().length<6)E.addr="Enter a full address.";if(F.owner.trim().length<3)E.owner="Enter the owner’s full name.";if(!(+F.size>0))E.size="Enter a size above zero.";S.err=E;
  if(Object.keys(E).length)return render();b.disabled=true;b.textContent="SUBMITTING…";const p=await svc.create(F);S.form={addr:"",owner:"",size:"",area:F.area};S.err={};toast("Pending plot "+p.id+" added (simulated)");S.on.pending=1;focusPlot(p.id)}});
$("role").innerHTML=Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");$("role").onchange=e=>{S.role=e.target.value;render()};
addEventListener("hashchange",route);route();
