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

const $ = (id) => document.getElementById(id);

let activeQuestion = null;
let currentShow = null;

let stopLive = null;
let stopResults = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}


/* =========================================================
   ANONYMOUS FIREBASE LOGIN
========================================================= */

async function ensureAnonymousUser() {

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  return auth.currentUser.uid;
}


/* =========================================================
   VOTE KEY
========================================================= */

function getVoteKey(questionId, uid) {
  return `hashtaglive-voted-${questionId}-${uid}`;
}


/* =========================================================
   RENDER QUESTION
========================================================= */

function renderQuestion(question, show) {

  activeQuestion = question;
  currentShow = show;

  if ($("showTitle")) {
    $("showTitle").textContent =
      show?.title || "#LIVE";
  }

  if ($("questionText")) {
    $("questionText").textContent =
      question.text || "";
  }

  if ($("questionNumber")) {

    $("questionNumber").textContent =
      question.order != null
        ? `QUESTION ${Number(question.order) + 1}`
        : "LIVE QUESTION";
  }

  if ($("voteType")) {

    $("voteType").textContent =
      question.type === "multiple"
        ? "MULTIPLE ANSWERS"
        : "LIVE VOTE";
  }

  if ($("questionHelp")) {

    $("questionHelp").textContent =
      question.type === "multiple"
        ? "Choose all the answers you want."
        : "Choose one answer.";
  }


  const optionsContainer = $("options");

  if (!optionsContainer) {
    console.error(
      "HashtagLive: #options element was not found."
    );

    return;
  }


  optionsContainer.innerHTML = "";


  const options = Array.isArray(question.options)
    ? question.options
    : [];


  if (!options.length) {

    optionsContainer.innerHTML = `
      <div class="vote-error">
        No answer options are available.
      </div>
    `;

    return;
  }


  options.forEach((option, index) => {

    const label =
      document.createElement("label");

    label.className = "option";


    const input =
      document.createElement("input");

    input.name = "answer";

    input.type =
      question.type === "multiple"
        ? "checkbox"
        : "radio";

    input.value =
      option.id;

    input.id =
      `option-${index}`;


    const card =
      document.createElement("span");

    card.className =
      "option-card";


    card.innerHTML = `
      <span class="option-symbol"></span>

      <span>
        ${escapeHtml(option.text)}
      </span>
    `;


    label.appendChild(input);
    label.appendChild(card);

    optionsContainer.appendChild(label);
  });


  if ($("submitBtn")) {

    $("submitBtn").disabled =
      question.acceptVotes === false;

    $("submitBtn").textContent =
      question.acceptVotes === false
        ? "VOTING CLOSED"
        : "SUBMIT VOTE";
  }
}


/* =========================================================
   CHECK WHETHER THIS DEVICE HAS VOTED
========================================================= */

async function checkAlreadyVoted(question) {

  const uid =
    await ensureAnonymousUser();


  const questionId =
    question.questionId ||
    question.id;


  if (!questionId) {

    console.error(
      "HashtagLive: question has no questionId."
    );

    return;
  }


  const voteKey =
    getVoteKey(
      questionId,
      uid
    );


  const alreadyVoted =
    localStorage.getItem(voteKey) === "1";


  if (alreadyVoted) {

    $("voteForm")
      ?.classList
      .add("hidden");


    $("votedState")
      ?.classList
      .remove("hidden");


    if ($("votedMessage")) {

      $("votedMessage").textContent =
        question.showResults === true

          ? "Your vote has been counted. Live results are shown below."

          : "Your vote has been counted.";
    }


    if (question.showResults === true) {

      startResults(question);
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

async function submitVote(event) {

  event.preventDefault();


  if (!activeQuestion) {

    console.error(
      "HashtagLive: No active question."
    );

    return;
  }


  if (
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
        (input) => input.value
      );


    if (!selected.length) {

      alert(
        activeQuestion.type === "multiple"

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


    /*
      Check local storage first.
    */

    if (
      localStorage.getItem(voteKey) === "1"
    ) {

      await checkAlreadyVoted(
        activeQuestion
      );

      return;
    }


    if ($("submitBtn")) {

      $("submitBtn").disabled = true;

      $("submitBtn").textContent =
        "SUBMITTING…";
    }


    /*
      The document ID is unique to:

      question + anonymous Firebase user

      This prevents that Firebase anonymous
      user from creating another vote for
      the same question.
    */

    const voteRef =
      doc(
        db,
        names.VOTES_COLLECTION,
        `${questionId}_${uid}`
      );


    await setDoc(
      voteRef,
      {

        questionId,

        showId:
          activeQuestion.showId,

        uid,

        answers:
          selected,

        createdAt:
          serverTimestamp()

      }
    );


    /*
      Remember that this device/user has
      voted for this question.
    */

    localStorage.setItem(
      voteKey,
      "1"
    );


    $("voteForm")
      ?.classList
      .add("hidden");


    $("votedState")
      ?.classList
      .remove("hidden");


    if ($("votedMessage")) {

      $("votedMessage").textContent =
        activeQuestion.showResults === true

          ? "Your vote has been counted. Live results are shown below."

          : "Thanks for voting on #LIVE.";
    }


    if (
      activeQuestion.showResults === true
    ) {

      startResults(
        activeQuestion
      );
    }


  } catch (error) {

    console.error(
      "HashtagLive vote submission failed:",
      error
    );


    if ($("submitBtn")) {

      $("submitBtn").disabled = false;

      $("submitBtn").textContent =
        "SUBMIT VOTE";
    }


    alert(
      "Your vote could not be submitted:\n\n" +
      error.message
    );
  }
}


/* =========================================================
   LIVE RESULTS
========================================================= */

function startResults(question) {

  if (!$("publicResults")) {
    return;
  }


  $("publicResults")
    .classList
    .remove("hidden");


  if (stopResults) {
    stopResults();
  }


  const questionId =
    question.questionId ||
    question.id;


  if (!questionId) {
    return;
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
        questionId
      )
    );


  stopResults =
    onSnapshot(

      votesQuery,

      (snapshot) => {

        const counts =
          Object.fromEntries(
            (
              question.options || []
            ).map(
              (option) => [
                option.id,
                0
              ]
            )
          );


        let total = 0;


        snapshot.forEach(
          (voteDoc) => {

            total++;


            const data =
              voteDoc.data();


            (
              data.answers || []
            ).forEach(
              (answer) => {

                if (
                  counts[answer] != null
                ) {

                  counts[answer]++;
                }
              }
            );
          }
        );


        $("publicResults").innerHTML =
          (
            question.options || []
          )
            .map(
              (option) => {

                const percentage =
                  total > 0

                    ? Math.round(
                        (
                          counts[
                            option.id
                          ] /
                          total
                        ) * 100
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
                        style="
                          width:${percentage}%
                        "
                      ></div>

                    </div>

                  </div>
                `;
              }
            )
            .join("");
      },


      (error) => {

        console.error(
          "HashtagLive results listener failed:",
          error
        );

      }
    );
}


/* =========================================================
   LISTEN TO live/current
========================================================= */

function startLiveListener() {

  console.log(
    "HashtagLive: starting live/current listener..."
  );


  const liveRef =
    doc(
      db,
      "live",
      "current"
    );


  stopLive =
    onSnapshot(

      liveRef,

      async (snapshot) => {

        console.log(
          "HashtagLive: live/current update:",
          snapshot.exists()
        );


        /*
          live/current does not exist.
        */

        if (!snapshot.exists()) {

          console.log(
            "HashtagLive: live/current does not exist."
          );

          showNoQuestion();

          return;
        }


        const live =
          snapshot.data();


        console.log(
          "HashtagLive: live/current data:",
          live
        );


        /*
          There is no active question.
        */

        if (
          live.active !== true
        ) {

          console.log(
            "HashtagLive: live/current is not active."
          );

          showNoQuestion();

          return;
        }


        /*
          Create the question object
          from live/current.
        */

        const question = {

          ...live,

          id:
            live.questionId,

          questionId:
            live.questionId
        };


        const show = {

          id:
            live.showId,

          title:
            live.showTitle ||
            "#LIVE"
        };


        renderQuestion(
          question,
          show
        );


        await checkAlreadyVoted(
          question
        );


        $("loadingState")
          ?.classList
          .add("hidden");


        $("noQuestion")
          ?.classList
          .add("hidden");


        $("voteView")
          ?.classList
          .remove("hidden");


        console.log(
          "HashtagLive: public voting question displayed."
        );
      },


      (error) => {

        console.error(
          "HashtagLive: live/current listener failed:",
          error
        );


        showNoQuestion(
          "The live question could not be loaded."
        );
      }
    );
}


/* =========================================================
   NO QUESTION
========================================================= */

function showNoQuestion(
  message =
    "There isn't a live question right now."
) {

  $("loadingState")
    ?.classList
    .add("hidden");


  $("voteView")
    ?.classList
    .add("hidden");


  $("noQuestion")
    ?.classList
    .remove("hidden");


  const text =
    $("noQuestion")
      ?.querySelector("p");


  if (text) {

    text.textContent =
      message;
  }
}


/* =========================================================
   START VOTING SYSTEM
========================================================= */

if ($("voteForm")) {

  $("voteForm")
    .addEventListener(
      "submit",
      submitVote
    );

} else {

  console.warn(
    "HashtagLive: #voteForm was not found."
  );
}


/*
  Start anonymous authentication.

  This does NOT require the voter to
  register or enter any details.
*/

ensureAnonymousUser()

  .then(() => {

    console.log(
      "HashtagLive: anonymous authentication successful."
    );

    startLiveListener();

  })

  .catch((error) => {

    console.error(
      "HashtagLive: anonymous authentication failed:",
      error
    );


    showNoQuestion(
      "Unable to connect to the voting system."
    );

  });
