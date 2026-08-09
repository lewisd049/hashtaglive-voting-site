import {
  db,
  names,
  collection,
  query,
  where,
  onSnapshot
} from "./firebase.js";

const $ = id => document.getElementById(id);

let stopQuestion = null;
let stopVotes = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
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

      if (!snapshot.docs.length) {
        showWaiting();
        return;
      }

      const showDoc =
        snapshot.docs[0];

      const show = {
        id: showDoc.id,
        ...showDoc.data()
      };

      $("liveShowName")
        .textContent =
        show.title || "";

      if (stopQuestion) {
        stopQuestion();
      }

      /*
        Don't use orderBy here.
      */

      const questionsQuery =
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

          questionsQuery,

          questionSnapshot => {

            if (
              !questionSnapshot.docs.length
            ) {

              showWaiting();

              return;
            }

            const questionDoc =
              questionSnapshot.docs[0];

            const question = {
              id:
                questionDoc.id,

              ...questionDoc.data()
            };

            render(question);

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
                  question.id
                )
              );

            stopVotes =
              onSnapshot(
                votesQuery,

                voteSnapshot => {
                  renderResults(
                    question,
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
              "Question listener error:",
              error
            );

            showWaiting();
          }
        );
    },

    error => {

      console.error(
        "Show listener error:",
        error
      );

      showWaiting();
    }
  );
}

function showWaiting() {

  $("liveWaiting")
    .classList
    .remove("hidden");

  $("liveQuestion")
    .classList
    .add("hidden");

  $("liveShowName")
    .textContent = "";
}

function render(question) {

  $("liveWaiting")
    .classList
    .add("hidden");

  $("liveQuestion")
    .classList
    .remove("hidden");

  $("liveQuestionText")
    .textContent =
    question.text || "";

  $("liveEyebrow")
    .textContent =
    "#LIVE · " +
    (
      question.type === "multiple"
        ? "MULTIPLE ANSWERS"
        : "LIVE VOTE"
    );
}

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

  snapshot.forEach(
    vote => {

      total++;

      (
        vote.data().answers || []
      ).forEach(answer => {

        if (
          counts[answer] != null
        ) {
          counts[answer]++;
        }

      });
    }
  );

  $("liveVoteCount")
    .textContent =
    `${total} vote${
      total === 1
        ? ""
        : "s"
    }`;

  $("liveOptions")
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
          <div class="live-option">

            <div class="live-option-name">
              ${esc(option.text)}
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

listen();
