/* ==================================================
   GENERIC ITEM MATCH ACTIVITY
   Pair with styles/lesson5_styles/drag_and_drop.css (.item-match-* rules)
   and activity-base.js. The root needs the data-activity attribute; the
   activity is data-activity-complete once every round has been matched.

   Two modes, chosen by which options you pass in:

   ----- LEGACY MODE (options.items) -----
   One reference image at a time, fixed answer buttons that stay the same
   for the whole play-through (only the reference image/label changes).

     <div id="myActivity" data-activity>
       <div data-im-reference>
         <span data-im-round-label></span>
         <span data-im-item-label></span>
         <img data-im-image alt="" hidden>
         <div data-im-placeholder hidden>
           <span data-im-placeholder-text></span>
         </div>
       </div>
       <div data-im-options>
         <button data-im-option data-im-value="jug">...</button>
         <button data-im-option data-im-value="bottle">...</button>
       </div>
     </div>

     new ItemMatchActivity(root, {
       items: [
         { id: "jug", label: "Jug", image: "../images/jug.png", alt: "Jug" },
         { id: "bottle", label: "Bottle", image: "../images/bottle.png" }
       ],
       sequenceLength: 3,    // how many rounds to play; defaults to items.length
       randomise: true,      // true = a random subset in random order each play-through
       onChange, onComplete, onIncorrect
     });

   ----- SETS MODE (options.rounds) -----
   Each round supplies its own prompt AND its own set of options (so the
   choices on screen change every round, not just the prompt). A correct
   answer is also appended to a running "main diagram" element so solved
   rounds stay visible. Option/prompt content is raw HTML, so it can be an
   <img>, inline SVG, plain text, or anything else.

     <div id="myActivity" data-activity>
       <div data-im-diagram>
         <div data-im-diagram-placeholder>Nothing matched yet.</div>
         <!-- solved pieces are appended here automatically -->
       </div>
       <div data-im-row>
         <div data-im-prompt>
           <span data-im-round-label></span>
           <span data-im-item-label></span>
           <div data-im-prompt-content></div>
         </div>
         <div data-im-options></div>
       </div>
     </div>

     new ItemMatchActivity(root, {
       rounds: [
         {
           id: "jar-lid",
           label: "Jar lid",
           promptHtml: '<img src="jar-lid-photo.png" alt="Jar lid highlighted">',
           diagramHtml: '<img src="jar-lid-symbol.png" alt="Jar lid symbol">', // optional, defaults to the correct option's html
           options: [
             { id: "jar-lid", html: '<img src="jar-lid-symbol.png" alt="">', correct: true },
             { id: "jug", html: '<img src="jug-symbol.png" alt="">' },
             { id: "spoon", html: '<img src="spoon-symbol.png" alt="">' }
           ]
         },
         // ...one object per round, each with its own prompt + options
       ],
       shuffleOptions: true,   // shuffle each round's option order
       shuffleRounds: false,   // shuffle the order rounds are played in
       onChange, onComplete, onIncorrect
     });

   ----- SHARED API -----
     activity.getState()        -> { index, total, currentId, complete, roundIds }
     activity.isComplete()      -> every round has been matched correctly
     activity.check(itemId)     -> true/false; advances to the next round on a correct match
     activity.reset()           -> re-rolls (if randomised) and restarts from round 1
     activity.restore(state)    -> resume a saved { rounds: [ids], index } without re-rolling
     root event "im:change"     -> same as onChange (detail.state)
     root event "im:complete"   -> fired once, when the final round is matched

   Interaction: click/tap the option that matches the item currently shown. A
   correct match marks the button .correct and moves on after a short delay;
   an incorrect one flashes .incorrect and the round stays the same.
   ================================================== */

import { Activity } from "./activity-base.js";

const ADVANCE_DELAY = 450; /* ms before the next round replaces a correct match */
const INCORRECT_FLASH = 600; /* ms the .incorrect flash stays on a wrong click */

function shuffle(list) {
  var pool = list.slice();
  var result = [];
  while (pool.length) {
    var index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

/* Sets the hidden attribute and an inline display override together, so visibility
   doesn't depend on a page's own CSS never giving these elements a `display`. */
function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.style.display = hidden ? "none" : "";
}

function ItemMatchActivity(root, options) {
  Activity.call(this, root, options);

  this.mode = Array.isArray(this.options.rounds) ? "sets" : "legacy";
  this.index = 0;
  this.completed = false;

  if (this.mode === "sets") {
    this._initSetsMode();
  } else {
    this._initLegacyMode();
  }

  this.setComplete(this.isComplete());
}

ItemMatchActivity.prototype = Object.create(Activity.prototype);
ItemMatchActivity.prototype.constructor = ItemMatchActivity;

/* ---------- shared public API ---------- */

ItemMatchActivity.prototype.getState = function () {
  return {
    index: this.index,
    total: this.rounds.length,
    currentId: this.rounds[this.index] ? this.rounds[this.index].id : null,
    complete: this.isComplete(),
    roundIds: this.rounds.map(function (item) { return item.id; })
  };
};

ItemMatchActivity.prototype.isComplete = function () {
  /* Activity's constructor can call this (via the depends-on recheck) before this.rounds exists */
  if (!this.rounds) return false;
  return this.rounds.length > 0 && this.index >= this.rounds.length;
};

ItemMatchActivity.prototype.reset = function () {
  this.rounds = this._pickRounds();
  if (this.mode === "sets") this._shuffleCurrentOptions();
  this.index = 0;
  this.completed = false;
  this._render();
  this._changed();
};

/* Resumes a previously saved { rounds: [itemId...], index } instead of re-rolling. */
ItemMatchActivity.prototype.restore = function (state) {
  state = state || {};
  var self = this;
  var savedIds = Array.isArray(state.rounds) ? state.rounds : null;
  var resolved = savedIds && savedIds.length === this.sequenceLength
    ? savedIds.map(function (id) { return self._roundById(id); })
    : null;

  this.rounds = resolved && resolved.every(Boolean) ? resolved : this._pickRounds();
  if (this.mode === "sets") this._shuffleCurrentOptions();
  this.index = Math.min(Math.max(state.index || 0, 0), this.rounds.length);
  this.completed = this.isComplete();
  this._render();
  this._changed();
};

/* Checks itemId against the current round's answer and advances on a match. */
ItemMatchActivity.prototype.check = function (itemId) {
  if (this.isComplete()) return false;

  var correct = this._isCorrectAnswer(this.rounds[this.index], itemId);
  if (correct) {
    this.index += 1;
    this._render();
    this._changed();
    if (this.isComplete() && !this.completed) {
      this.completed = true;
      this._fireComplete();
    }
  }
  return correct;
};

/* ---------- internals shared by both modes ---------- */

ItemMatchActivity.prototype._roundById = function (id) {
  var rounds = this.mode === "sets" ? this._allRounds : this.items;
  for (var i = 0; i < rounds.length; i++) {
    if (rounds[i].id === id) return rounds[i];
  }
  return null;
};

ItemMatchActivity.prototype._isCorrectAnswer = function (round, itemId) {
  if (this.mode === "legacy") return round.id === itemId;

  var matched = round.options.filter(function (option) { return option.id === itemId; })[0];
  return Boolean(matched && matched.correct);
};

ItemMatchActivity.prototype._changed = function () {
  var state = this.getState();
  if (typeof this.options.onChange === "function") this.options.onChange(state);
  this.root.dispatchEvent(new CustomEvent("im:change", { detail: { state: state }, bubbles: true }));
  this.setComplete(this.isComplete());
};

ItemMatchActivity.prototype._fireComplete = function () {
  if (typeof this.options.onComplete === "function") this.options.onComplete();
  this.root.dispatchEvent(new CustomEvent("im:complete", { bubbles: true }));
};

ItemMatchActivity.prototype._render = function () {
  if (this.mode === "sets") this._renderSets();
  else this._renderLegacy();
};

/* ==================================================
   LEGACY MODE: fixed answer buttons, changing reference image
   ================================================== */

ItemMatchActivity.prototype._initLegacyMode = function () {
  this.items = this.options.items || [];
  this.randomise = Boolean(this.options.randomise);
  this.sequenceLength = this.options.sequenceLength || this.items.length;

  this.referenceImage = this.root.querySelector("[data-im-image]");
  this.placeholder = this.root.querySelector("[data-im-placeholder]");
  this.placeholderText = this.root.querySelector("[data-im-placeholder-text]");
  this.roundLabel = this.root.querySelector("[data-im-round-label]");
  this.itemLabel = this.root.querySelector("[data-im-item-label]");
  this.buttons = Array.prototype.slice.call(this.root.querySelectorAll("[data-im-option]"));

  var self = this;
  this.buttons.forEach(function (button) {
    button.addEventListener("click", function () { self._onLegacyOptionClick(button); });
  });

  /* Picks an initial round order and renders it, but doesn't fire onChange: the
     caller may immediately follow construction with restore() to resume saved
     progress instead, and that shouldn't race against a save of this throwaway pick. */
  this.rounds = this._pickRounds();
  this._render();
};

ItemMatchActivity.prototype._pickRounds = function () {
  if (this.mode === "sets") {
    var ordered = this._allRounds.slice();
    return this.options.shuffleRounds ? shuffle(ordered) : ordered;
  }

  var pool = this.items.slice();
  var length = Math.min(this.sequenceLength, pool.length);

  if (!this.randomise) return pool.slice(0, length);
  return shuffle(pool).slice(0, length);
};

ItemMatchActivity.prototype._onLegacyOptionClick = function (button) {
  if (this.isComplete()) return;

  if (this.check(button.dataset.imValue)) {
    button.classList.remove("incorrect");
    button.classList.add("correct");
    window.setTimeout(function () { button.classList.remove("correct"); }, ADVANCE_DELAY);
  } else {
    button.classList.remove("incorrect");
    void button.offsetWidth; /* restarts the shake animation on repeated wrong clicks */
    button.classList.add("incorrect");
    window.setTimeout(function () { button.classList.remove("incorrect"); }, INCORRECT_FLASH);
    if (typeof this.options.onIncorrect === "function") this.options.onIncorrect(button.dataset.imValue);
  }
};

ItemMatchActivity.prototype._renderLegacy = function () {
  var complete = this.isComplete();

  this.buttons.forEach(function (button) {
    button.classList.remove("correct", "incorrect");
    button.disabled = complete;
  });

  if (complete) {
    if (this.roundLabel) this.roundLabel.textContent = this.rounds.length + " of " + this.rounds.length + " · complete";
    if (this.itemLabel) this.itemLabel.textContent = this.options.completeLabel || "All matched";
    setHidden(this.referenceImage, true);
    if (this.placeholder) {
      setHidden(this.placeholder, false);
      if (this.placeholderText) this.placeholderText.textContent = this.options.completeMessage || "All items matched. Press CHECK to continue.";
    }
    return;
  }

  var round = this.rounds[this.index];
  var label = round.label || round.id;

  if (this.roundLabel) this.roundLabel.textContent = (this.index + 1) + " of " + this.rounds.length;
  if (this.itemLabel) this.itemLabel.textContent = label;

  var src = round.image || (typeof this.options.getImageSrc === "function" ? this.options.getImageSrc(round) : null);

  if (!this.referenceImage) return;

  if (!src) {
    setHidden(this.referenceImage, true);
    setHidden(this.placeholder, false);
    return;
  }

  var img = this.referenceImage;
  var placeholder = this.placeholder;
  var placeholderText = this.placeholderText;

  setHidden(img, true);
  img.alt = round.alt || label;

  img.onload = function () {
    setHidden(img, false);
    setHidden(placeholder, true);
  };
  img.onerror = function () {
    setHidden(img, true);
    if (placeholder) {
      setHidden(placeholder, false);
      if (placeholderText) placeholderText.textContent = "Unable to load image of " + label.toLowerCase();
    }
  };
  img.src = src;
};

/* ==================================================
   SETS MODE: each round brings its own prompt + its own options,
   solved rounds collect on a shared "main diagram" element.
   ================================================== */

ItemMatchActivity.prototype._initSetsMode = function () {
  this._allRounds = this.options.rounds || [];
  this.sequenceLength = this._allRounds.length;

  this.diagram = this.root.querySelector("[data-im-diagram]");
  this.diagramPlaceholder = this.root.querySelector("[data-im-diagram-placeholder]");
  this.roundLabel = this.root.querySelector("[data-im-round-label]");
  this.itemLabel = this.root.querySelector("[data-im-item-label]");
  this.promptContent = this.root.querySelector("[data-im-prompt-content]");
  this.optionsContainer = this.root.querySelector("[data-im-options]");

  var self = this;
  if (this.optionsContainer) {
    this.optionsContainer.addEventListener("click", function (event) {
      var button = event.target.closest("[data-im-option]");
      if (button) self._onSetsOptionClick(button);
    });
  }

  /* Mirrors legacy mode: picks a throwaway order now, restore() can replace it. */
  this.rounds = this._pickRounds();
  this._shuffleCurrentOptions();
  this._render();
};

/* Each round keeps its own working copy of options so re-rendering the
   same round never reshuffles the choices the student is looking at. */
ItemMatchActivity.prototype._shuffleCurrentOptions = function () {
  this.rounds.forEach(function (round) {
    round._options = this.options.shuffleOptions ? shuffle(round.options) : round.options.slice();
  }, this);
};

ItemMatchActivity.prototype._onSetsOptionClick = function (button) {
  if (this.isComplete() || button.disabled) return;

  var itemId = button.dataset.imValue;
  var self = this;

  if (this._isCorrectAnswer(this.rounds[this.index], itemId)) {
    /* The options row is rebuilt for the next round as soon as check()
       advances, so hold that back briefly - otherwise the "correct"
       flash never gets a chance to show. */
    Array.prototype.slice.call(this.optionsContainer.querySelectorAll("[data-im-option]")).forEach(function (other) {
      other.disabled = true;
    });
    button.classList.remove("incorrect");
    button.classList.add("correct");
    window.setTimeout(function () { self.check(itemId); }, ADVANCE_DELAY);
  } else {
    button.classList.remove("incorrect");
    void button.offsetWidth; /* restarts the shake animation on repeated wrong clicks */
    button.classList.add("incorrect");
    window.setTimeout(function () { button.classList.remove("incorrect"); }, INCORRECT_FLASH);
    if (typeof this.options.onIncorrect === "function") this.options.onIncorrect(itemId);
  }
};

ItemMatchActivity.prototype._renderSets = function () {
  this._renderDiagram();

  var complete = this.isComplete();
  
  if (complete) {
    if (this.roundLabel) this.roundLabel.textContent = this.rounds.length + " of " + this.rounds.length + " · complete";
    if (this.itemLabel) this.itemLabel.textContent = this.options.completeLabel || "All matched";
    if (this.promptContent) this.promptContent.innerHTML = "";
    if (this.optionsContainer) this.optionsContainer.innerHTML = "";
    return;
  }

  var round = this.rounds[this.index];
  var label = round.label || round.id;

  if (this.roundLabel) this.roundLabel.textContent = (this.index + 1) + " of " + this.rounds.length;
  if (this.itemLabel) this.itemLabel.textContent = label;
  if (this.promptContent) this.promptContent.innerHTML = round.promptHtml || "";

  if (!this.optionsContainer) return;

  this.optionsContainer.innerHTML = "";
  round._options.forEach(function (option) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "item-match-option";
    button.setAttribute("data-im-option", "");
    button.dataset.imValue = option.id;
    if (option.label) button.setAttribute("aria-label", option.label);
    button.innerHTML = option.html || "";
    this.optionsContainer.appendChild(button);
  }, this);
};

const SVG_NS = "http://www.w3.org/2000/svg";

/* Rebuilds the collected-pieces list from scratch each render: cheap at
   the handful of rounds these activities use, and avoids tracking which
   pieces are already in the DOM.

   If [data-im-diagram] is itself an <svg>, pieces are added as <g>
   elements positioned with a transform (round.diagramPosition = {x, y},
   or round.diagramTransform for anything a translate can't do - rotation,
   scale, etc). Otherwise pieces are plain, unpositioned <div>s stacked in
   flow, same as before. */
ItemMatchActivity.prototype._renderDiagram = function () {
  if (!this.diagram) return;

  Array.prototype.slice.call(this.diagram.querySelectorAll(".im-diagram-piece")).forEach(function (piece) {
    piece.remove();
  });

  var solved = this.rounds.slice(0, this.index);
  setHidden(this.diagramPlaceholder, solved.length > 0);

  var isSvgDiagram = this.diagram.namespaceURI === SVG_NS;

  solved.forEach(function (round) {
    var correctOption = round.options.filter(function (option) { return option.correct; })[0];
    var markup = round.diagramHtml || (correctOption && correctOption.html) || "";
    if (!markup) return;

    var piece = isSvgDiagram
      ? document.createElementNS(SVG_NS, "g")
      : document.createElement("div");

    piece.classList.add("im-diagram-piece");
    piece.dataset.imDiagramFor = round.id;

    if (isSvgDiagram) {
      var transform = round.diagramTransform
        || (round.diagramPosition ? "translate(" + round.diagramPosition.x + "," + round.diagramPosition.y + ")" : null);
      if (transform) piece.setAttribute("transform", transform);
    }

    /* Setting innerHTML on an <svg>/<g> parses the string as SVG content
       (foreign content), same as it would on an HTML element - so this
       works whether markup is "<svg>...</svg>", a plain <text>/<image>
       fragment, or just text. */
    piece.innerHTML = markup;
    this.diagram.appendChild(piece);
  }, this);
};


export { ItemMatchActivity };
