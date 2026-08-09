import {
  auth,
  db,
  names,
  doc,
  onSnapshot,
  collection,
  query,
  where,
  setDoc,
  serverTimestamp,
  signInAnonymously
} from "./firebase.js";

const $ = id =>
  document.getElementById(id);

let activeQuestion = null;
let currentShow = null;

let stopLive = null;
let stopResults = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
}


/* =========================================================
   ANONYMOUS FIREBASE USER
========================================================= */

async function ensureAnonymousUser() {

  if (!auth.currentUser) {

    await signInAnonymously(
      auth
    );
  }

  return auth.currentUser.uid;
}


/* =========================================================
   ONE VOTE KEY
========================================================= */

function getVoteKey(
  questionId,
  uid
) {

  return (
    `hashtaglive-voted-` +
    `${questionId}-` +
    `${uid}`
  );
}


/* =========================================================
   RENDER QUESTION
========================================================= */

function renderQuestion(
  question,
  show
) {

  activeQuestion =
    question;

  currentShow =
    show;


  if ($("showTitle")) {

    $("showTitle")
      .textContent =
      show?.title ||
      "#LIVE";
  }


  if ($("questionText")) {

    $("questionText")
      .textContent =
      question.text ||
      "";
  }


  if ($("questionNumber")) {

    $("questionNumber")
      .textContent =
      question.order != null

        ? `QUESTION ${
            Number(
              question.order
            ) + 1
          }`

        : "LIVE QUESTION";
  }


  if ($("voteType")) {

    $("voteType")
      .textContent =
      question.type ===
      "multiple"

        ? "MULTIPLE ANSWERS"

        : "LIVE VOTE";
  }


  if ($("questionHelp")) {

    $("questionHelp")
      .textContent =
      question.type ===
      "multiple"

        ? "Choose all the answers you want."

        : "Choose one answer.";
  }


  const options =
    $("options");

  if (!options)
    return;


  options.innerHTML = "";


  (
    question.options ||
    []
  ).forEach(
    (option, index) => {

      const label =
        document.createElement(
          "label"
        );

      label.className =
        "option";


      const input =
        document.createElement(
          "input"
        );

      input.name =
        "answer";

      input.type =
        question.type ===
        "multiple"

          ? "checkbox"

          : "radio";

      input.value =
        option.id;

      input.id =
        `option-${index}`;


      const card =
        document.createElement(
          "span"
        );

      card.className =
        "option-card";


      card.innerHTML = `
        <span
          class="option-symbol"
        ></span>

        <span>
          ${escapeHtml(
            option.text
          )}
        </span>
      `;


      label.appendChild(
        input
      );

      label.appendChild(
        card
      );


      options.appendChild(
        label
      );
    }
  );


  if ($("submitBtn")) {

    $("submitBtn")
      .disabled =
      question.acceptVotes ===
      false;

    $("submitBtn")
      .textContent =
      question.acceptVotes ===
      false

        ? "VOTING CLOSED"

        : "SUBMIT VOTE";
  }
}


/* =========================================================
   CHECK VOTED
========================================================= */

async function checkAlreadyVoted(
  question
) {

  const uid =
    await ensureAnonymousUser();


  const questionId =
    question.questionId ||
    question.id;


  const key =
    getVoteKey(
      questionId,
      uid
    );


  const alreadyVoted =
    localStorage.getItem(
      key
    ) === "1";


  if (alreadyVoted) {

    $("voteForm")
      ?.classList
      .add("hidden");


    $("votedState")
      ?.classList
      .remove("hidden");


    if ($("votedMessage")) {

      $("votedMessage")
        .textContent =
        question.showResults

          ? "Your vote has been counted. Live results are shown below."

          : "Your vote has been counted.";
    }


    if (
      question.showResults
    ) {

      startResults(
        question
      );
    }

  } else {

    $("voteForm")
      ?.classList
      .remove("hidden");


    $("votedState")
      ?.classList
      .add("hidden");
  }
}


/* =========================================================
   SUBMIT VOTE
========================================================= */

async function submitVote(
  event
) {

  event.preventDefault();


  if (!activeQuestion)
    return;


  if (
    activeQuestion.acceptVotes ===
    false
  ) {

    return;
  }


  try {

    const uid =
      await ensureAnonymousUser();


    const selected =
      [
        ...document.querySelectorAll(
          'input[name="answer"]:checked'
        )
      ]
        .map(
          input =>
            input.value
        );


    if (!selected.length) {

      alert(

        activeQuestion.type ===
        "multiple"

          ? "Please choose at least one answer."

          : "Please choose an answer."

      );

      return;
    }


    const questionId =
      activeQuestion.questionId ||
      activeQuestion.id;


    const voteKey =
      getVoteKey(
        questionId,
        uid
      );


    if (
      localStorage.getItem(
        voteKey
      ) === "1"
    ) {

      await checkAlreadyVoted(
        activeQuestion
      );

      return;
    }


    if ($("submitBtn")) {

      $("submitBtn")
        .disabled = true;

      $("submitBtn")
        .textContent =
        "SUBMITTING…";
    }


    const voteRef =
      doc(
        db,
        names.VOTES_COLLECTION,
        `${questionId}_${uid}`
      );


    await setDoc(
      voteRef
