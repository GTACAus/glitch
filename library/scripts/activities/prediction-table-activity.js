/* ==================================================
   REASONED PREDICTION TABLE
   A graphic-organiser activity: pick a cause/effect relationship between
   a testable question's two variables, then write a reason, to build one
   full "reasoned prediction" sentence. Pair with activity-base.js and
   styles/reasoned_prediction_builder.css.

   Markup contract:

     <div id="myPrediction" data-activity>
       <div data-prediction-change class="generated-text placeholder">...</div>
       <!-- or <select data-prediction-change>...</select> for a standalone
            activity that isn't fed by an outside testable-question builder -->
       <div data-prediction-measure class="generated-text placeholder">...</div>

       <select data-prediction-cause-type>
         <option value="">Choose a relationship type</option>
         <option value="increase-decrease">Increase / decrease</option>
         <option value="with-without">With / without</option>
         <option value="condition-comparison">Condition 1 versus condition 2</option>
       </select>
       <div data-prediction-cause-buttons></div>             <!-- filled in by the activity -->
       <div data-prediction-condition-inputs>                 <!-- shown only for condition-comparison -->
         <input data-prediction-condition-one placeholder="Starting condition, e.g. blue">
         <input data-prediction-condition-two placeholder="New condition, e.g. red">
       </div>

       <div>
         <button type="button" data-prediction-effect="increase">Increase</button>
         <button type="button" data-prediction-effect="decrease">Decrease</button>
         <button type="button" data-prediction-effect="stay-the-same">Stay the same</button>
       </div>

       <div data-prediction-cause-text class="generated-text placeholder">...</div>
       <div data-prediction-effect-text class="generated-text placeholder">...</div>

       <div data-prediction-reason-row>
         <input data-prediction-reason-input placeholder="Explain why...">
       </div>
       <div data-prediction-reason-answer></div>

       <div data-prediction-full-text class="generated-text final-prediction placeholder">...</div>
     </div>

   Usage:

     const activity = new PredictionTableActivity(document.getElementById("myPrediction"));

     // Call this whenever an outside "design a testable question" builder
     // changes structure/change/measure. Not needed when data-prediction-change
     // and data-prediction-measure are <select> elements of their own -
     // those drive the activity directly.
     activity.setContext({ structure: "if", change: "the ramp angle", measure: "distance travelled" });

   data-prediction-change/-measure elements that aren't <select>s take their
   placeholder text from a data-placeholder attribute, falling back to
   "The thing I am changing" / "The thing I am measuring".

   The activity is data-activity-complete once a full prediction sentence
   and a reason have both been written. A [data-reset-trigger] button
   inside the root clears everything back to its starting placeholders.
   ================================================== */

import { Activity } from "./activity-base.js";

var DEFAULT_CAUSE_OPTIONS = {
  "increase-decrease": [
    { value: "increase", label: "Increase" },
    { value: "decrease", label: "Decrease" }
  ],
  "with-without": [
    { value: "with", label: "With" },
    { value: "without", label: "Without" }
  ],
  "condition-comparison": [
    { value: "condition-one-to-two", label: "Condition 1" },
    { value: "condition-two-to-one", label: "Condition 2" }
  ]
};

var EFFECT_PHRASES = {
  increase: "increase",
  decrease: "decrease",
  "stay-the-same": "stay the same"
};

function PredictionTableActivity(root, options) {
  Activity.call(this, root, options);

  this.causeOptions = this.options.causeOptions || DEFAULT_CAUSE_OPTIONS;

  this.els = {
    change: root.querySelector("[data-prediction-change]"),
    measure: root.querySelector("[data-prediction-measure]"),
    causeType: root.querySelector("[data-prediction-cause-type]"),
    causeButtons: root.querySelector("[data-prediction-cause-buttons]"),
    conditionInputs: root.querySelector("[data-prediction-condition-inputs]"),
    conditionOne: root.querySelector("[data-prediction-condition-one]"),
    conditionTwo: root.querySelector("[data-prediction-condition-two]"),
    effectButtons: root.querySelectorAll("[data-prediction-effect]"),
    causeText: root.querySelector("[data-prediction-cause-text]"),
    effectText: root.querySelector("[data-prediction-effect-text]"),
    reasonRow: root.querySelector("[data-prediction-reason-row]"),
    reasonInput: root.querySelector("[data-prediction-reason-input]"),
    reasonAnswer: root.querySelector("[data-prediction-reason-answer]"),
    fullText: root.querySelector("[data-prediction-full-text]")
  };

  this.usesDropdowns = Boolean(this.els.change) && this.els.change.tagName === "SELECT";

  this.context = { structure: this.usesDropdowns ? "if" : "", change: "", measure: "" };
  this.selectedCause = "";
  this.selectedEffect = "";
  this.reason = "";

  this._bind();
  this._renderCauseButtons();
}

PredictionTableActivity.prototype = Object.create(Activity.prototype);
PredictionTableActivity.prototype.constructor = PredictionTableActivity;

/* ---------- public API ---------- */

/* Call whenever an outside "design a testable question" builder changes
   structure/change/measure. */
PredictionTableActivity.prototype.setContext = function (context) {
  context = context || {};
  this.context.structure = context.structure || "if";

  if (!this.usesDropdowns) {
    this.context.change = context.change || "";
    this.context.measure = context.measure || "";
    this._setVariableText(this.els.change, this.context.change);
    this._setVariableText(this.els.measure, this.context.measure);
  }

  this._render();
};

PredictionTableActivity.prototype.reset = function () {
  this.reason = "";
  this.selectedCause = "";
  this.selectedEffect = "";

  if (this.els.reasonInput) this.els.reasonInput.value = "";
  if (this.els.reasonRow) this.els.reasonRow.style.display = "block";
  if (this.els.reasonAnswer) {
    this.els.reasonAnswer.classList.remove("visible");
    this.els.reasonAnswer.innerHTML = "";
  }

  this.context.structure = this.usesDropdowns ? "if" : "";
  this.context.change = "";
  this.context.measure = "";

  if (this.usesDropdowns) {
    this.els.change.selectedIndex = 0;
    this.els.measure.selectedIndex = 0;
  } else {
    this._setVariableText(this.els.change, "");
    this._setVariableText(this.els.measure, "");
  }

  if (this.els.causeType) this.els.causeType.selectedIndex = 0;
  if (this.els.conditionOne) this.els.conditionOne.value = "";
  if (this.els.conditionTwo) this.els.conditionTwo.value = "";
  if (this.els.conditionInputs) this.els.conditionInputs.classList.remove("visible");

  Array.prototype.forEach.call(this.els.effectButtons, function (button) {
    button.classList.remove("selected");
  });

  this._renderCauseButtons();
};

/* ---------- wiring ---------- */

PredictionTableActivity.prototype._bind = function () {
  var self = this;

  if (this.usesDropdowns) {
    this.els.change.addEventListener("change", function () { self._render(); });
    this.els.measure.addEventListener("change", function () { self._render(); });
  }

  if (this.els.causeType) {
    this.els.causeType.addEventListener("change", function () { self._renderCauseButtons(); });
  }

  if (this.els.conditionOne) this.els.conditionOne.addEventListener("input", function () { self._render(); });
  if (this.els.conditionTwo) this.els.conditionTwo.addEventListener("input", function () { self._render(); });

  Array.prototype.forEach.call(this.els.effectButtons, function (button) {
    button.addEventListener("click", function () { self._selectEffect(button); });
  });

  if (this.els.reasonInput) {
    connectEnterAndBlurSave(this.els.reasonInput, function () { self._submitReason(); });
  }
};

/* ---------- rendering ---------- */

PredictionTableActivity.prototype._setVariableText = function (element, value) {
  if (!element) return;
  setGeneratedText(element, value, element.dataset.placeholder || "The thing I am changing");
};

PredictionTableActivity.prototype._renderCauseButtons = function () {
  var self = this;

  if (this.els.causeType && this.els.causeButtons) {
    var relationshipType = this.els.causeType.value;
    var choices = this.causeOptions[relationshipType] || [];

    this.selectedCause = "";
    this.els.causeButtons.innerHTML = "";

    choices.forEach(function (choice) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "relationship-option";
      button.textContent = choice.label;

      button.addEventListener("click", function () {
        self.selectedCause = choice.value;
        Array.prototype.forEach.call(self.els.causeButtons.querySelectorAll(".relationship-option"), function (other) {
          other.classList.remove("selected");
        });
        button.classList.add("selected");
        self._render();
      });

      self.els.causeButtons.appendChild(button);
    });

    if (this.els.conditionInputs) {
      this.els.conditionInputs.classList.toggle("visible", relationshipType === "condition-comparison");
    }
  }

  this._render();
};

PredictionTableActivity.prototype._selectEffect = function (button) {
  this.selectedEffect = button.dataset.predictionEffect;
  Array.prototype.forEach.call(this.els.effectButtons, function (other) { other.classList.remove("selected"); });
  button.classList.add("selected");
  this._render();
};

PredictionTableActivity.prototype._submitReason = function () {
  if (!this.els.reasonInput || !this.els.reasonAnswer) return;

  var value = getValidStudentInput(this.els.reasonInput);
  if (value === null) return;

  this.reason = value;
  this.els.reasonAnswer.innerHTML = "";

  var text = document.createElement("span");
  text.textContent = value;

  var self = this;
  var deleteButton = createDeleteAnswerButton("Edit your reason", function () {
    self.reason = "";
    self.els.reasonAnswer.classList.remove("visible");
    self.els.reasonAnswer.innerHTML = "";
    if (self.els.reasonRow) self.els.reasonRow.style.display = "block";
    self.els.reasonInput.value = value;
    self.els.reasonInput.focus();
    self._render();
  });

  this.els.reasonAnswer.appendChild(text);
  this.els.reasonAnswer.appendChild(deleteButton);
  this.els.reasonAnswer.classList.add("visible");
  if (this.els.reasonRow) this.els.reasonRow.style.display = "none";
  this.els.reasonInput.value = "";

  this._render();
};

PredictionTableActivity.prototype._render = function () {
  var change = this.usesDropdowns ? (this.els.change.value || "") : this.context.change;
  var measure = this.usesDropdowns ? (this.els.measure.value || "") : this.context.measure;

  this.context.change = change;
  this.context.measure = measure;

  var prediction = this._buildPredictionPhrases(change, measure);

  if (this.els.causeText) setGeneratedText(this.els.causeText, prediction.cause, "Choose a cause relationship.");
  if (this.els.effectText) setGeneratedText(this.els.effectText, prediction.effect, "Choose an effect or result.");

  var fullPrediction = "";
  if (prediction.cause !== "" && prediction.effect !== "") {
    var separator = (this.context.structure === "how" || this.context.structure === "does") ? " " : ", ";
    fullPrediction = prediction.cause + separator + prediction.effect + ".";
  }

  var complete = fullPrediction !== "" && this.reason !== "";
  if (complete) fullPrediction += " This is because " + this.reason + ".";

  if (this.els.fullText) {
    setGeneratedText(this.els.fullText, fullPrediction, "Complete the organiser to build your reasoned prediction.");
  }

  this.setComplete(complete);
};

PredictionTableActivity.prototype._buildPredictionPhrases = function (change, measure) {
  var structure = this.context.structure;
  var causeAction = this._getCauseActionPhrase(change);
  var effectAction = EFFECT_PHRASES[this.selectedEffect] || "";

  if (!structure || !measure || !causeAction || !effectAction) {
    return { cause: "", effect: "" };
  }

  switch (structure) {
    /* When I change the _____, what happens to the _____? */
    case "what":
      return {
        cause: "When I " + causeAction.verb,
        effect: measure + " will " + effectAction
      };

    /* How does changing the _____ affect the _____? */
    case "how":
    case "does":
      return {
        cause: causeAction.gerund.charAt(0).toUpperCase() + causeAction.gerund.slice(1),
        effect: "will cause " + measure + " to " + effectAction
      };

    /* If I change the _____, what happens to the _____? */
    case "if":
      return {
        cause: "If I " + causeAction.verb,
        effect: "then " + measure + " will " + effectAction
      };

    default:
      return { cause: "", effect: "" };
  }
};

PredictionTableActivity.prototype._getCauseActionPhrase = function (change) {
  if (!change || !this.selectedCause) return null;

  var conditionOne = this.els.conditionOne ? getSafeStudentPreviewValue(this.els.conditionOne) : "";
  var conditionTwo = this.els.conditionTwo ? getSafeStudentPreviewValue(this.els.conditionTwo) : "";

  switch (this.selectedCause) {
    case "increase":
      return { verb: "increase " + change, gerund: "increasing " + change };

    case "decrease":
      return { verb: "decrease " + change, gerund: "decreasing " + change };

    case "with":
      return {
        verb: "conduct the experiment with " + change,
        gerund: "conducting the experiment with " + change
      };

    case "without":
      return {
        verb: "conduct the experiment without " + change,
        gerund: "conducting the experiment without " + change
      };

    case "condition-one-to-two":
      return {
        verb: "change " + change + " from " + (conditionOne || "condition 1") + " to " + (conditionTwo || "condition 2"),
        gerund: "changing " + change + " from " + (conditionOne || "condition 1") + " to " + (conditionTwo || "condition 2")
      };

    case "condition-two-to-one":
      return {
        verb: "change " + change + " from " + (conditionTwo || "condition 2") + " to " + (conditionOne || "condition 1"),
        gerund: "changing " + change + " from " + (conditionTwo || "condition 2") + " to " + (conditionOne || "condition 1")
      };

    default:
      return null;
  }
};


export { PredictionTableActivity };
