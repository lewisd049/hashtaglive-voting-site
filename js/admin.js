import {
  auth,
  db,
  names,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  serverTimestamp,
  writeBatch
} from "./firebase.js";

const $ = id => document.getElementById(id);

let currentUser = null;
let currentShowId = null;
let currentQuestionId = null;

let stopShows = null;
let stopQuestions = null;
let stopVotes = null;

let showsCache = [];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

/* =========================
   AUTHENTICATION
========================= */

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    showLogin();
    return;
  }

  try {
    const adminRef = doc(
      db,
      names.ADMIN_COLLECTION,
      user.uid
    );

    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
      await signOut(auth);
      throw new Error("This account is not an administrator.");
    }

    showAdmin();
    subscribeShows();

  } catch (error) {
    console.error("Admin authentication error:", error);
    $("loginError").textContent = error.message;
  }
});

function showLogin() {
  $("loginPanel").classList.remove("hidden");
  $("adminApp").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function showAdmin() {
  $("loginPanel").classList.add("hidden");
  $("adminApp").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  $("loginError").textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    console.error(error);

    if (error.code?.includes("invalid-credential")) {
      $("loginError").textContent =
        "The email/password is incorrect.";
    } else if (error.code?.includes("too-many-requests")) {
      $("loginError").textContent =
        "Too many attempts. Try again later.";
    } else {
      $("loginError").textContent =
        error.message || "Sign-in failed.";
    }
  }
});

$("logoutBtn").onclick = () => signOut(auth);


/* =========================
   SHOWS
========================= */

function subscribeShows() {

  if (stopShows) {
    stopShows();
  }

  const showsQuery = query(
    collection(db, names.SHOWS_COLLECTION)
  );

  stopShows = onSnapshot(
    showsQuery,

    snapshot => {

      showsCache = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .sort((a, b) => {

          const aTime =
            a.updatedAt?.seconds ||
            a.createdAt?.seconds ||
            0;

          const bTime =
            b.updatedAt?.seconds ||
            b.createdAt?.seconds ||
            0;

          return bTime - aTime;
        });

      renderShows();

      if (!currentShowId && showsCache.length) {
        selectShow(showsCache[0].id);
      }
    },

    error => {

      console.error("Show listener error:", error);

      $("showList").innerHTML = `
        <div class="error-text">
          Could not load shows:<br>
          ${esc(error.message)}
        </div>
      `;
    }
  );
}

function renderShows() {

  $("showList").innerHTML = "";

  showsCache.forEach(show => {

    const div = document.createElement("div");

    div.className =
      `list-item ${
        show.id === currentShowId ? "active" : ""
      }`;

    div.innerHTML = `
      <strong>${esc(show.title || "Untitled show")}</strong>
      <small>${esc(show.status || "draft")}</small>
    `;

    div.onclick = () => selectShow(show.id);

    $("showList").appendChild(div);
  });
}

function selectShow(id) {

  currentShowId = id;

  const show = showsCache.find(
    item => item.id === id
  );

  if (!show) return;

  $("showName").value =
    show.title || "";

  $("showStatus").value =
    show.status || "draft";

  $("editorTitle").textContent =
    show.title || "Edit show";

  $("adminStatus").textContent =
    show.status === "live"
      ? "LIVE"
      : show.status || "Draft";

  $("adminStatus").className =
    `pill ${
      show.status === "live"
        ? "live-pill"
        : ""
    }`;

  renderShows();

  subscribeQuestions(id);

  currentQuestionId = null;

  clearQuestionEditor();
}


/* =========================
   QUESTIONS
========================= */

function subscribeQuestions(showId) {

  if (stopQuestions) {
    stopQuestions();
  }

  /*
    IMPORTANT:
    We intentionally DON'T use:

    orderBy("order")

    here.

    That combination with where("showId")
    can require a Firestore composite index.

    We sort the questions in JavaScript instead.
  */

  const questionsQuery = query(
    collection(db, names.QUESTIONS_COLLECTION),
    where("showId", "==", showId)
  );

  stopQuestions = onSnapshot(

    questionsQuery,

    snapshot => {

      const questions = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .sort(
          (a, b) =>
            (Number(a.order) || 0) -
            (Number(b.order) || 0)
        );

      $("questionList").innerHTML = "";

      if (!questions.length) {

        $("questionList").innerHTML = `
          <div style="color:#a8a8b3;padding:15px 0;">
            No questions yet.
          </div>
        `;

        return;
      }

      questions.forEach(question => {

        const div =
          document.createElement("div");

        div.className =
          `question-item ${
            question.id === currentQuestionId
              ? "active"
              : ""
          }`;

        div.innerHTML = `
          <div>
            <strong>
              ${esc(
                question.text ||
                "Untitled question"
              )}
            </strong>

            <small>
              ${
                question.active
                  ? "ACTIVE · "
                  : ""
              }

              ${esc(
                question.type ||
                "single"
              )}
            </small>
          </div>

          <span>
            ${
              question.active
                ? "●"
                : "○"
            }
          </span>
        `;

        div.onclick = () =>
          editQuestion(question);

        $("questionList")
          .appendChild(div);
      });
    },

    error => {

      console.error(
        "Question listener error:",
        error
      );

      $("questionList").innerHTML = `
        <div class="error-text">
          <strong>
            Could not load questions
          </strong>
          <br><br>
          ${esc(error.message)}
        </div>
      `;
    }
  );
}


/* =========================
   QUESTION EDITOR
========================= */

function clearQuestionEditor() {

  $("questionEditor")
    .classList
    .add("hidden");

  $("resultsTitle")
    .textContent =
    "Select a question";

  $("resultsBars")
    .innerHTML = "";

  $("voteCount")
    .textContent =
    "0 votes";

  if (stopVotes) {
    stopVotes();
    stopVotes = null;
  }
}

function editQuestion(question) {

  currentQuestionId =
    question.id;

  $("questionEditor")
    .classList
    .remove("hidden");

  $("questionTextInput").value =
    question.text || "";

  $("questionType").value =
    question.type || "single";

  $("questionOrder").value =
    question.order ?? 0;

  $("acceptVotes").checked =
    question.acceptVotes !== false;

  $("showResults").checked =
    !!question.showResults;

  renderOptions(
    question.options ||
    defaultOptions(question.type)
  );

  subscribeVotes(question);

  /*
    Refresh question list so the
    selected item is highlighted.
  */
  subscribeQuestions(
    currentShowId
  );
}

function defaultOptions(type) {

  if (type === "yesno") {

    return [
      {
        id: "yes",
        text: "Yes"
      },
      {
        id: "no",
        text: "No"
      }
    ];
  }

  if (type === "rating") {

    return [1, 2, 3, 4, 5]
      .map(number => ({
        id: String(number),
        text: String(number)
      }));
  }

  return [
    {
      id: crypto.randomUUID(),
      text: "Option A"
    },
    {
      id: crypto.randomUUID(),
      text: "Option B"
    }
  ];
}

function renderOptions(options) {

  $("optionEditor")
    .innerHTML = "";

  options.forEach(option =>
    addOptionRow(option)
  );
}

function addOptionRow(
  option = {
    id: crypto.randomUUID(),
    text: ""
  }
) {

  const row =
    document.createElement("div");

  row.className =
    "option-line";

  row.dataset.id =
    option.id;

  row.innerHTML = `
    <input
      value="${esc(option.text)}"
      placeholder="Answer"
    >

    <button
      type="button"
    >
      Remove
    </button>
  `;

  row.querySelector("button")
    .onclick = () => row.remove();

  $("optionEditor")
    .appendChild(row);
}

$("addOptionBtn").onclick =
  () => addOptionRow();

$("questionType").onchange =
  () => {

    const type =
      $("questionType").value;

    if (
      type === "yesno" ||
      type === "rating"
    ) {
      renderOptions(
        defaultOptions(type)
      );
    }
  };


/* =========================
   NEW SHOW
========================= */

$("newShowBtn").onclick = () => {

  currentShowId = null;
  currentQuestionId = null;

  $("showName").value =
    "New #LIVE Show";

  $("showStatus").value =
    "draft";

  $("editorTitle").textContent =
    "New show";

  $("questionList")
    .innerHTML = "";

  clearQuestionEditor();

  renderShows();
};


/* =========================
   SAVE SHOW
========================= */

$("saveShowBtn").onclick =
  async () => {

    try {

      const title =
        $("showName")
          .value
          .trim();

      if (!title) {
        alert("Enter a show title.");
        return;
      }

      const data = {

        title,

        status:
          $("showStatus").value,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentUser.uid
      };

      if (currentShowId) {

        await updateDoc(
          doc(
            db,
            names.SHOWS_COLLECTION,
            currentShowId
          ),
          data
        );

      } else {

        const ref =
          doc(
            collection(
              db,
              names.SHOWS_COLLECTION
            )
          );

        await setDoc(
          ref,
          {
            ...data,
            createdAt:
              serverTimestamp()
          }
        );

        currentShowId =
          ref.id;
      }

      alert("Show saved successfully.");

    } catch (error) {

      console.error(
        "Show save error:",
        error
      );

      alert(
        "Could not save show:\n\n" +
        error.message
      );
    }
  };


/* =========================
   DELETE SHOW
========================= */

$("deleteShowBtn").onclick =
  async () => {

    if (!currentShowId)
      return;

    if (
      !confirm(
        "Delete this show?"
      )
    ) return;

    try {

      await deleteDoc(
        doc(
          db,
          names.SHOWS_COLLECTION,
          currentShowId
        )
      );

      currentShowId = null;

      clearQuestionEditor();

    } catch (error) {

      console.error(error);

      alert(
        "Could not delete show:\n\n" +
        error.message
      );
    }
  };


/* =========================
   NEW QUESTION
========================= */

$("newQuestionBtn").onclick =
  () => {

    if (!currentShowId) {

      alert(
        "Save or select a show first."
      );

      return;
    }

    currentQuestionId = null;

    $("questionEditor")
      .classList
      .remove("hidden");

    $("questionTextInput").value =
      "";

    $("questionType").value =
      "single";

    $("questionOrder").value =
      $("questionList")
        .children
        .length;

    $("acceptVotes").checked =
      true;

    $("showResults").checked =
      false;

    renderOptions(
      defaultOptions("single")
    );
  };


/* =========================
   SAVE QUESTION
========================= */

$("saveQuestionBtn").onclick =
  async () => {

    if (!currentShowId) {

      alert(
        "Save or select a show first."
      );

      return;
    }

    try {

      const text =
        $("questionTextInput")
          .value
          .trim();

      if (!text) {

        alert(
          "Enter a question."
        );

        return;
      }

      const options =
        [
          ...document.querySelectorAll(
            "#optionEditor .option-line"
          )
        ]
          .map(row => ({

            id:
              row.dataset.id ||
              crypto.randomUUID(),

            text:
              row.querySelector("input")
                .value
                .trim()

          }))
          .filter(
            option => option.text
          );

      if (!options.length) {

        alert(
          "Add at least one answer."
        );

        return;
      }

      const data = {

        showId:
          currentShowId,

        text,

        type:
          $("questionType").value,

        order:
          Number(
            $("questionOrder").value
          ) || 0,

        acceptVotes:
          $("acceptVotes").checked,

        showResults:
          $("showResults").checked,

        options,

        active: false,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentUser.uid
      };

      /*
        If editing an existing question,
        preserve whether it is active.
      */

      if (currentQuestionId) {

        const existing =
          await getDoc(
            doc(
              db,
              names.QUESTIONS_COLLECTION,
              currentQuestionId
            )
          );

        if (
          existing.exists() &&
          existing.data().active === true
        ) {
          data.active = true;
        }

        await updateDoc(
          doc(
            db,
            names.QUESTIONS_COLLECTION,
            currentQuestionId
          ),
          data
        );

      } else {

        const ref =
          doc(
            collection(
              db,
              names.QUESTIONS_COLLECTION
            )
          );

        await setDoc(
          ref,
          {
            ...data,

            createdAt:
              serverTimestamp()
          }
        );

        currentQuestionId =
          ref.id;
      }

      /*
        Immediately reload the list.
      */

      subscribeQuestions(
        currentShowId
      );

      alert(
        "Question saved successfully!"
      );

    } catch (error) {

      console.error(
        "QUESTION SAVE FAILED:",
        error
      );

      alert(
        "The question could not be saved.\n\n" +
        error.message
      );
    }
  };


/* =========================
   DELETE QUESTION
========================= */

$("deleteQuestionBtn").onclick =
  async () => {

    if (!currentQuestionId)
      return;

    if (
      !confirm(
        "Delete this question?"
      )
    ) return;

    try {

      await deleteDoc(
        doc(
          db,
          names.QUESTIONS_COLLECTION,
          currentQuestionId
        )
      );

      currentQuestionId = null;

      clearQuestionEditor();

      subscribeQuestions(
        currentShowId
      );

    } catch (error) {

      console.error(error);

      alert(
        "Could not delete question:\n\n" +
        error.message
      );
    }
  };


/* =========================
   ACTIVATE QUESTION
========================= */

$("activateBtn").onclick =
  async () => {

    if (
      !currentQuestionId ||
      !currentShowId
    ) return;

    try {

      const snapshot =
        await getDocs(
          query(
            collection(
              db,
              names.QUESTIONS_COLLECTION
            ),
            where(
              "showId",
              "==",
              currentShowId
            )
          )
        );

      const batch =
        writeBatch(db);

      snapshot.forEach(
        question => {

          batch.update(
            question.ref,
            {
              active:
                question.id ===
                currentQuestionId,

              updatedAt:
                serverTimestamp()
            }
          );
        }
      );

      /*
        Make sure the selected question
        is definitely active.
      */

      batch.update(
        doc(
          db,
          names.QUESTIONS_COLLECTION,
          currentQuestionId
        ),
        {
          active: true,
          acceptVotes: true,
          updatedAt:
            serverTimestamp()
        }
      );

      await batch.commit();

      await updateDoc(
        doc(
          db,
          names.SHOWS_COLLECTION,
          currentShowId
        ),
        {
          status: "live",
          updatedAt:
            serverTimestamp()
        }
      );

      alert(
        "Question is now LIVE!"
      );

    } catch (error) {

      console.error(
        "Activate question error:",
        error
      );

      alert(
        "Could not activate question:\n\n" +
        error.message
      );
    }
  };


/* =========================
   CLOSE VOTING
========================= */

$("closeVoteBtn").onclick =
  async () => {

    if (!currentQuestionId)
      return;

    try {

      await updateDoc(
        doc(
          db,
          names.QUESTIONS_COLLECTION,
          currentQuestionId
        ),
        {
          acceptVotes: false,
          active: false,
          updatedAt:
            serverTimestamp()
        }
      );

      alert(
        "Voting closed."
      );

    } catch (error) {

      console.error(error);

      alert(
        "Could not close voting:\n\n" +
        error.message
      );
    }
  };


/* =========================
   LIVE RESULTS
========================= */

function subscribeVotes(question) {

  if (stopVotes) {
    stopVotes();
  }

  $("resultsTitle")
    .textContent =
    question.text ||
    "Results";

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

            total++;

            (
              vote.data()
                .answers || []
            ).forEach(answer => {

              if (
                counts[answer] != null
              ) {
                counts[answer]++;
              }

            });
          }
        );

        $("voteCount")
          .textContent =
          `${total} vote${
            total === 1
              ? ""
              : "s"
          }`;

        $("resultsBars")
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
                      ${esc(
                        option.text
                      )}
                    </span>

                    <strong>
                      ${percentage}%
                      ·
                      ${counts[
                        option.id
                      ]}
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
      },

      error => {

        console.error(
          "Vote results error:",
          error
        );

        $("resultsBars")
          .innerHTML = `
            <div class="error-text">
              Could not load results:
              ${esc(error.message)}
            </div>
          `;
      }
    );
}
