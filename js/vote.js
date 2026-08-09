import {
  auth,
  db,
  names,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  setDoc,
  serverTimestamp,
  signInAnonymously
} from "./firebase.js";

const $ = id => document.getElementById(id);

let activeQuestion = null;
let stopQuestion = null;
let currentVoteKey = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

async function ensureAnonymousUser() {

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  return auth.currentUser.uid;
}

function deviceKey(
  uid,
  questionId
) {
  return `live-voted:${questionId}:${uid}`;
}

function renderQuestion(
  question,
  show
) {

  activeQuestion =
    question;

  $("showTitle")
    .textContent =
    show?.title ||
    "#LIVE";

  $("questionText")
    .textContent =
    question.text || "";

  $("questionNumber")
    .textContent =
    question.order != null
      ? `QUESTION ${
          Number(question.order) + 1
        }`
      : "LIVE QUESTION";

  $("voteType")
    .textContent =
    question.type === "multiple"
      ? "MULTIPLE ANSWERS"
      : question.type.toUpperCase();

  $("questionHelp")
    .textContent =
    question.type === "multiple"
      ? "Choose all the answers you want, then submit once."
      : "Choose one answer, then submit once.";

  $("submitBtn").disabled =
    question.acceptVotes === false;

  $("submitBtn")
    .textContent =
    question.acceptVotes === false
      ? "VOTING CLOSED"
      : "SUBMIT VOTE";

  const options =
    $("options");

  options.innerHTML = "";

  (
    question.options || []
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
        question.type === "multiple"
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
        <span class="option-symbol"></span>
        <span>
          ${escapeHtml(option.text)}
        </span>
      `;

      label.append(
        input,
        card
      );

      options.appendChild(
        label
      );
    }
  );
}

async function showAlreadyVoted(
  question
) {

  const uid =
    await ensureAnonymousUser();

  currentVoteKey =
    deviceKey(
      uid,
      question.id
    );

  if (
    localStorage.getItem(
      currentVoteKey
    ) === "1"
  ) {

    $("voteForm")
      .classList
      .add("hidden");

    $("votedState")
      .classList
      .remove("hidden");

    $("votedMessage")
      .textContent =
      question.showResults
        ? "Your vote has been counted. Live results are below."
        : "Your vote has been counted.";

    if (
      question.showResults
    ) {
      startPublicResults(
        question
      );
    }

  } else {

    $("voteForm")
      .classList
      .remove("hidden");

    $("votedState")
      .classList
      .add("hidden");
  }
}

async function submitVote(
  event
) {

  event.preventDefault();

  if (
    !activeQuestion ||
    activeQuestion.acceptVotes === false
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
      ].map(
        input => input.value
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

    const key =
      deviceKey(
        uid,
        activeQuestion.id
      );

    if (
      localStorage.getItem(key) === "1"
    ) {

      await showAlreadyVoted(
        activeQuestion
      );

      return;
    }

    $("submitBtn").disabled =
      true;

    $("submitBtn")
      .textContent =
      "SUBMITTING…";

    const voteRef =
      doc(
        db,
        names.VOTES_COLLECTION,
        `${activeQuestion.id}_${uid}`
      );

    await setDoc(
      voteRef,
      {
        questionId:
          activeQuestion.id,

        showId:
          activeQuestion.showId,

        uid,

        answers:
          selected,

        createdAt:
          serverTimestamp()
      }
    );

    localStorage.setItem(
      key,
      "1"
    );

    $("voteForm")
      .classList
      .add("hidden");

    $("votedState")
      .classList
      .remove("hidden");

    $("votedMessage")
      .textContent =
      activeQuestion.showResults
        ? "Your vote has been counted. Live results are below."
        : "Thanks for voting on #LIVE.";

    if (
      activeQuestion.showResults
    ) {
      startPublicResults(
        activeQuestion
      );
    }

  } catch (error) {

    console.error(
      "Vote error:",
      error
    );

    $("submitBtn").disabled =
      false;

    $("submitBtn")
      .textContent =
      "SUBMIT VOTE";

    alert(
      "Your vote could not be submitted:\n\n" +
      error.message
    );
  }
}

function startPublicResults(
  question
) {

  $("publicResults")
    .classList
    .remove("hidden");

  const votesQuery =
    query(
      collection(
        db,
        names.VOTES_COLLECTION
      ),
      where(
        "questionId",
        "==",
        question.id
      )
    );

  if (
    window._resultStop
  ) {
    window._resultStop();
  }

  window._resultStop =
    onSnapshot(

      votesQuery,

      snapshot => {

        const counts =
          Object.fromEntries(
            (question.options || [])
              .map(option => [
                option.id,
                0
              ])
          );

        let total = 0;

        snapshot.forEach(
          vote => {

            const data =
              vote.data();

            (
              data.answers || []
            ).forEach(answer => {

              if (
                counts[answer] != null
              ) {
                counts[answer]++;
              }

            });

            total++;
          }
        );

        $("publicResults")
          .innerHTML =
          (question.options || [])
            .map(option => {

              const percentage =
                total
                  ? Math.round(
                      counts[
                        option.id
                      ] /
                      total *
                      100
                    )
                  : 0;

              return `
                <div class="result-row">

                  <div class="result-head">

                    <span>
                      ${escapeHtml(
                        option.text
                      )}
                    </span>

                    <strong>
                      ${percentage}%
                    </strong>

                  </div>

                  <div class="bar-track">

                    <div
                      class="bar"
                      style="width:${percentage}%"
                    ></div>

                  </div>

                </div>
              `;

            })
            .join("");
      }
    );
}

function listen() {

  const showsQuery =
    query(
      collection(
        db,
        names.SHOWS_COLLECTION
      ),
      where(
        "status",
        "==",
        "live"
      )
    );

  onSnapshot(

    showsQuery,

    snapshot => {

      const showDoc =
        snapshot.docs[0];

      const show =
        showDoc
          ? {
              id:
                showDoc.id,

              ...showDoc.data()
            }
          : null;

      $("connectionPill")
        .textContent =
        show
          ? "LIVE"
          : "Waiting";

      if (!show) {

        $("loadingState")
          .classList
          .add("hidden");

        $("voteView")
          .classList
          .add("hidden");

        $("noQuestion")
          .classList
          .remove("hidden");

        return;
      }

      if (stopQuestion) {
        stopQuestion();
      }

      /*
        No orderBy here.
      */

      const questionQuery =
        query(
          collection(
            db,
            names.QUESTIONS_COLLECTION
          ),
          where(
            "showId",
            "==",
            show.id
          ),
          where(
            "active",
            "==",
            true
          )
        );

      stopQuestion =
        onSnapshot(

          questionQuery,

          async snapshot => {

            const questionDoc =
              snapshot.docs[0];

            $("loadingState")
              .classList
              .add("hidden");

            if (!questionDoc) {

              $("voteView")
                .classList
                .add("hidden");

              $("noQuestion")
                .classList
                .remove("hidden");

              return;
            }

            const question = {

              id:
                questionDoc.id,

              ...questionDoc.data()
            };

            $("noQuestion")
              .classList
              .add("hidden");

            $("voteView")
              .classList
              .remove("hidden");

            renderQuestion(
              question,
              show
            );

            await showAlreadyVoted(
              question
            );
          },

          error => {

            console.error(
              "Question listener error:",
              error
            );

            $("loadingState")
              .classList
              .add("hidden");

            $("voteView")
              .classList
              .add("hidden");

            $("noQuestion")
              .classList
              .remove("hidden");

            $("noQuestion")
              .querySelector("p")
              .textContent =
              "The live question could not be loaded. Check your Firebase Firestore rules.";
          }
        );
    },

    error => {

      console.error(
        "Show listener error:",
        error
      );

      $("loadingState")
        .classList
        .add("hidden");

      $("noQuestion")
        .classList
        .remove("hidden");
    }
  );
}

$("voteForm")
  .addEventListener(
    "submit",
    submitVote
  );

ensureAnonymousUser()
  .then(() => listen())
  .catch(error => {

    console.error(
      error
    );

    $("loadingState")
      .classList
      .add("hidden");

    $("noQuestion")
      .classList
      .remove("hidden");

    $("noQuestion")
      .querySelector("p")
      .textContent =
      "Voting could not connect to Firebase. Check your Firebase configuration.";
  });
