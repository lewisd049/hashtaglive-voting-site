import {
  auth, db, names, collection, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, setDoc, serverTimestamp, signInAnonymously
} from "./firebase.js";

const $ = id => document.getElementById(id);
let activeQuestion = null;
let stopQuestion = null;
let stopShow = null;
let currentVoteKey = null;

const showLoading = v => $("loadingState").classList.toggle("hidden", !v);
const showNoQuestion = v => $("noQuestion").classList.toggle("hidden", !v);
const showVote = v => $("voteView").classList.toggle("hidden", !v);

async function ensureAnonymousUser() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

function deviceKey(uid, questionId) {
  return `live-voted:${questionId}:${uid}`;
}

function renderQuestion(q, show) {
  activeQuestion = q;
  $("showTitle").textContent = show?.title || "#LIVE";
  $("questionText").textContent = q.text || "";
  $("questionNumber").textContent = q.order != null ? `QUESTION ${Number(q.order) + 1}` : "LIVE QUESTION";
  $("voteType").textContent = q.type === "multiple" ? "MULTIPLE ANSWERS" : q.type.toUpperCase();
  $("questionHelp").textContent = q.type === "multiple" ? "Choose all the answers you want, then submit once." : "Choose one answer, then submit once.";
  $("submitBtn").disabled = q.acceptVotes === false;
  $("submitBtn").textContent = q.acceptVotes === false ? "VOTING CLOSED" : "SUBMIT VOTE";

  const box = $("options");
  box.innerHTML = "";
  (q.options || []).forEach((option, i) => {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.name = "answer";
    input.type = q.type === "multiple" ? "checkbox" : "radio";
    input.value = option.id;
    input.id = `option-${i}`;
    const card = document.createElement("span");
    card.className = "option-card";
    card.innerHTML = `<span class="option-symbol"></span><span>${escapeHtml(option.text)}</span>`;
    label.append(input, card);
    box.appendChild(label);
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

async function showAlreadyVoted(q) {
  const uid = await ensureAnonymousUser();
  currentVoteKey = deviceKey(uid, q.id);
  if (localStorage.getItem(currentVoteKey) === "1") {
    $("voteForm").classList.add("hidden");
    $("votedState").classList.remove("hidden");
    $("votedMessage").textContent = q.showResults ? "Your vote has been counted. Live results are below." : "Your vote has been counted.";
    if (q.showResults) startPublicResults(q);
  } else {
    $("voteForm").classList.remove("hidden");
    $("votedState").classList.add("hidden");
  }
}

async function submitVote(e) {
  e.preventDefault();
  if (!activeQuestion || activeQuestion.acceptVotes === false) return;
  const uid = await ensureAnonymousUser();
  const selected = [...document.querySelectorAll('input[name="answer"]:checked')].map(x => x.value);
  if (!selected.length) return alert(activeQuestion.type === "multiple" ? "Please choose at least one answer." : "Please choose an answer.");

  const key = deviceKey(uid, activeQuestion.id);
  if (localStorage.getItem(key) === "1") {
    await showAlreadyVoted(activeQuestion);
    return;
  }

  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "SUBMITTING…";

  // Each device gets exactly one vote document for each question.
  // The anonymous UID is persisted by Firebase in this browser.
  const voteRef = doc(db, names.VOTES_COLLECTION, `${activeQuestion.id}_${uid}`);
  await setDoc(voteRef, {
    questionId: activeQuestion.id,
    showId: activeQuestion.showId,
    uid,
    answers: selected,
    createdAt: serverTimestamp()
  });

  localStorage.setItem(key, "1");
  $("voteForm").classList.add("hidden");
  $("votedState").classList.remove("hidden");
  $("votedMessage").textContent = activeQuestion.showResults ? "Your vote has been counted. Live results are below." : "Thanks for voting on #LIVE.";
  if (activeQuestion.showResults) startPublicResults(activeQuestion);
}

function startPublicResults(q) {
  $("publicResults").classList.remove("hidden");
  const votesQ = query(collection(db, names.VOTES_COLLECTION), where("questionId","==",q.id));
  if (window._resultStop) window._resultStop();
  window._resultStop = onSnapshot(votesQ, snap => {
    const counts = Object.fromEntries((q.options || []).map(o => [o.id, 0]));
    let total = 0;
    snap.forEach(d => {
      const data = d.data();
      (data.answers || []).forEach(a => { if (counts[a] != null) counts[a]++; });
      total++;
    });
    $("publicResults").innerHTML = (q.options || []).map(o => {
      const pct = total ? Math.round(counts[o.id] / total * 100) : 0;
      return `<div class="result-row"><div class="result-head"><span>${escapeHtml(o.text)}</span><strong>${pct}%</strong></div><div class="bar-track"><div class="bar" style="width:${pct}%"></div></div></div>`;
    }).join("");
  });
}

function listen() {
  const showsQ = query(collection(db, names.SHOWS_COLLECTION), where("status","==","live"), orderBy("updatedAt","desc"));
  onSnapshot(showsQ, snap => {
    const show = snap.docs[0] ? {id:snap.docs[0].id,...snap.docs[0].data()} : null;
    if (stopShow) stopShow();
    if (!show) {
      showLoading(false); showVote(false); showNoQuestion(true);
      $("connectionPill").textContent = "Waiting";
      return;
    }
    $("connectionPill").textContent = "LIVE";
    const qq = query(collection(db, names.QUESTIONS_COLLECTION), where("showId","==",show.id), where("active","==",true));
    if (stopQuestion) stopQuestion();
    stopQuestion = onSnapshot(qq, async qs => {
      const qd = qs.docs[0];
      showLoading(false);
      if (!qd) { showVote(false); showNoQuestion(true); return; }
      const q = {id:qd.id,...qd.data()};
      showNoQuestion(false); showVote(true);
      renderQuestion(q, show);
      await showAlreadyVoted(q);
    });
  }, err => {
    console.error(err);
    $("connectionPill").textContent = "Connection error";
    showLoading(false);
    showNoQuestion(true);
  });
}

$("voteForm").addEventListener("submit", submitVote);
ensureAnonymousUser().then(listen).catch(err => {
  console.error(err);
  showLoading(false); showNoQuestion(true);
  $("noQuestion").querySelector("p").textContent = "Voting could not connect to Firebase. Check the Firebase configuration.";
});
