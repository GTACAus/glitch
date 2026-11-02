/* ==================================================
   COMMON FUNCTIONS

   Shared by every lesson page. Anything used by only
   one page belongs in that page's own script:
     scripts/pretask_scripts/
     scripts/lesson1_scripts/
     scripts/lesson2_scripts/

   Contents:
     - Section unlocking and glossary
     - Classroom language filter
     - Number input controls
     - Stop and check
     - Hidden teacher navigation
     - Video modal
     - Save lesson as PDF
     - Student answer helpers
   ================================================== */

/*
  Unlock the section after the current one.

  currentSectionId may be a section id or the section element itself.
  nextSectionId is optional: pass null/undefined to unlock whichever
  .section follows the current one in the page. Existing calls that
  pass both ids behave exactly as before.
*/
function unlockSection(nextSectionId, currentSectionId) {
  const currentSection = typeof currentSectionId === 'string'
    ? document.getElementById(currentSectionId)
    : currentSectionId;

  let nextSection;
  if (nextSectionId) {
    nextSection = document.getElementById(nextSectionId);
  } else if (currentSection) {
    const sections = Array.from(document.querySelectorAll('.section'));
    nextSection = sections[sections.indexOf(currentSection) + 1];
  }

  if (currentSection) currentSection.classList.add('completed');
  if (!nextSection) return;

  nextSection.classList.remove('locked');

  setTimeout(() => {
    nextSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, 100);
}

/* ==================================================
   MODAL OPENING ANIMATION
   ================================================== */

/*
  Remember the last thing the student clicked so that a
  modal can grow out of it.

  This listens in the capture phase, so it always runs
  before the onclick handler that opens the modal. That
  means open functions need no extra argument and no
  markup has to change.
*/
let lastModalTrigger = null;

document.addEventListener("click", function(event) {
  lastModalTrigger =
    event.target.closest("button, a, [onclick], .yeast-card") ||
    event.target;
}, true);

/*
  Grow a modal out of the element that opened it.

  Call this straight after the modal has been made
  visible; the box has to be laid out before it can be
  measured. Pass a trigger to override the remembered
  one, or nothing to use the last click.

  Falls back to a plain grow from the centre when there
  is no usable trigger.
*/
function growModalFromTrigger(modal, trigger) {
  if (!modal) {
    return;
  }

  const box = modal.firstElementChild;

  if (!box) {
    return;
  }

  /*
    Clear the animation first. The class carries the
    transform, so the box has to be untransformed for
    the measurements below to be its true resting size.
  */
  box.classList.remove("modal-grow-in");

  const restingBox = box.getBoundingClientRect();

  /* The modal is not actually on screen. */
  if (!restingBox.width) {
    return;
  }

  const source = trigger || lastModalTrigger;
  const sourceBox =
    source && source.isConnected
      ? source.getBoundingClientRect()
      : null;

  if (sourceBox && sourceBox.width) {
    box.style.setProperty(
      "--origin-x",
      (sourceBox.left + sourceBox.width / 2 - restingBox.left) + "px"
    );

    box.style.setProperty(
      "--origin-y",
      (sourceBox.top + sourceBox.height / 2 - restingBox.top) + "px"
    );

    /*
      Keep the starting size within a sensible band. Some
      triggers are tiny and some, like the hidden teacher
      strip, are wider than the panel they open; without
      this the animation is either a jarring jump from a
      speck or no visible growth at all.
    */
    const startScale = Math.max(
      0.08,
      Math.min(sourceBox.width / restingBox.width, 0.9)
    );

    box.style.setProperty("--start-scale", startScale);
  } else {
    box.style.removeProperty("--origin-x");
    box.style.removeProperty("--origin-y");
    box.style.removeProperty("--start-scale");
  }

  /* Force a reflow so the animation replays on reopen. */
  void box.offsetWidth;

  box.classList.add("modal-grow-in");
}

function openGlossary() {
  const modal = document.getElementById('glossaryModal');

  if (modal) {
    modal.style.display = 'block';
    growModalFromTrigger(modal);
  }
}

function closeGlossary() {
  const modal = document.getElementById('glossaryModal');

  if (modal) {
    modal.style.display = 'none';
  }

}

window.addEventListener('click', function(event) {
  const modal = document.getElementById('glossaryModal');

  if (modal && event.target === modal) {
    closeGlossary();
  }
});

/* ==================================================
   CLASSROOM LANGUAGE FILTER
   ================================================== */

let profanityList = [];
let profanityReady = false;
let profanityLoadingPromise = null;


/*
  Automatically work out where cypher.txt is located.

  common_functions.js is inside:
  /scripts/common_functions.js

  cypher.txt is inside:
  /cypher.txt

  This means pages no longer need to provide "./cypher.txt"
  or "../cypher.txt".
*/
function getClassroomLanguageFilePath() {
  const commonScript = Array.from(
    document.querySelectorAll("script[src]")
  ).find(function(script) {
    return script.src.includes(
      "common_functions.js"
    );
  });

  if (!commonScript) {
    return "cypher.txt";
  }

  return new URL(
    "../cypher.txt",
    commonScript.src
  ).href;
}


/*
  Decode the Caesar-ciphered word list.
*/
function caesarCipher(text, shift) {
  return text
    .split("")
    .map(function(character) {
      if (!/[a-z]/i.test(character)) {
        return character;
      }

      const code = character.charCodeAt(0);

      const base =
        code >= 65 && code <= 90
          ? 65
          : 97;

      return String.fromCharCode(
        (
          code -
          base +
          shift +
          26
        ) % 26 + base
      );
    })
    .join("");
}


/*
  Convert common substitutions before checking.

  Examples:
  @ becomes a
  3 becomes e
  1 becomes i
  0 becomes o
*/
function normaliseForProfanityCheck(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/*
  Load the blocked-language list once per page.
*/
async function initialiseClassroomLanguageFilter() {
  if (profanityLoadingPromise) {
    return profanityLoadingPromise;
  }

  profanityLoadingPromise = loadClassroomLanguageFilter();

  return profanityLoadingPromise;
}


async function loadClassroomLanguageFilter() {
  const profanityFilePath =
    getClassroomLanguageFilePath();

  setStudentTextFieldsLoading(true);

  try {
    const response =
      await fetch(profanityFilePath);

    if (!response.ok) {
      throw new Error(
        "Could not fetch " +
        profanityFilePath +
        ". HTTP status: " +
        response.status
      );
    }

    const encodedText =
      await response.text();

    const decodedText =
      caesarCipher(encodedText, -3);

    profanityList = decodedText
      .split(/\r?\n/)
      .map(function(entry) {
        const trimmedEntry = entry.trim();

        const hasWildcard =
          trimmedEntry.endsWith("*");

        const entryWithoutWildcard =
          hasWildcard
            ? trimmedEntry.slice(0, -1)
            : trimmedEntry;

        const cleanedEntry =
          normaliseForProfanityCheck(
            entryWithoutWildcard
          );

        return hasWildcard
          ? cleanedEntry + "*"
          : cleanedEntry;
      })
      .filter(Boolean);

    profanityReady = true;

    console.log(
      "Classroom language filter loaded:",
      profanityList.length,
      "blocked entries."
    );

    /*
      Saved student answers cannot be checked until the
      filter is ready, so anything waiting on it is told
      here.
    */
    document.dispatchEvent(new Event("language-filter-ready"));

  } catch (error) {
    profanityReady = false;

    console.error(
      "Classroom language filter failed to load:",
      error
    );
  } finally {
    setStudentTextFieldsLoading(false);
  }
}


/*
  Temporarily prevent student submissions while the
  filter file is loading.

  Add data-language-filter="off" to any input or
  textarea that should not be treated as a student answer.
*/
function setStudentTextFieldsLoading(isLoading) {
  const fields =
    document.querySelectorAll(
      [
        'input[type="text"]:not([data-language-filter="off"])',
        'textarea:not([data-language-filter="off"])'
      ].join(",")
    );

  fields.forEach(function(field) {
    if (isLoading) {
      if (!field.disabled) {
        field.dataset.languageFilterDisabled =
          "true";

        field.disabled = true;
      }

      field.setAttribute(
        "aria-busy",
        "true"
      );

      return;
    }

    if (
      field.dataset.languageFilterDisabled ===
      "true"
    ) {
      field.disabled = false;

      delete field.dataset
        .languageFilterDisabled;
    }

    field.removeAttribute("aria-busy");
  });
}


/*
  Return true when student text contains a blocked word
  or blocked phrase.
*/
function containsProfanity(text) {
  if (!profanityReady) {
    console.warn(
      "Profanity check attempted before the list was ready."
    );

    return false;
  }

  const normalisedText =
    normaliseForProfanityCheck(text);

  if (normalisedText === "") {
    return false;
  }

  const words =
    normalisedText
      .split(/\s+/)
      .filter(Boolean);

  return profanityList.some(function(blockedEntry) {
    /*
      A trailing * means:
      block any word beginning with this text.

      Example:
      fuck* blocks fuck, fucks, fucking, fuckj, etc.
    */
    if (blockedEntry.endsWith("*")) {
      const blockedStart =
        blockedEntry.slice(0, -1);

      return words.some(function(word) {
        return word.startsWith(blockedStart);
      });
    }

    /*
      Multi-word blocked phrases.
    */
    if (blockedEntry.includes(" ")) {
      return normalisedText.includes(
        blockedEntry
      );
    }

    /*
      Ordinary exact blocked words.
    */
    return words.includes(
      blockedEntry
    );
  });
}


/*
  Display standard feedback when an answer is blocked.
*/
function showBlockedLanguageFeedback(input) {
  input.value = "";

  input.setCustomValidity(
    "Please use appropriate classroom language."
  );

  input.reportValidity();
  input.focus();

  window.setTimeout(function() {
    input.setCustomValidity("");
  }, 2000);
}


/*
  Read and validate a student's text field.

  Supports:
  - input type="text"
  - textarea

  Returns:
  - cleaned student text when valid;
  - null when empty, unavailable or blocked.
*/
function getValidStudentInput(input) {
  if (!input) {
    return null;
  }

  const isTextInput =
    input.matches('input[type="text"]');

  const isTextArea =
    input.matches("textarea");

  if (!isTextInput && !isTextArea) {
    console.warn(
      "getValidStudentInput received an unsupported element:",
      input
    );

    return null;
  }

  if (!profanityReady) {
    console.warn(
      "Student input was checked before the language filter finished loading."
    );

    input.focus();

    return null;
  }

  const value = input.value.trim();

  if (value === "") {
    input.focus();

    return null;
  }

  if (containsProfanity(value)) {
    showBlockedLanguageFeedback(input);

    return null;
  }

  return value;
}

function setGeneratedText(element, text, placeholder) {
  if (text === "") {
    element.textContent = placeholder;
    element.classList.add("placeholder");
    return;
  }
  element.textContent = text;
  element.classList.remove("placeholder");
}

/*
  Read text that is being used for a live preview.

  Unlike getValidStudentInput(), an empty field is allowed.

  Returns:
  - the cleaned text when safe;
  - an empty string when empty or blocked.
*/
function getSafeStudentPreviewValue(input) {
  if (!input) {
    return "";
  }

  const value = input.value.trim();

  if (value === "") {
    return "";
  }

  if (!profanityReady) {
    return "";
  }

  if (containsProfanity(value)) {
    return "";
  }

  return value;
}


/*
  Automatically initialise the filter on every page that
  loads common_functions.js.
*/
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initialiseClassroomLanguageFilter,
    { once: true }
  );
} else {
  initialiseClassroomLanguageFilter();
}

/* ==================================================
   NUMBER INPUT CONTROLS
   Prevent scroll changes and negative values.
   ================================================== */

document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll(".table-number-input").forEach(function(input) {
    input.min = "0";

    input.addEventListener("wheel", function() {
      input.blur();
    });

    input.addEventListener("keydown", function(event) {
      if (
        event.key === "-" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
      }
    });

    input.addEventListener("input", function() {
      if (input.value !== "" && Number(input.value) < 0) {
        input.value = 0;
      }
    });
  });
});

/* ==================================================
STOP AND CHECK FUNCTIONS
   ================================================== */

function showStopAndCheckAnswer(button, additionalFunction = function() {}) {
  const stopAndCheck = button.closest(".stop-and-check");
  const answer = stopAndCheck.querySelector(".stop-and-check-answer");
  const section = button.closest(".section");
  const nextButton = section.querySelector(".next-button");

  answer.hidden = false;
  button.hidden = true;
  // nextButton.hidden = false;
  additionalFunction();
}

function resetStopAndCheck(stopAndCheck, additionalFunction = function() {}) {
  stopAndCheck.querySelector(".stop-and-check-answer").hidden = true;
  const button = stopAndCheck.querySelector(".stop-and-check-button");
  button.hidden = false;
  button.onclick = function() { showStopAndCheckAnswer(button, additionalFunction); }

  button.innerHTML = "";
  const content = document.createElement("p");
  content.innerHTML = "Check Your Answer";
  const bounceSymbol = document.createElement("p");
  bounceSymbol.innerHTML = "✅";

  bounceSymbol.classList.add("bounce-symbol");
  button.appendChild(content);
  button.appendChild(bounceSymbol);
  
  stopAndCheck.hidden = true;
}

/* ==================================================
   SHARED TEACHER NAVIGATION
   ================================================== */

let teacherNavigationSectionIds = [];
let teacherNavigationFirstSectionId = "";

let teacherClickCount = 0;
let teacherClickTimer = null;


/*
  Set up the hidden teacher menu for the current page.

  Each lesson supplies:
  1. The section IDs used on that page.
  2. The section that should remain open when the
     student view is reset.
*/
function initialiseTeacherMenu(
  sections,
  firstSectionId,
  backLink
) {
  const teacherTrigger =
    document.getElementById("teacherTrigger");

  const teacherModal =
    document.getElementById("teacherModal");

  const sectionList =
    document.querySelector(".teacher-section-list");

  if (!teacherTrigger || !teacherModal || !sectionList) {
    return;
  }

  // Accept either the old flat array of id strings or the
  // new array of { id, label } objects, so existing pages
  // that haven't been updated yet don't break.
  const normalisedSections = (Array.isArray(sections) ? sections : [])
    .map(function (section) {
      if (typeof section === "string") {
        return { id: section, label: section };
      }
      return section;
    });

  teacherNavigationSectionIds =
    normalisedSections.map(function (section) {
      return section.id;
    });

  teacherNavigationFirstSectionId =
    firstSectionId || teacherNavigationSectionIds[0] || "";

  // Build the jump buttons
  sectionList.innerHTML = "";

  normalisedSections.forEach(function (section, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = (index + 1) + ". " + section.label;

    button.addEventListener("click", function () {
      teacherJump(section.id);
    });

    sectionList.appendChild(button);
  });

  // Build the optional "back" link as its own distinct entry,
  // since it navigates rather than jumping within the page.
  if (backLink && backLink.href) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.textContent = backLink.label || "← Back";

    backButton.addEventListener("click", function () {
      window.location.href = backLink.href;
    });

    sectionList.appendChild(backButton);
  }

  teacherTrigger.addEventListener(
    "click",
    function() {
      teacherClickCount += 1;

      clearTimeout(teacherClickTimer);

      teacherClickTimer =
        window.setTimeout(
          function() {
            teacherClickCount = 0;
          },
          1800
        );

      if (teacherClickCount >= 5) {
        teacherClickCount = 0;

        clearTimeout(teacherClickTimer);

        openTeacherMenu();
      }
    }
  );

  teacherModal.addEventListener(
    "click",
    function(event) {
      if (event.target === teacherModal) {
        closeTeacherMenu();
      }
    }
  );

  document.addEventListener(
    "keydown",
    function(event) {
      if (event.key === "Escape") {
        closeTeacherMenu();
      }
    }
  );
}


/*
  Open the hidden teacher navigation menu.
*/
function openTeacherMenu() {
  const teacherModal =
    document.getElementById("teacherModal");

  if (teacherModal) {
    teacherModal.classList.add("open");
    growModalFromTrigger(teacherModal);
  }
}


/*
  Close the hidden teacher navigation menu.
*/
function closeTeacherMenu() {
  const teacherModal =
    document.getElementById("teacherModal");

  if (teacherModal) {
    teacherModal.classList.remove("open");
  }
}


/*
  Open and move to one lesson section without marking
  earlier activities as completed.
*/
function teacherJump(sectionId) {
  const section =
    document.getElementById(sectionId);

  if (!section) {
    return;
  }

  section.classList.remove("locked");
  section.hidden = false;

  closeTeacherMenu();

  window.setTimeout(
    function() {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    },
    100
  );
}


/*
  Reveal every section listed by the current lesson.
*/
function teacherShowAll() {
  teacherNavigationSectionIds.forEach(
    function(sectionId) {
      const section =
        document.getElementById(sectionId);

      if (section) {
        section.classList.remove("locked");
        section.hidden = false;
      }
    }
  );

  closeTeacherMenu();
}


/*
  Return the page to its original student-navigation state.

  This changes section visibility and completion markers,
  but does not remove student answers.
*/
/*
  Put a lesson page back to how a student finds it for
  the first time.

  Reloading is deliberate: activities are spread across
  many small widgets, and clearing them one by one has
  repeatedly missed some. A fresh load cannot miss any.
*/
function resetLessonPage() {
  if (typeof clearLessonProgress === "function") {
    clearLessonProgress();
  }

  /*
    Some pages keep their own saved progress. Without
    clearing that too, the reload would simply put every
    answer straight back.
  */
  if (typeof clearPageSavedData === "function") {
    clearPageSavedData();
  }

  window.location.reload();
}


function teacherResetView() {
  teacherNavigationSectionIds.forEach(
    function(sectionId) {
      const section =
        document.getElementById(sectionId);

      if (!section) {
        return;
      }

      section.classList.remove("completed");

      if (
        sectionId === teacherNavigationFirstSectionId
      ) {
        section.classList.remove("locked");
      } else {
        section.classList.add("locked");
      }
    }
  );

  closeTeacherMenu();

  /* Clear every answer on the page, not just the navigation. */
  resetLessonPage();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ==================================================
   SHARED VIDEO MODAL
   ================================================== */

function openVideoModal(videoSource, videoTitle) {
  const modal = document.getElementById("videoModal");
  const player = document.getElementById("videoModalPlayer");
  const title = document.getElementById("videoModalTitle");

  if (!modal || !player) {
    return;
  }

  player.src = videoSource;

  if (title) {
    title.textContent = videoTitle || "Video guide";
  }

  modal.style.display = "block";
  document.body.style.overflow = "hidden";

  growModalFromTrigger(modal);

  player.load();
}


function closeVideoModal() {
  const modal = document.getElementById("videoModal");
  const player = document.getElementById("videoModalPlayer");

  if (!modal || !player) {
    return;
  }

  player.pause();
  player.removeAttribute("src");
  player.load();

  modal.style.display = "none";
  document.body.style.overflow = "";
}

/* ==================================================
   SHARED PDF MODAL
   ================================================== */

function openPdfModal(pdfSource, pdfTitle) {
  const modal = document.getElementById("pdfModal");
  const frame = document.getElementById("pdfModalFrame");
  const image = document.getElementById("pdfModalImage");
  const title = document.getElementById("pdfModalTitle");
  const downloadLink = document.getElementById("pdfModalDownload");

  if (!modal || !frame || !image) {
    return;
  }

  // Images preview in an <img>; PDFs preview in the browser's own viewer.
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(pdfSource);

  if (isImage) {
    image.src = pdfSource;
    image.style.display = "block";

    frame.removeAttribute("src");
    frame.style.display = "none";
  } else {
    // Hide the built-in viewer chrome so students see only page 1 of the sheet.
    frame.src = pdfSource + "#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit";
    frame.style.display = "block";

    image.removeAttribute("src");
    image.style.display = "none";
  }

  if (title) {
    title.textContent = pdfTitle || "Reference sheet";
  }

  if (downloadLink) {
    downloadLink.href = pdfSource;
    downloadLink.setAttribute("download", "");
  }

  modal.style.display = "block";
  document.body.style.overflow = "hidden";

  growModalFromTrigger(modal);
}


function closePdfModal() {
  const modal = document.getElementById("pdfModal");
  const frame = document.getElementById("pdfModalFrame");
  const image = document.getElementById("pdfModalImage");

  if (!modal || !frame || !image) {
    return;
  }

  frame.removeAttribute("src");
  image.removeAttribute("src");

  modal.style.display = "none";
  document.body.style.overflow = "";
}


window.addEventListener("click", function(event) {
  const videoModal = document.getElementById("videoModal");
  const pdfModal = document.getElementById("pdfModal");

  if (videoModal && event.target === videoModal) {
    closeVideoModal();
  }

  if (pdfModal && event.target === pdfModal) {
    closePdfModal();
  }
});


document.addEventListener("keydown", function(event) {
  if (event.key === "Escape") {
    closeVideoModal();
    closePdfModal();
  }
});

/* ==================================================
   SHARED SAVE-AS-PDF FUNCTION
   ================================================== */

    /* ---------- Download completed lesson as PDF ---------- */

let sectionsLockedBeforePrint = [];

/*
  Put back any sections that were opened up just for
  printing.

  Safe to call at any time: it does nothing unless a
  print actually unlocked something.
*/
function restoreSectionsAfterPrint() {
  if (sectionsLockedBeforePrint.length === 0) {
    document.body.classList.remove('printing-lesson');
    return;
  }

  sectionsLockedBeforePrint.forEach(section => {
    section.classList.add('locked');
  });

  sectionsLockedBeforePrint = [];

  document.body.classList.remove('printing-lesson');
}


function downloadLessonPDF() {
  /*
    If a previous print never told us it had finished,
    tidy up before starting another one.
  */
  restoreSectionsAfterPrint();

  /*
    Make sure the most recent student answers are saved
    before opening the print window.
  */
  if (typeof saveCurrentPageData === "function") {
    saveCurrentPageData();
  }

  /*
    Remember which sections were still locked so that
    they can be restored after printing.
  */
  sectionsLockedBeforePrint = Array.from(
    document.querySelectorAll('.section.locked')
  );

  /*
    Temporarily show the entire lesson in the PDF.
  */
  sectionsLockedBeforePrint.forEach(section => {
    section.classList.remove('locked');
  });

  document.body.classList.add('printing-lesson');

  /*
    Give the browser a moment to redraw the newly
    revealed sections before opening Print.
  */
  setTimeout(function() {
    window.print();
  }, 300);
}

/*
  Restore the page to exactly how it looked before the
  student downloaded it.

  Two signals are used because "afterprint" does not
  arrive in every browser when the print dialog is
  cancelled - and a missed signal would leave the whole
  lesson unlocked.
*/
window.addEventListener('afterprint', restoreSectionsAfterPrint);

const lessonPrintMedia =
  typeof window.matchMedia === "function"
    ? window.matchMedia('print')
    : null;

if (lessonPrintMedia) {
  const handlePrintMediaChange = function (event) {
    if (!event.matches) {
      restoreSectionsAfterPrint();
    }
  };

  if (typeof lessonPrintMedia.addEventListener === "function") {
    lessonPrintMedia.addEventListener('change', handlePrintMediaChange);
  } else if (typeof lessonPrintMedia.addListener === "function") {
    /* Older browsers. */
    lessonPrintMedia.addListener(handlePrintMediaChange);
  }
}

function connectEnterAndBlurSave(input, saveFunction) {
  let isSubmitting = false;

  function saveInput() {
    if (
      isSubmitting ||
      !input.isConnected ||
      input.value.trim() === ""
    ) {
      return;
    }

    isSubmitting = true;
    saveFunction();

    if (input.isConnected) {
      isSubmitting = false;
    }
  }

  input.addEventListener("keydown", function(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    saveInput();
  });

  input.addEventListener("blur", saveInput);
}

/* ==================================================
   SHARED STUDENT-ANSWER HELPERS
   ================================================== */

/*
  Read and validate a student's text input.

  Returns:
  - the cleaned text when valid;
  - null when empty or blocked.
*/


/*
  Read the visible text from an answer that may also
  contain a delete button (see createDeleteAnswerButton).
*/
function getAnswerText(element) {
  if (!element) {
    return '';
  }

  const clone = element.cloneNode(true);

  clone.querySelectorAll('button').forEach(button => {
    button.remove();
  });

  return clone.textContent.trim();
}

/*
  Create the standard orange × button used beside
  submitted student answers.
*/
function createDeleteAnswerButton(
  ariaLabel,
  deleteFunction
) {
  const deleteButton =
    document.createElement("button");

  deleteButton.type = "button";
  deleteButton.className = "delete-answer";
  deleteButton.textContent = "×";

  deleteButton.setAttribute(
    "aria-label",
    ariaLabel
  );

  deleteButton.addEventListener(
    "click",
    deleteFunction
  );

  return deleteButton;
}

/*
  Apply a standard success or try-again message
  to an activity feedback box.
*/
function setActivityFeedback(
  feedbackElement,
  feedbackType,
  title,
  message
) {
  if (!feedbackElement) {
    return;
  }

  feedbackElement.className =
    "variable-feedback";

  if (feedbackType === "success") {
    feedbackElement.classList.add(
      "feedback-success"
    );
  }

  if (feedbackType === "try-again") {
    feedbackElement.classList.add(
      "feedback-try-again"
    );
  }

  feedbackElement.innerHTML = "";

  const titleElement =
    document.createElement("strong");

  titleElement.className =
    "ball-pair-feedback-title";

  titleElement.textContent = title;

  const messageElement =
    document.createElement("span");

  messageElement.className =
    "ball-pair-feedback-text";

  messageElement.innerHTML = message;

  feedbackElement.appendChild(
    titleElement
  );

  feedbackElement.appendChild(
    messageElement
  );
}

