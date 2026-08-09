import {
  db,names,collection,query,where,orderBy,onSnapshot
} from "./firebase.js";

const $=id=>document.getElementById(id);
let stopQuestion=null,stopVotes=null;

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function listen(){
  const sq=query(collection(db,names.SHOWS_COLLECTION),where("status","==","live"),orderBy("updatedAt","desc"));
  onSnapshot(sq,snap=>{
    const show=snap.docs[0]?{id:snap.docs[0].id,...snap.docs[0].data()}:null;
    if(!show){showWaiting();return}
    $("liveShowName").textContent=show.title||"";
    if(stopQuestion)stopQuestion();
    const qq=query(collection(db,names.QUESTIONS_COLLECTION),where("showId","==",show.id),where("active","==",true));
    stopQuestion=onSnapshot(qq,qs=>{
      const d=qs.docs[0];
      if(!d){showWaiting();return}
      const q={id:d.id,...d.data()};
      render(q);
      if(stopVotes)stopVotes();
      const vq=query(collection(db,names.VOTES_COLLECTION),where("questionId","==",q.id));
      stopVotes=onSnapshot(vq,vs=>renderResults(q,vs));
    });
  });
}
function showWaiting(){
  $("liveWaiting").classList.remove("hidden");$("liveQuestion").classList.add("hidden");$("liveShowName").textContent="";
}
function render(q){
  $("liveWaiting").classList.add("hidden");$("liveQuestion").classList.remove("hidden");
  $("liveQuestionText").textContent=q.text||"";
  $("liveEyebrow").textContent="#LIVE · "+(q.type==="multiple"?"MULTIPLE ANSWERS":"LIVE VOTE");
}
function renderResults(q,snap){
  const counts=Object.fromEntries((q.options||[]).map(o=>[o.id,0]));
  let total=0;
  snap.forEach(d=>{total++;(d.data().answers||[]).forEach(a=>{if(counts[a]!=null)counts[a]++;});});
  $("liveVoteCount").textContent=`${total} vote${total===1?"":"s"}`;
  $("liveOptions").innerHTML=(q.options||[]).map(o=>{
    const pct=total?Math.round(counts[o.id]/total*100):0;
    return `<div class="live-option"><div class="live-option-name">${esc(o.text)}</div><div class="live-option-stat"><span class="live-percent">${pct}%</span><strong>${counts[o.id]} vote${counts[o.id]===1?"":"s"}</strong></div><div class="live-bar-track"><div class="live-bar" style="width:${pct}%"></div></div></div>`;
  }).join("");
}
listen();
