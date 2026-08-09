import {
  db,
  names,
  doc,
  onSnapshot,
  collection,
  query,
  where
} from "./firebase.js";

const $ = id =>
  document.getElementById(id);

let stopLive = null;
let stopVotes = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
    );
}


/* =========================================================
   LIVE LISTENER
========================================================= */

function listen() {

  const liveRef =
    doc(
      db,
      "live",
      "current"
    );

  stopLive =
    onSnapshot(

      liveRef,

      snapshot => {

        if (!snapshot.exists()) {

          showWaiting();

          return;
        }

        const live =
          snapshot.data();

        if (live.active !== true) {

          showWaiting();

          return;
        }

        renderQuestion(live);

        if (stopVotes) {
          stopVotes();
        }

        const votesQuery =
          query(
            collection(
              db,
              names.VOTES_COLLECTION
            ),
            where(
              "questionId",
              "==",
              live.questionId
            )
          );

        stopVotes =
          onSnapshot(

            votesQuery,

            voteSnapshot => {

              renderResults(
                live,
                voteSnapshot
              );
            },

            error => {

              console.error(
                "Live results error:",
                error
              );
            }
          );
      },

      error => {

        console.error(
          "Live document error:",
          error
        );

        showWaiting();
      }
    );
}


/* =========================================================
   QUESTION DISPLAY
========================================================= */

function renderQuestion(question) {

  $("liveWaiting")
    ?.classList
    .add("hidden");

  $("liveQuestion")
    ?.classList
    .remove("hidden");

  if ($("liveShowName")) {

    $("liveShowName")
      .textContent =
      question.showTitle ||
      "#LIVE";
  }

  if ($("liveQuestionText")) {

    $("liveQuestionText")
      .textContent =
      question.text ||
      "";
  }

  if ($("liveEyebrow")) {

    $("liveEyebrow")
      .textContent =
      question.type === "multiple"
        ? "#LIVE · MULTIPLE ANSWERS"
        : "#LIVE · LIVE VOTE";
  }
}


/* =========================================================
   RESULTS
========================================================= */

function renderResults(
  question,
  snapshot
) {

  const counts =
    Object.fromEntries(
      (question.options || [])
        .map(option => [
          option.id,
          0
        ])
    );

  let total = 0;

  snapshot.forEach(vote => {

    total++;

    (
      vote.data().answers ||
      []
    ).forEach(answer => {

      if (counts[answer] != null) {
        counts[answer]++;
      }

    });
  });


  if ($("liveVoteCount")) {

    $("liveVoteCount")
      .textContent =
      `${total} vote${
        total === 1
          ? ""
          : "s"
      }`;
  }


  if (!$("liveOptions")) {
    return;
  }


  $("liveOptions").innerHTML =
    (question.options || [])
      .map(option => {

        const percentage =
          total
            ? Math.round(
                counts[option.id] /
                total *
                100
              )
            : 0;

        return `
          <div class="live-option">

            <div class="live-option-name">
              ${escapeHtml(option.text)}
            </div>

            <div class="live-option-stat">

              <span class="live-percent">
                ${percentage}%
              </span>

              <strong>
                ${counts[option.id]}
                vote${
                  counts[option.id] === 1
                    ? ""
                    : "s"
                }
              </strong>

            </div>

            <div class="live-bar-track">

              <div
                class="live-bar"
                style="width:${percentage}%"
              ></div>

            </div>

          </div>
        `;

      })
      .join("");
}


/* =========================================================
   WAITING
========================================================= */

function showWaiting() {

  $("liveWaiting")
    ?.classList
    .remove("hidden");

  $("liveQuestion")
    ?.classList
    .add("hidden");

  if ($("liveShowName")) {
    $("liveShowName")
      .textContent = "";
  }

  if ($("liveQuestionText")) {
    $("liveQuestionText")
      .textContent = "";
  }

  if ($("liveOptions")) {
    $("liveOptions")
      .innerHTML = "";
  }

  if ($("liveVoteCount")) {
    $("liveVoteCount")
      .textContent = "0 votes";
  }
}


/* =========================================================
   START
========================================================= */

listen();
