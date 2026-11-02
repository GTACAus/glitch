/* ==================================================
   VARIABLE SORT
   Pick a role (independent / dependent / controlled), then classify
   tiles into it - either against a fixed answer key, or against an
   open set of valid variables for each role. Pair with activity-base.js.

   Markup contract:

     <div id="myActivity" data-activity>
       <div aria-label="Choose a variable type">
         <button type="button" data-sort-mode="independent" aria-pressed="false">
           <span>Independent Variable</span><span>Change</span>
         </button>
         <button type="button" data-sort-mode="dependent" aria-pressed="false">...</button>
         <button type="button" data-sort-mode="controlled" aria-pressed="false">...</button>
       </div>

       <div>
         <button type="button" data-sort-tile="ball-size"><span>Ball size</span></button>
         <button type="button" data-sort-tile="bounce-height"><span>Bounce height</span></button>
         ...
       </div>

       <div data-sort-feedback class="variable-feedback" role="status" aria-live="polite"></div>
       <button data-reset-trigger>Reset</button>
     </div>

   Usage - exactly one of answers/options is required:

     // Fixed: there's exactly one right classification.
     new VariableSortActivity(root, {
       answers: { independent: "bounce-surface", dependent: "bounce-height",
                  controlled: ["ball-size", "ball-material", "drop-height", "ball-squashiness"] }
     });

     // Open: several tiles would be valid in each role - any classification
     // that respects these sets counts (controlled can't be chosen until
     // independent and dependent are both done).
     new VariableSortActivity(root, {
       options: { independent: ["ball-size", "ball-material", ...],
                  dependent: ["bounce-height", "number-of-bounces", ...],
                  controlled: ["ball-size", "ball-material", ...] }
     });

   Optional: options.defaultMessage, options.prompts ({independent, dependent,
   controlled} shown in the feedback box while that mode is active), and
   options.messages (override any of the built-in feedback strings - see
   DEFAULT_MESSAGES below for every key).

   A tile can only be classified once; independent and dependent can each
   only be chosen once (their mode button disables itself after), while
   controlled stays available until every controlled tile is done. The
   activity is data-activity-complete once every tile has a role.
   ================================================== */

import { Activity } from "./activity-base.js";

var DEFAULT_PROMPTS = {
  independent: "Choose the variable that is changed.",
  dependent: "Choose the variable that is measured.",
  controlled: "Choose all the variables that must be kept the same."
};

var DEFAULT_MESSAGES = {
  defaultMessage: "Choose a variable type, then select the matching variable.",
  chooseModeFirst: "Choose Independent Variable, Dependent Variable or Controlled Variable first.",

  independentWrongType: "That is a measurable outcome. Choose a variable that you can change.",
  independentWrong: "Try again. Which variable is changed in the question?",
  independentSuccess: "Independent variable selected.",

  dependentWrongType: "That is a variable you can change or keep the same. Choose a measurable result instead.",
  dependentWrong: "Try again. Which result is observed or measured?",
  dependentSuccess: "Dependent variable selected.",

  controlledNeedsBoth: "Choose one independent variable and one dependent variable before selecting the controlled variables.",
  controlledWrongType: "That is a measurable outcome, not a variable that needs to be kept the same.",
  controlledWrong: "Try again. That variable is not controlled in this investigation.",
  controlledMore: "Controlled variable selected. Choose any other variables that must be kept the same.",
  controlledDone: "All controlled variables have been selected.",

  allDone: "You identified the independent, dependent and controlled variables."
};

function VariableSortActivity(root, options) {
  Activity.call(this, root, options);

  this.answers = this.options.answers || null;
  this.openOptions = this.options.options || null;
  this.isFixed = Boolean(this.answers);

  this.prompts = this.options.prompts || DEFAULT_PROMPTS;
  this.messages = Object.assign({}, DEFAULT_MESSAGES, this.options.messages || {});

  this.modeButtons = root.querySelectorAll("[data-sort-mode]");
  this.tiles = root.querySelectorAll("[data-sort-tile]");
  this.feedback = root.querySelector("[data-sort-feedback]");

  this.selectedMode = "";
  this.independentComplete = false;
  this.dependentComplete = false;

  var self = this;

  Array.prototype.forEach.call(this.modeButtons, function (button) {
    button.addEventListener("click", function () { self._setMode(button.dataset.sortMode); });
  });

  Array.prototype.forEach.call(this.tiles, function (tile) {
    tile.addEventListener("click", function () { self._selectTile(tile); });
    tile.addEventListener("animationend", function () { tile.classList.remove("buzz"); });
  });

  this._showMessage(this.messages.defaultMessage);
  this.setComplete(false);
}

VariableSortActivity.prototype = Object.create(Activity.prototype);
VariableSortActivity.prototype.constructor = VariableSortActivity;

/* ---------- public API ---------- */

VariableSortActivity.prototype.reset = function () {
  this.selectedMode = "";
  this.independentComplete = false;
  this.dependentComplete = false;

  Array.prototype.forEach.call(this.modeButtons, function (button) {
    button.disabled = false;
    button.classList.remove("mode-active", "mode-complete");
    button.setAttribute("aria-pressed", "false");
  });

  Array.prototype.forEach.call(this.tiles, function (tile) {
    tile.disabled = false;
    tile.classList.remove("is-independent", "is-dependent", "is-controlled", "is-classified", "buzz");

    var typeText = tile.querySelector(".variable-tile-type");
    if (typeText) typeText.remove();
  });

  this._showMessage(this.messages.defaultMessage);
  this.setComplete(false);
};

/* ---------- mode selection ---------- */

VariableSortActivity.prototype._setMode = function (mode) {
  this.selectedMode = mode;

  Array.prototype.forEach.call(this.modeButtons, function (button) {
    var isActive = button.dataset.sortMode === mode;
    button.classList.toggle("mode-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (!this.feedback) return;
  this.feedback.className = "variable-feedback";
  this.feedback.innerHTML = this.prompts[mode] || this.messages.defaultMessage;
};

/* ---------- tile classification ---------- */

VariableSortActivity.prototype._selectTile = function (tile) {
  var variableName = tile.dataset.sortTile;
  var mode = this.selectedMode;

  if (tile.classList.contains("is-classified")) return;

  if (mode === "") {
    this._buzz(tile, this.messages.chooseModeFirst);
    return;
  }

  if (mode === "independent") this._selectIndependent(tile, variableName);
  else if (mode === "dependent") this._selectDependent(tile, variableName);
  else if (mode === "controlled") this._selectControlled(tile, variableName);
};

VariableSortActivity.prototype._selectIndependent = function (tile, variableName) {
  if (!this.isFixed && this.openOptions.independent.indexOf(variableName) === -1) {
    this._buzz(tile, this.messages.independentWrongType);
    return;
  }

  if (this.isFixed && variableName !== this.answers.independent) {
    this._buzz(tile, this.messages.independentWrong);
    return;
  }

  this._classify(tile, "independent", "Independent variable");
  this.independentComplete = true;
  this._finishMode("independent");
  this._showMessage(this.messages.independentSuccess, "feedback-success");
  this._checkComplete();
};

VariableSortActivity.prototype._selectDependent = function (tile, variableName) {
  if (!this.isFixed && this.openOptions.dependent.indexOf(variableName) === -1) {
    this._buzz(tile, this.messages.dependentWrongType);
    return;
  }

  if (this.isFixed && variableName !== this.answers.dependent) {
    this._buzz(tile, this.messages.dependentWrong);
    return;
  }

  this._classify(tile, "dependent", "Dependent variable");
  this.dependentComplete = true;
  this._finishMode("dependent");
  this._showMessage(this.messages.dependentSuccess, "feedback-success");
  this._checkComplete();
};

VariableSortActivity.prototype._selectControlled = function (tile, variableName) {
  if (!this.isFixed && (!this.independentComplete || !this.dependentComplete)) {
    this._buzz(tile, this.messages.controlledNeedsBoth);
    return;
  }

  if (!this.isFixed && this.openOptions.controlled.indexOf(variableName) === -1) {
    this._buzz(tile, this.messages.controlledWrongType);
    return;
  }

  if (this.isFixed && this.answers.controlled.indexOf(variableName) === -1) {
    this._buzz(tile, this.messages.controlledWrong);
    return;
  }

  this._classify(tile, "controlled", "Controlled variable");

  var controlledButton = this.root.querySelector('[data-sort-mode="controlled"]');
  if (controlledButton) controlledButton.classList.add("mode-complete");

  var self = this;
  var controlledDone = this.isFixed
    ? this.answers.controlled.every(function (name) { return self._tileFor(name) && self._tileFor(name).classList.contains("is-controlled"); })
    : this.openOptions.controlled.every(function (name) {
        var tile = self._tileFor(name);
        return tile && (tile.classList.contains("is-independent") || tile.classList.contains("is-controlled"));
      });

  if (controlledDone) {
    if (controlledButton) {
      controlledButton.classList.remove("mode-active");
      controlledButton.setAttribute("aria-pressed", "false");
      controlledButton.disabled = true;
    }
    this.selectedMode = "";
    this._showMessage(this.messages.controlledDone, "feedback-success");
  } else {
    this._showMessage(this.messages.controlledMore, "feedback-success");
  }

  this._checkComplete();
};

/* ---------- shared helpers ---------- */

VariableSortActivity.prototype._tileFor = function (variableName) {
  return this.root.querySelector('[data-sort-tile="' + variableName + '"]');
};

VariableSortActivity.prototype._classify = function (tile, role, label) {
  tile.classList.add("is-" + role, "is-classified");
  tile.disabled = true;

  var typeText = document.createElement("span");
  typeText.className = "variable-tile-type";
  typeText.textContent = "(" + label + ")";
  tile.appendChild(typeText);
};

VariableSortActivity.prototype._finishMode = function (mode) {
  this.selectedMode = "";

  var modeButton = this.root.querySelector('[data-sort-mode="' + mode + '"]');
  if (!modeButton) return;

  modeButton.classList.remove("mode-active");
  modeButton.classList.add("mode-complete");
  modeButton.setAttribute("aria-pressed", "false");

  /* Independent and dependent can only be chosen once; controlled stays
     available because several tiles need to be classified into it. */
  if (mode === "independent" || mode === "dependent") modeButton.disabled = true;
};

VariableSortActivity.prototype._buzz = function (tile, message) {
  tile.classList.remove("buzz");
  void tile.offsetWidth; /* restarts the shake animation on repeated wrong clicks */
  tile.classList.add("buzz");
  this._showMessage(message, "feedback-try-again");
};

VariableSortActivity.prototype._showMessage = function (message, variant) {
  if (!this.feedback) return;
  this.feedback.className = variant ? "variable-feedback " + variant : "variable-feedback";
  this.feedback.innerHTML = message;
};

VariableSortActivity.prototype._checkComplete = function () {
  var self = this;

  var complete = this.isFixed
    ? [this.answers.independent, this.answers.dependent].concat(this.answers.controlled).every(function (name) {
        var tile = self._tileFor(name);
        return tile && tile.classList.contains("is-classified");
      })
    : this.root.querySelectorAll("[data-sort-tile].is-classified").length === this.tiles.length;

  if (!complete) return;

  this.selectedMode = "";

  Array.prototype.forEach.call(this.modeButtons, function (button) {
    button.classList.remove("mode-active");
    button.setAttribute("aria-pressed", "false");
    button.disabled = true;
  });

  /* Disable any tiles that were never classified (fixed mode can leave some unused). */
  Array.prototype.forEach.call(this.tiles, function (tile) { tile.disabled = true; });

  this._showMessage(this.messages.allDone, "feedback-success");
  this.setComplete(true);
};


export { VariableSortActivity };
