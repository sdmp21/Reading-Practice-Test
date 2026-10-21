
/* Google Apps Script Web App URL */
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzZCl7L7_0aQNKp7yxfEod7VmljJQFD7Xey9vuca7Pzqolbht-rfgame56vYSf3_Gkx5A/exec";

const $ = (id) => document.getElementById(id);

let studentName = "";
let moduleNo = 1;
let currentIndex = 0;
let answers = { 1: {}, 2: {} };
let secondsLeft = TEST_DATA[1].minutes * 60;
let timerHandle = null;
let largeText = false;
let submitting = false;
let submittedModules = [];
let testFinished = false;

const optionLetters = ["A", "B", "C", "D"];

/* ---------- ANSWER HELPERS ---------- */

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function currentModule() {
  return TEST_DATA[moduleNo];
}

function currentQuestion() {
  return currentModule().questions[currentIndex];
}

function answered(q) {
  const v = answers[moduleNo][q.n];

  if (q.type !== "text") return Boolean(v);

  const prefix = q.prefix || "";
  return String(v ?? "").trim().length > prefix.length;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

/* ---------- EVENT LISTENERS ---------- */

$("start-btn").addEventListener("click", startTest);
$("prev-btn").addEventListener("click", () => moveQuestion(-1));
$("next-btn").addEventListener("click", () => moveQuestion(1));
$("review-btn").addEventListener("click", showReview);

$("return-btn").addEventListener("click", () => {
  if (testFinished || submittedModules.includes(moduleNo)) return;

  $("review-screen").hidden = true;
  $("test-screen").hidden = false;
  renderQuestion();
});

$("submit-btn").addEventListener("click", openSubmitModal);
$("confirm-submit-btn").addEventListener("click", openSubmitModal);

$("cancel-submit").addEventListener("click", () => {
  $("confirm-modal").hidden = true;
});

$("yes-submit").addEventListener("click", () => submitModule(false));

$("font-btn").addEventListener("click", () => {
  largeText = !largeText;
  $("passage-content").classList.toggle("large-text", largeText);
});

window.addEventListener("beforeunload", (e) => {
  if (
    studentName &&
    !testFinished &&
    !submittedModules.includes(moduleNo) &&
    !$("welcome-screen").hidden
  ) {
    return;
  }

  if (
    studentName &&
    !testFinished &&
    !submittedModules.includes(moduleNo) &&
    !$("test-screen").hidden
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- START AND MODULE NAVIGATION ---------- */

function startTest() {
  if (testFinished) return;

  const name = $("student-name").value.trim();

  if (!name) {
    $("name-error").hidden = false;
    $("student-name").focus();
    return;
  }

  $("name-error").hidden = true;
  studentName = name;

  $("welcome-screen").hidden = true;
  $("review-screen").hidden = true;
  $("done-screen").hidden = true;
  $("test-screen").hidden = false;

  beginModule(1);
}

function beginModule(num) {
  // Do not allow a finished test to restart.
  if (testFinished || submittedModules.includes(num)) return;

  const oldContinueBtn = $("continue-module-btn");
  if (oldContinueBtn) oldContinueBtn.remove();

  moduleNo = num;
  currentIndex = 0;
  secondsLeft = TEST_DATA[num].minutes * 60;

  $("module-label").textContent = TEST_DATA[num].title;
  $("question-module").textContent =
    TEST_DATA[num].title.toUpperCase();

  $("welcome-screen").hidden = true;
  $("review-screen").hidden = true;
  $("done-screen").hidden = true;
  $("test-screen").hidden = false;
  $("confirm-modal").hidden = true;

  renderQuestion();
  updateTimer();

  if (timerHandle) clearInterval(timerHandle);

  timerHandle = setInterval(() => {
    if (testFinished || submitting) return;

    secondsLeft--;
    updateTimer();

    if (secondsLeft <= 0) {
      clearInterval(timerHandle);
      timerHandle = null;
      submitModule(true);
    }
  }, 1000);
}

function updateTimer() {
  const m = Math.floor(Math.max(0, secondsLeft) / 60);
  const s = Math.max(0, secondsLeft) % 60;

  $("timer").textContent =
    `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  $("timer").style.color =
    secondsLeft <= 60 ? "#ffb7a9" : "white";
}

/* ---------- RENDER QUESTIONS ---------- */

function renderQuestion() {
  if (testFinished || submittedModules.includes(moduleNo)) return;

  const q = currentQuestion();

  $("question-title").textContent =
    q.type === "text"
      ? `Questions ${
          moduleNo === 1
            ? (q.n <= 10 ? "1–10" : "11–20")
            : "1–10"
        }`
      : `Question ${q.n}`;

  $("question-module").textContent =
    `${currentModule().title.toUpperCase()}` +
    (q.scored ? "" : " · NOT SCORED");

  const passage = currentModule().passages[q.p];

  $("passage-content").innerHTML = passage.html;
  $("test-screen").classList.toggle(
    "word-completion",
    q.type === "text"
  );
  $("passage-content").classList.toggle("large-text", largeText);
  $("passage-kicker").textContent = passage.title.toUpperCase();

  // Replace missing-word markers with letter boxes.
  currentModule().questions
    .filter((item) => item.type === "text" && item.p === q.p)
    .forEach((item) => {
      const marker = `[${item.n}]`;

      const slot = [
        ...$("passage-content").querySelectorAll(".slot")
      ].find((el) => el.textContent.trim() === marker);

      if (!slot) return;

      const prefix = item.prefix || "";
      const missingCount = Math.max(
        1,
        item.answer.length - prefix.length
      );

      let boxes =
        `<span class="inline-word" data-inline-word="${item.n}">`;

      for (let i = 0; i < missingCount; i++) {
        boxes += `
          <input
            class="letter-box"
            type="text"
            inputmode="text"
            maxlength="1"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-q="${item.n}"
            data-letter="${i}"
            aria-label="Question ${item.n}, missing letter ${i + 1}"
          />
        `;
      }

      boxes += "</span>";
      slot.outerHTML = boxes;
    });

  const saved = answers[moduleNo][q.n] ?? "";

  if (q.type === "mc") {
    let content =
      `<p class="question-stem">${escapeHTML(q.stem)}</p>`;

    content +=
      `<div class="options" role="radiogroup" aria-label="Answer choices">` +
      q.options.map((opt, i) => {
        const letter = optionLetters[i];
        const selected = saved === letter;

        return `
          <label class="option ${selected ? "selected" : ""}">
            <input
              type="radio"
              name="answer"
              value="${letter}"
              ${selected ? "checked" : ""}
            />
            <span class="option-letter">${letter}.</span>
            <span class="option-text">${escapeHTML(opt)}</span>
          </label>
        `;
      }).join("") +
      "</div>";

    $("question-content").innerHTML = content;

    document.querySelectorAll('input[name="answer"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        answers[moduleNo][q.n] = e.target.value;
        renderQuestion();
      });
    });
  } else {
    $("question-content").innerHTML = `
      <p class="question-stem">
        Type the missing letters directly in the passage.
      </p>
      <p class="answer-hint">
        Your letters are saved as you type. Questions 11–20
        in Module 1 are not scored.
      </p>
    `;
  }

  // Restore saved letters and keyboard controls.
  $("passage-content").querySelectorAll(".inline-word").forEach((wordEl) => {
    const n = Number(wordEl.dataset.inlineWord);

    const item = currentModule().questions.find(
      (item) => item.n === n
    );

    const prefix = item.prefix || "";
    const boxes = [...wordEl.querySelectorAll(".letter-box")];
    const savedWord = String(answers[moduleNo][n] ?? "");

    const suffix = savedWord
      .toLowerCase()
      .startsWith(prefix.toLowerCase())
        ? savedWord.slice(prefix.length)
        : savedWord;

    boxes.forEach((box, index) => {
      box.value = (suffix[index] || "").slice(0, 1);

      box.addEventListener("input", () => {
        const letters = boxes.map((b) => b.value).join("");
        answers[moduleNo][n] = (prefix + letters).trim();

        if (box.value && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }

        updatePalette();
        updateAnsweredCount();
      });

      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && index > 0) {
          boxes[index - 1].focus();
          boxes[index - 1].value = "";

          const letters = boxes.map((b) => b.value).join("");
          answers[moduleNo][n] = (prefix + letters).trim();

          updatePalette();
          updateAnsweredCount();
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && index > 0) {
          boxes[index - 1].focus();
          e.preventDefault();
        } else if (
          e.key === "ArrowRight" &&
          index < boxes.length - 1
        ) {
          boxes[index + 1].focus();
          e.preventDefault();
        }
      });

      box.addEventListener("paste", (e) => {
        const paste = (e.clipboardData || window.clipboardData)
          .getData("text")
          .replace(/[^a-z]/gi, "");

        if (!paste) return;

        e.preventDefault();

        paste.slice(0, boxes.length).split("").forEach((letter, i) => {
          if (boxes[i]) boxes[i].value = letter;
        });

        const letters = boxes.map((b) => b.value).join("");
        answers[moduleNo][n] = (prefix + letters).trim();

        const focusIndex = Math.min(
          paste.length,
          boxes.length - 1
        );

        if (boxes[focusIndex]) boxes[focusIndex].focus();

        updatePalette();
        updateAnsweredCount();
      });
    });
  });

  $("prev-btn").disabled = currentIndex === 0;

  $("next-btn").textContent =
    currentIndex === currentModule().questions.length - 1
      ? "Last question"
      : "Next →";

  $("next-btn").disabled =
    currentIndex === currentModule().questions.length - 1;

  $("module-progress").textContent =
    `Question ${q.n} of ${currentModule().total}`;

  updatePalette();
  updateAnsweredCount();

  if (q.type === "text") {
    const target = $("passage-content").querySelector(
      `.letter-box[data-q="${q.n}"]`
    );

    if (target) target.focus({ preventScroll: true });
  }
}

/* ---------- QUESTION NAVIGATION ---------- */

function moveQuestion(delta) {
  if (testFinished || submittedModules.includes(moduleNo)) return;

  const next = currentIndex + delta;

  if (next < 0 || next >= currentModule().questions.length) return;

  currentIndex = next;
  renderQuestion();
}

function updatePalette() {
  const qs = currentModule().questions;

  $("question-palette").innerHTML = qs.map((q, i) => {
    const cls = [
      i === currentIndex ? "current" : "",
      answered(q) ? "answered" : "",
      q.scored ? "" : "unscored"
    ].filter(Boolean).join(" ");

    return `
      <button
        type="button"
        class="palette-btn ${cls}"
        data-index="${i}"
        aria-label="Question ${q.n}"
      >${q.n}</button>
    `;
  }).join("");

  $("question-palette").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (testFinished || submittedModules.includes(moduleNo)) return;

      currentIndex = Number(btn.dataset.index);
      renderQuestion();
    });
  });
}

function updateAnsweredCount() {
  const count = currentModule().questions.filter(answered).length;
  $("answered-count").textContent = `${count} answered`;
}

/* ---------- REVIEW ---------- */

function showReview() {
  if (testFinished || submittedModules.includes(moduleNo)) return;

  $("test-screen").hidden = true;
  $("review-screen").hidden = false;

  $("review-heading").textContent =
    `Review ${currentModule().title}`;

  const missing = currentModule().questions.filter(
    (q) => !answered(q)
  ).length;

  $("review-description").textContent = missing
    ? `${missing} question(s) are unanswered. You can return to any question before submitting.`
    : "All questions have a response. You can return to any question before submitting.";

  $("review-list").innerHTML = currentModule().questions.map((q, i) => `
    <button
      type="button"
      class="review-item ${answered(q) ? "" : "missing"}"
      data-index="${i}"
    >
      <span>Question ${q.n}${q.scored ? "" : " · unscored"}</span>
      <strong>${answered(q) ? "Answered" : "Unanswered"}</strong>
    </button>
  `).join("");

  $("review-list").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (testFinished || submittedModules.includes(moduleNo)) return;

      currentIndex = Number(btn.dataset.index);
      $("review-screen").hidden = true;
      $("test-screen").hidden = false;
      renderQuestion();
    });
  });
}

/* ---------- SUBMISSION CONFIRMATION ---------- */

function openSubmitModal() {
  if (testFinished || submitting || submittedModules.includes(moduleNo)) {
    return;
  }

  const unanswered = currentModule().questions.filter(
    (q) => !answered(q)
  ).length;

  $("confirm-message").textContent = unanswered
    ? `${unanswered} question(s) are unanswered. Submit this module anyway? You cannot change answers after submission.`
    : "Submit your answers for this module? You cannot change answers after submission.";

  $("confirm-modal").hidden = false;
}

/* ---------- SCORING ---------- */

function scoreModule(num) {
  const data = TEST_DATA[num];
  let correct = 0;
  let scoredAnswered = 0;

  for (const q of data.questions) {
    if (!q.scored) continue;

    const response = answers[num][q.n];

    if (response !== undefined && String(response).trim() !== "") {
      scoredAnswered++;
    }

    if (q.type === "mc" && response === q.answer) {
      correct++;
    }

    if (
      q.type === "text" &&
      normalizeAnswer(response) === normalizeAnswer(q.answer)
    ) {
      correct++;
    }
  }

  return {
    correct,
    max: data.scoredMax,
    scoredAnswered
  };
}

/* ---------- GOOGLE SHEETS ---------- */

async function postModule(num, autoSubmitted = false) {
  const score = scoreModule(num);

  const payload = {
    event: "module_submission",
    testName: "Reading Practice Test",
    studentFullName: studentName,
    module: `Module ${num}`,
    submittedAt: new Date().toISOString(),
    autoSubmitted,
    score: score.correct,
    maxScore: score.max,
    scoredQuestionsAnswered: score.scoredAnswered,
    answers: TEST_DATA[num].questions.map((q) => ({
      questionNumber: q.n,
      answer: answers[num][q.n] ?? "",
      scored: q.scored,
      correctAnswer: q.scored ? q.answer : ""
    }))
  };

  if (
    !GOOGLE_SCRIPT_URL ||
    GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")
  ) {
    console.warn("Google Apps Script URL is not configured.", payload);
    return { saved: false, score };
  }

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    // no-cors cannot confirm that Google Sheets saved the data.
    return { saved: true, score };
  } catch (err) {
    console.error("Submission error:", err);
    return { saved: false, score };
  }
}

/* ---------- SUBMIT MODULE ---------- */

async function submitModule(autoSubmitted = false) {
  if (submitting || testFinished || submittedModules.includes(moduleNo)) {
    return;
  }

  submitting = true;

  const thisModule = moduleNo;

  $("confirm-modal").hidden = true;

  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }

  $("yes-submit").disabled = true;
  $("test-screen").hidden = true;
  $("review-screen").hidden = true;
  $("done-screen").hidden = false;

  $("done-heading").textContent = autoSubmitted
    ? "Time is up!"
    : `Module ${thisModule} submitted`;

  $("done-message").textContent = "Your responses are being submitted.";

  $("score-summary").innerHTML = `
    <div class="score-chip">
      <strong>…</strong>
      <span>Calculating score</span>
    </div>
  `;

  let result;

  try {
    result = await postModule(thisModule, autoSubmitted);
  } catch (err) {
    console.error(err);
    result = {
      saved: false,
      score: scoreModule(thisModule)
    };
  }

  submittedModules.push(thisModule);

  $("score-summary").innerHTML = `
    <div class="score-chip">
      <strong>${result.score.correct}/${result.score.max}</strong>
      <span>${TEST_DATA[thisModule].title} score</span>
    </div>
    <div class="score-chip">
      <strong>${result.score.scoredAnswered}/${result.score.max}</strong>
      <span>Scored questions answered</span>
    </div>
  `;

  const oldContinueBtn = $("continue-module-btn");
  if (oldContinueBtn) oldContinueBtn.remove();

  if (thisModule === 1) {
    $("done-heading").textContent = "Module 1 submitted";

    $("done-message").textContent = result.saved
      ? "Your Module 1 responses have been submitted. Continue when you are ready."
      : "Module 1 has been scored, but the Google Sheets save could not be confirmed.";

    const continueBtn = document.createElement("button");
    continueBtn.id = "continue-module-btn";
    continueBtn.className = "primary-btn";
    continueBtn.textContent = "Continue to Module 2 →";
    continueBtn.style.marginTop = "12px";

    continueBtn.addEventListener("click", () => {
      if (testFinished) return;
      beginModule(2);
    });

    $("score-summary").after(continueBtn);
  } else {
    // FINAL SCREEN: do not restart or return to the test.
    testFinished = true;

    $("welcome-screen").hidden = true;
    $("test-screen").hidden = true;
    $("review-screen").hidden = true;
    $("confirm-modal").hidden = true;
    $("done-screen").hidden = false;

    $("done-heading").textContent = "Thank You!";

    $("done-message").textContent = result.saved
      ? "You have completed the TOEFL iBT Reading mock test. Your responses have been submitted."
      : "You have completed the TOEFL iBT Reading mock test. Your answers have been scored, but the Google Sheets save could not be confirmed. Please inform your tutor.";

    const total = scoreModule(1).correct + scoreModule(2).correct;
    const totalMax = TEST_DATA[1].scoredMax + TEST_DATA[2].scoredMax;

    const totalChip = document.createElement("div");
    totalChip.className = "score-chip";
    totalChip.innerHTML = `
      <strong>${total}/${totalMax}</strong>
      <span>Total reading score</span>
    `;

    $("score-summary").appendChild(totalChip);

    // Disable all test navigation controls.
    [
      "start-btn",
      "submit-btn",
      "confirm-submit-btn",
      "prev-btn",
      "next-btn",
      "review-btn",
      "return-btn",
      "yes-submit"
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = true;
    });

    // Remove the Continue button if one remains.
    const continueBtn = $("continue-module-btn");
    if (continueBtn) continueBtn.remove();
  }

  $("yes-submit").disabled = false;
  submitting = false;
}
