/* ==================================================
   INPUT RESPONSE ACTIVITY
   Covers "type an answer, press Add/Enter, see it appear
   as a removable answer" for any kind of input - used for
   See/Think/Wonder, sticky-note brainstorms, short written
   answers, and numeric data-table cells. Pair with
   activity-base.js.

   Markup contract (one or more groups per activity; a
   group is anything that holds its own input + list):

     <div id="myActivity" data-activity data-tr-min-total="4">
       <div data-tr-group data-tr-key="see" data-tr-min="1">
         <input data-tr-input type="text" placeholder="...">
         <button data-tr-add>Add</button>      <!-- optional: Enter/blur always works -->
         <ul data-tr-list></ul>                 <!-- <ul>/<ol> -> <li>, anything else -> <div> -->
       </div>
       <div data-tr-group data-tr-key="think" data-tr-min="1">...</div>
     </div>

   How an answer is read depends on the input's type attribute:
     - type="text" / <textarea>   checked by the classroom language filter
                                   (getValidStudentInput), so an answer can't
                                   be saved until the filter has loaded.
     - type="number"               must be a finite number; anything else is
                                   refused and the input keeps focus.
     - any other type              trimmed, must not be empty.

   Checking answers:
     data-answer="12" on a group (or on its input) marks the right answer.
     A saved answer is then flagged with .ir-correct or .ir-incorrect - style
     those however the lesson needs. Several accepted answers can be listed
     with "|" ("cat|kitten"). Numbers compare numerically (so "5.0" matches
     "5"); text compares ignoring case and surrounding spaces. A group with
     no data-answer is never marked either way.

   Completeness:
     - data-tr-min-total="N" on the root: complete once the
       combined answer count across every group reaches N
       (e.g. "at least 4 of these 8 sticky notes").
     - otherwise, each group needs its own data-tr-min
       answers (default 0, meaning that group has no
       requirement). If no group sets a minimum, the
       activity is always complete (nothing to gate on).
     - if any group has a data-answer, every such group must
       ALSO hold a correct answer before the activity is complete.
     - data-tr-max="1" on a group caps it at one answer and
       hides the input once that's reached - the pattern a
       single sticky note, short-answer box or table cell uses.

   Usage:
     const activity = new InputResponseActivity(root, {
       onChange: function (answers) { ... }   // same as the "ir:change" event
     });

   API:
     activity.getAnswers()        -> { groupKey: [answers...] }
     activity.getAnswer(groupKey) -> first answer in that group, or null
     activity.restore(answersMap) -> re-populate from getAnswers() shape
     activity.isCorrect()         -> every group with a data-answer holds a correct answer
     root event "ir:change"       -> fired whenever an answer is added, deleted, restored or reset
                                     (detail.answers)
   ================================================== */

import { Activity } from "./activity-base.js";

function InputResponseActivity(root, options) {
  Activity.call(this, root, options);

  var self = this;

  InputResponseActivity.instances.push(this);

  this.groups = Array.prototype.map.call(root.querySelectorAll("[data-tr-group]"), function (group) {
    var list = group.querySelector("[data-tr-list]");
    var input = group.querySelector("[data-tr-input]");
    return {
      element: group,
      key: group.dataset.trKey || (list && list.id) || null,
      input: input,
      list: list,
      addButton: group.querySelector("[data-tr-add]"),
      min: parseInt(group.dataset.trMin || "0", 10),
      max: group.dataset.trMax ? parseInt(group.dataset.trMax, 10) : Infinity,
      answer: group.dataset.answer || (input && input.dataset.answer) || null
    };
  });

  this.minTotal = parseInt(root.dataset.trMinTotal || "0", 10);

  this.groups.forEach(function (group) {
    if (group.addButton) {
      group.addButton.addEventListener("click", function () { self._addAnswer(group); });
    }
    if (group.input) {
      connectEnterAndBlurSave(group.input, function () { self._addAnswer(group); });
    }
    self._renderGroup(group);
  });

  this._refresh();
}

/* lets lesson_progress.js find every activity on the page to save/restore its answers */
InputResponseActivity.instances = [];

InputResponseActivity.prototype = Object.create(Activity.prototype);
InputResponseActivity.prototype.constructor = InputResponseActivity;

/* ---------- public API ---------- */

InputResponseActivity.prototype.getAnswers = function () {
  var result = {};
  this.groups.forEach(function (group) {
    if (!group.key || !group.list) return;
    result[group.key] = Array.prototype.map.call(group.list.children, getAnswerText);
  });
  return result;
};

InputResponseActivity.prototype.getAnswer = function (key) {
  var answers = this.getAnswers()[key];
  return answers && answers.length ? answers[0] : null;
};

InputResponseActivity.prototype.restore = function (savedAnswers) {
  savedAnswers = savedAnswers || {};
  var self = this;
  this.groups.forEach(function (group) {
    if (group.list) group.list.innerHTML = "";
    var answers = (group.key && savedAnswers[group.key]) || [];
    answers.forEach(function (answer) { self._appendAnswer(group, answer, true); });
    self._renderGroup(group);
  });
  this._refresh();
  this._emitChange();
};

InputResponseActivity.prototype.reset = function () {
  var self = this;
  this.groups.forEach(function (group) {
    if (group.list) group.list.innerHTML = "";
    if (group.input) group.input.value = "";
    self._renderGroup(group);
  });
  this.setComplete(false);
  this._emitChange();
};

InputResponseActivity.prototype.isCorrect = function () {
  var self = this;
  return this.groups.every(function (group) {
    if (!group.answer) return true;
    var answer = self.getAnswer(group.key);
    return answer !== null && self._matches(group, answer);
  });
};

/* ---------- internals ---------- */

InputResponseActivity.prototype._answerCount = function (group) {
  return group.list ? group.list.children.length : 0;
};

/* Reads and validates the group's input according to its type.
   Returns the answer text, or null when nothing should be saved. */
InputResponseActivity.prototype._readInput = function (group) {
  var input = group.input;
  var type = input.tagName === "TEXTAREA" ? "textarea" : (input.type || "text").toLowerCase();

  if (type === "text" || type === "textarea") return getValidStudentInput(input);

  var value = input.value.trim();
  if (value === "") return null;

  if (type === "number" && !isFinite(Number(value))) {
    input.focus();
    return null;
  }

  return value;
};

InputResponseActivity.prototype._matches = function (group, answer) {
  if (!group.answer) return false;

  var isNumber = group.input && group.input.type === "number";
  var given = String(answer).trim();

  return group.answer.split("|").some(function (accepted) {
    accepted = accepted.trim();
    if (isNumber) return given !== "" && Number(given) === Number(accepted);
    return given.toLowerCase() === accepted.toLowerCase();
  });
};

InputResponseActivity.prototype._addAnswer = function (group) {
  if (!group.input || this._answerCount(group) >= group.max) return;

  var answer = this._readInput(group);
  if (answer === null) return;

  this._appendAnswer(group, answer);
  group.input.value = "";
};

InputResponseActivity.prototype._appendAnswer = function (group, answer, quiet) {
  if (!group.list) return;

  var isOrderedList = group.list.tagName === "UL" || group.list.tagName === "OL";
  var row = document.createElement(isOrderedList ? "li" : "div");
  row.classList.add("ir-answer");

  if (group.answer) {
    row.classList.add(this._matches(group, answer) ? "ir-correct" : "ir-incorrect");
  }

  var text = document.createElement("span");
  text.textContent = answer;

  var self = this;
  var deleteButton = createDeleteAnswerButton("Delete this answer", function () {
    row.remove();
    self._renderGroup(group);
    self._refresh();
    self._emitChange();
    if (group.input) group.input.focus();
  });

  row.appendChild(text);
  row.appendChild(deleteButton);
  group.list.appendChild(row);

  this._renderGroup(group);
  if (quiet) return; /* restore() refreshes and announces once at the end */

  this._refresh();
  this._emitChange();
};

InputResponseActivity.prototype._renderGroup = function (group) {
  var atMax = this._answerCount(group) >= group.max;

  if (group.input) {
    /* display only - never the hidden attribute, which belongs to
       data-activity-hidden / the page and must not be un-hidden here */
    group.input.style.display = atMax ? "none" : "";
  }
  if (group.addButton) group.addButton.hidden = atMax;

  /* A <ul>/<ol> list manages its own display; anything else (e.g. a
     single-slot "sticky note" div) is shown only once it has an answer,
     the pattern .postit-answer .brainstorm-answer's CSS relies on. */
  if (group.list && group.list.tagName !== "UL" && group.list.tagName !== "OL") {
    group.list.style.display = this._answerCount(group) > 0 ? "flex" : "none";
  }
};

InputResponseActivity.prototype._emitChange = function () {
  var answers = this.getAnswers();
  if (typeof this.options.onChange === "function") this.options.onChange(answers);
  this.root.dispatchEvent(new CustomEvent("ir:change", { detail: { answers: answers }, bubbles: true }));
};

InputResponseActivity.prototype._refresh = function () {
  this.setComplete(this._isComplete());
};

InputResponseActivity.prototype._isComplete = function () {
  var self = this;

  var enough;
  if (this.minTotal > 0) {
    var total = this.groups.reduce(function (sum, group) { return sum + self._answerCount(group); }, 0);
    enough = total >= this.minTotal;
  } else {
    var anyMinSet = this.groups.some(function (group) { return group.min > 0; });
    enough = !anyMinSet || this.groups.every(function (group) {
      return group.min === 0 || self._answerCount(group) >= group.min;
    });
  }

  return enough && this.isCorrect();
};


export { InputResponseActivity };
