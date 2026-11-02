/* ==================================================
   INVESTIGATION (TESTABLE) QUESTION BUILDER
   Pick a question structure ("If I change the ___, what happens to the
   ___?"), then fill in its two blanks from a list of variables, to build
   one testable question. Pair with activity-base.js.

   Markup contract:

     <div id="myQuestion" data-activity>
       <div>
         <button type="button" data-question-structure="what" aria-pressed="false">
           When I change the ______, what happens to the ______?
         </button>
         <button type="button" data-question-structure="how" aria-pressed="false">...</button>
         <button type="button" data-question-structure="does" aria-pressed="false">...</button>
         <button type="button" data-question-structure="if" aria-pressed="false">...</button>
       </div>

       <div data-question-builder aria-live="polite">
         <p class="question-builder-placeholder">Select a question structure above to begin.</p>
       </div>
     </div>

   Usage:

     const activity = new InvestigationQuestionActivity(root, {
       variableOptions: ["ball size", "ball material", "drop height", ...],
       onChange: function(state) { ... }   // see getState() below
       // templates: {...}  // optional - see DEFAULT_TEMPLATES for the shape
     });

   options.variableOptions is the list of words/phrases offered in each
   blank's dropdown - always page-specific (different lessons study
   different variables), so there's no default: pass it in.

   options.inputType: "text" makes each blank a free-text field (saved on
   Enter or blur, checked by the classroom language filter) instead of a
   dropdown; variableOptions is then not needed. options.textInputClass
   sets that field's class (default "question-blank-input").

   options.templates optionally overrides the four built-in question
   structures (what/how/does/if). Each entry is:
     { parts: [before-first-blank, between-blanks, after-second-blank],
       firstPlaceholder, secondPlaceholder }

   API (beyond the shared Activity API - isComplete/reset/...):
     activity.getState() -> { structure, firstAnswer, secondAnswer, text }
       text is the fully-written question once both blanks are filled,
       else "".
     root event "question:change" -> same as onChange (detail = state)

   The activity is data-activity-complete once a structure is chosen and
   both blanks are filled in.
   ================================================== */

import { Activity } from "./activity-base.js";

var DEFAULT_TEMPLATES = {
  what: {
    parts: ["When I change the ", ", what happens to the ", "?"],
    firstPlaceholder: "What will you change?",
    secondPlaceholder: "What will you measure?"
  },
  how: {
    parts: ["How does changing the ", " affect the ", "?"],
    firstPlaceholder: "What will you change?",
    secondPlaceholder: "What will you measure?"
  },
  does: {
    parts: ["Does changing the ", " affect the ", "?"],
    firstPlaceholder: "What will you change?",
    secondPlaceholder: "What will you measure?"
  },
  if: {
    parts: ["If I change the ", ", what happens to the ", "?"],
    firstPlaceholder: "What will you change?",
    secondPlaceholder: "What will you measure?"
  }
};

function InvestigationQuestionActivity(root, options) {
  Activity.call(this, root, options);

  this.templates = this.options.templates || DEFAULT_TEMPLATES;
  this.variableOptions = this.options.variableOptions || [];

  this.structureButtons = root.querySelectorAll("[data-question-structure]");
  this.builder = root.querySelector("[data-question-builder]");
  this.completedElement = null;

  this.state = { structure: "", firstAnswer: "", secondAnswer: "" };

  var self = this;
  Array.prototype.forEach.call(this.structureButtons, function (button) {
    button.addEventListener("click", function () {
      self._selectStructure(button.dataset.questionStructure);
    });
  });

  this._renderPlaceholder();
  this.setComplete(false);
}

InvestigationQuestionActivity.prototype = Object.create(Activity.prototype);
InvestigationQuestionActivity.prototype.constructor = InvestigationQuestionActivity;

/* ---------- public API ---------- */

InvestigationQuestionActivity.prototype.getState = function () {
  return {
    structure: this.state.structure,
    firstAnswer: this.state.firstAnswer,
    secondAnswer: this.state.secondAnswer,
    text: this._getCompletedText()
  };
};

InvestigationQuestionActivity.prototype.reset = function () {
  this.state = { structure: "", firstAnswer: "", secondAnswer: "" };

  Array.prototype.forEach.call(this.structureButtons, function (button) {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });

  this._renderPlaceholder();
  this._notify();
  this.setComplete(false);
};

/* ---------- rendering ---------- */

InvestigationQuestionActivity.prototype._renderPlaceholder = function () {
  if (!this.builder) return;
  this.completedElement = null;
  this.builder.classList.remove("builder-active");
  this.builder.innerHTML = '<p class="question-builder-placeholder">Select a question structure above to begin.</p>';
};

InvestigationQuestionActivity.prototype._selectStructure = function (structureName) {
  var template = this.templates[structureName];
  if (!template || !this.builder) return;

  this.state = { structure: structureName, firstAnswer: "", secondAnswer: "" };

  Array.prototype.forEach.call(this.structureButtons, function (button) {
    var isSelected = button.dataset.questionStructure === structureName;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  this.builder.classList.add("builder-active");
  this.builder.innerHTML = "";

  var sentence = document.createElement("div");
  sentence.className = "question-builder-sentence";
  sentence.appendChild(document.createTextNode(template.parts[0]));
  sentence.appendChild(this._createBlank("firstAnswer", template.firstPlaceholder));
  sentence.appendChild(document.createTextNode(template.parts[1]));
  sentence.appendChild(this._createBlank("secondAnswer", template.secondPlaceholder));
  sentence.appendChild(document.createTextNode(template.parts[2]));

  this.completedElement = document.createElement("div");
  this.completedElement.className = "completed-investigation-question";
  this.completedElement.hidden = true;

  this.builder.appendChild(sentence);
  this.builder.appendChild(this.completedElement);

  this._notify();
  this.setComplete(false);
};

InvestigationQuestionActivity.prototype._createBlank = function (fieldName, placeholderText) {
  var self = this;

  var wrapper = document.createElement("span");
  wrapper.className = "question-blank";

  var inputRow = document.createElement("span");
  inputRow.className = "question-blank-input-row";

  var isText = this.options.inputType === "text";
  var input;

  if (isText) {
    input = document.createElement("input");
    input.type = "text";
    input.maxLength = 50;
    input.placeholder = placeholderText;
    input.className = this.options.textInputClass || "question-blank-input";
  } else {
    input = document.createElement("select");
    input.className = "question-blank-input";

    var placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholderText;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    input.appendChild(placeholderOption);

    this.variableOptions.forEach(function (answer) {
      var option = document.createElement("option");
      option.value = answer;
      option.textContent = answer;
      input.appendChild(option);
    });
  }

  input.name = fieldName;
  input.setAttribute("aria-label", placeholderText);

  var answerBox = document.createElement("span");
  answerBox.className = "question-blank-answer";

  inputRow.appendChild(input);
  wrapper.appendChild(inputRow);
  wrapper.appendChild(answerBox);

  function saveAnswer() {
    var value = isText ? getValidStudentInput(input) : input.value;
    if (value === null || value === "") return;

    self.state[fieldName] = value;

    answerBox.innerHTML = "";

    var answerText = document.createElement("span");
    answerText.className = "question-blank-answer-text";
    answerText.textContent = value;

    var deleteButton = createDeleteAnswerButton("Edit " + value, function () {
      self.state[fieldName] = "";
      answerBox.classList.remove("visible");
      answerBox.innerHTML = "";
      inputRow.style.display = isText ? "inline-block" : "block";
      input.value = "";
      input.focus();

      self._renderCompleted();
      self._notify();
      self.setComplete(self._isComplete());
    });

    answerBox.appendChild(answerText);
    answerBox.appendChild(deleteButton);

    inputRow.style.display = "none";
    answerBox.classList.add("visible");
    input.value = "";

    self._renderCompleted();
    self._notify();
    self.setComplete(self._isComplete());
  }

  if (isText) {
    /* Enter or clicking away saves the answer */
    connectEnterAndBlurSave(input, saveAnswer);
  } else {
    input.addEventListener("change", function () {
      if (input.value === "") return;
      saveAnswer();
    });
  }

  return wrapper;
};

InvestigationQuestionActivity.prototype._renderCompleted = function () {
  if (!this.completedElement) return;

  var text = this._getCompletedText();

  if (!text) {
    this.completedElement.hidden = true;
    this.completedElement.textContent = "";
    return;
  }

  this.completedElement.textContent = text;
  this.completedElement.hidden = false;
};

/* ---------- internals ---------- */

InvestigationQuestionActivity.prototype._isComplete = function () {
  return Boolean(this.state.structure && this.state.firstAnswer && this.state.secondAnswer);
};

InvestigationQuestionActivity.prototype._getCompletedText = function () {
  var template = this.templates[this.state.structure];
  if (!template || !this.state.firstAnswer || !this.state.secondAnswer) return "";

  return template.parts[0] + this.state.firstAnswer + template.parts[1] + this.state.secondAnswer + template.parts[2];
};

InvestigationQuestionActivity.prototype._notify = function () {
  var state = this.getState();
  if (typeof this.options.onChange === "function") this.options.onChange(state);
  this.root.dispatchEvent(new CustomEvent("question:change", { detail: state, bubbles: true }));
};


export { InvestigationQuestionActivity };
