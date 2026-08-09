import {
  auth, db, names, collection, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, setDoc, updateDoc, deleteDoc, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, serverTimestamp, writeBatch
} from "./firebase.js";

const $ = id => document.getElementById(id);
let currentUser = null, currentShowId = null, currentQuestionId = null;
let stopShows = null, stopQuestions = null, stopVotes = null;
let showsCache = [];

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

async function isAdmin(uid){
  const snap = await getDoc(doc(db,names.ADMIN_COLLECTION,uid));
  return snap.exists() && snap.data().role === "admin";
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) { showLogin(); return; }
  try {
    if (!(await isAdmin(user.uid))) { await signOut(auth); throw new Error("This account is not an administrator."); }
    showAdmin();
    subscribeShows();
  } catch(e) {
    $("loginError").textContent = e.message;
  }
});

function showLogin(){ $("loginPanel").classList.remove("hidden"); $("adminApp").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); }
function showAdmin(){ $("loginPanel").classList.add("hidden"); $("adminApp").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); }

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try { await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); }
  catch(e){ $("loginError").textContent = friendlyAuthError(e); }
});
$("logoutBtn").onclick = () => signOut(auth);

function friendlyAuthError(e){
  if(e.code?.includes("invalid-credential")) return "The email/password is incorrect.";
  if(e.code?.includes("too-many-requests")) return "Too many attempts. Try again later.";
  return e.message || "Sign-in failed.";
}

function subscribeShows(){
  const q = query(collection(db,names.SHOWS_COLLECTION),orderBy("updatedAt","desc"));
  stopShows = onSnapshot(q,snap=>{
    showsCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderShows();
    if(!currentShowId && showsCache[0]) selectShow(showsCache[0].id);
  });
}

function renderShows(){
  $("showList").innerHTML = "";
  showsCache.forEach(s=>{
    const div=document.createElement("div");
    div.className=`list-item ${s.id===currentShowId?"active":""}`;
    div.innerHTML=`<strong>${esc(s.title||"Untitled show")}</strong><small>${esc(s.status||"draft")}</small>`;
    div.onclick=()=>selectShow(s.id);
    $("showList").appendChild(div);
  });
}

function selectShow(id){
  currentShowId=id;
  const s=showsCache.find(x=>x.id===id);
  if(!s)return;
  $("showName").value=s.title||"";
  $("showStatus").value=s.status||"draft";
  $("editorTitle").textContent=s.title||"Edit show";
  $("adminStatus").textContent=s.status==="live"?"LIVE":s.status||"Draft";
  $("adminStatus").className=`pill ${s.status==="live"?"live-pill":""}`;
  renderShows();
  subscribeQuestions(id);
  currentQuestionId=null;
  clearQuestionEditor();
}

function subscribeQuestions(showId){
  if(stopQuestions)stopQuestions();
  const q=query(collection(db,names.QUESTIONS_COLLECTION),where("showId","==",showId),orderBy("order"));
  stopQuestions=onSnapshot(q,snap=>{
    const list=snap.docs.map(d=>({id:d.id,...d.data()}));
    $("questionList").innerHTML="";
    list.forEach(item=>{
      const div=document.createElement("div");
      div.className=`question-item ${item.id===currentQuestionId?"active":""}`;
      div.innerHTML=`<div><strong>${esc(item.text||"Untitled question")}</strong><small>${item.active?"ACTIVE · ":""}${esc(item.type||"single")}</small></div><span>${item.active?"●":"○"}</span>`;
      div.onclick=()=>editQuestion(item);
      $("questionList").appendChild(div);
    });
  });
}

function clearQuestionEditor(){
  $("questionEditor").classList.add("hidden");
  $("resultsTitle").textContent="Select a question";
  $("resultsBars").innerHTML="";
  $("voteCount").textContent="0 votes";
  if(stopVotes)stopVotes();
}

function editQuestion(q){
  currentQuestionId=q.id;
  $("questionEditor").classList.remove("hidden");
  $("questionTextInput").value=q.text||"";
  $("questionType").value=q.type||"single";
  $("questionOrder").value=q.order??0;
  $("acceptVotes").checked=q.acceptVotes!==false;
  $("showResults").checked=!!q.showResults;
  renderOptions(q.options||defaultOptions(q.type));
  subscribeVotes(q);
  subscribeQuestions(currentShowId);
}

function defaultOptions(type){
  if(type==="yesno")return[{id:"yes",text:"Yes"},{id:"no",text:"No"}];
  if(type==="rating")return [1,2,3,4,5].map(n=>({id:String(n),text:String(n)}));
  return [{id:crypto.randomUUID(),text:"Option A"},{id:crypto.randomUUID(),text:"Option B"}];
}
function renderOptions(opts){
  $("optionEditor").innerHTML="";
  opts.forEach(o=>addOptionRow(o));
}
function addOptionRow(o={id:crypto.randomUUID(),text:""}){
  const row=document.createElement("div");row.className="option-line";
  row.dataset.id=o.id;
  row.innerHTML=`<input value="${esc(o.text)}" placeholder="Answer"><button type="button">Remove</button>`;
  row.querySelector("button").onclick=()=>row.remove();
  $("optionEditor").appendChild(row);
}
$("addOptionBtn").onclick=()=>addOptionRow();
$("questionType").onchange=()=>{
  const t=$("questionType").value;
  if(t==="yesno"||t==="rating")renderOptions(defaultOptions(t));
};

$("newShowBtn").onclick=()=>{
  currentShowId=null;currentQuestionId=null;
  $("showName").value="New #LIVE Show";$("showStatus").value="draft";$("editorTitle").textContent="New show";
  $("questionList").innerHTML="";clearQuestionEditor();renderShows();
};
$("saveShowBtn").onclick=async()=>{
  const data={title:$("showName").value.trim()||"Untitled #LIVE Show",status:$("showStatus").value,updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
  if(currentShowId){await updateDoc(doc(db,names.SHOWS_COLLECTION,currentShowId),data);}
  else {const ref=doc(collection(db,names.SHOWS_COLLECTION));await setDoc(ref,{...data,createdAt:serverTimestamp()});currentShowId=ref.id;}
  alert("Show saved.");
};
$("deleteShowBtn").onclick=async()=>{
  if(!currentShowId)return;
  if(!confirm("Delete this show? Questions and votes will remain unless removed separately."))return;
  await deleteDoc(doc(db,names.SHOWS_COLLECTION,currentShowId));currentShowId=null;clearQuestionEditor();
};

$("newQuestionBtn").onclick=()=>{
  if(!currentShowId)return alert("Save/select a show first.");
  currentQuestionId=null;$("questionEditor").classList.remove("hidden");
  $("questionTextInput").value="";$("questionType").value="single";$("questionOrder").value=$("questionList").children.length;
  $("acceptVotes").checked=true;$("showResults").checked=false;renderOptions(defaultOptions("single"));
};
$("saveQuestionBtn").onclick=async()=>{
  if(!currentShowId)return;
  const options=[...$("optionEditor").querySelectorAll(".option-line")].map(r=>({id:r.dataset.id,text:r.querySelector("input").value.trim()})).filter(o=>o.text);
  const type=$("questionType").value;
  if(type==="yesno"||type==="rating"){
    // Keep the fixed answer set selected by the type.
  }
  if(!options.length)return alert("Add at least one answer.");
  const data={showId:currentShowId,text:$("questionTextInput").value.trim(),type,order:Number($("questionOrder").value)||0,acceptVotes:$("acceptVotes").checked,showResults:$("showResults").checked,options,active:false,updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
  if(!data.text)return alert("Enter a question.");
  if(currentQuestionId)await updateDoc(doc(db,names.QUESTIONS_COLLECTION,currentQuestionId),data);
  else {const ref=doc(collection(db,names.QUESTIONS_COLLECTION));await setDoc(ref,{...data,createdAt:serverTimestamp()});currentQuestionId=ref.id;}
  alert("Question saved.");
};
$("deleteQuestionBtn").onclick=async()=>{
  if(!currentQuestionId)return;
  if(confirm("Delete this question?")){await deleteDoc(doc(db,names.QUESTIONS_COLLECTION,currentQuestionId));clearQuestionEditor();}
};
$("activateBtn").onclick=async()=>{
  if(!currentQuestionId||!currentShowId)return;
  const qs=await getDocs(query(collection(db,names.QUESTIONS_COLLECTION),where("showId","==",currentShowId)));
  const batch=writeBatch(db);
  qs.forEach(d=>batch.update(d.ref,{active:d.id===currentQuestionId,updatedAt:serverTimestamp()}));
  batch.update(doc(db,names.QUESTIONS_COLLECTION,currentQuestionId),{acceptVotes:true,active:true});
  await batch.commit();
  await updateDoc(doc(db,names.SHOWS_COLLECTION,currentShowId),{status:"live",updatedAt:serverTimestamp()});
};
$("closeVoteBtn").onclick=async()=>{
  if(!currentQuestionId)return;
  await updateDoc(doc(db,names.QUESTIONS_COLLECTION,currentQuestionId),{acceptVotes:false,active:false,updatedAt:serverTimestamp()});
};

function subscribeVotes(q){
  if(stopVotes)stopVotes();
  $("resultsTitle").textContent=q.text||"Results";
  const vq=query(collection(db,names.VOTES_COLLECTION),where("questionId","==",q.id));
  stopVotes=onSnapshot(vq,snap=>{
    const counts=Object.fromEntries((q.options||[]).map(o=>[o.id,0]));
    let total=0;
    snap.forEach(d=>{total++;(d.data().answers||[]).forEach(a=>{if(counts[a]!=null)counts[a]++;});});
    $("voteCount").textContent=`${total} vote${total===1?"":"s"}`;
    $("resultsBars").innerHTML=(q.options||[]).map(o=>{
      const pct=total?Math.round(counts[o.id]/total*100):0;
      return `<div class="result-row"><div class="result-head"><span>${esc(o.text)}</span><strong>${pct}% · ${counts[o.id]}</strong></div><div class="bar-track"><div class="bar" style="width:${pct}%"></div></div></div>`;
    }).join("");
  });
}
