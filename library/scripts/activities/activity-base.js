/* ==================================================
   ACTIVITY BASE
   Shared by every activity prototype (drag-drop-activity.js,
   input-response-activity.js, item-match-activity.js, ...). Pair with
   activity-sections.js, which watches data-activity-complete
   to decide when a section's Next button appears.

   Markup contract:

     <div id="myActivity" data-activity
          data-activity-depends-on="otherActivityId">
       ...
       <button data-reset-trigger>Start over</button>
     </div>

   - data-activity marks the root of one activity.
   - data-activity-depends-on names another activity's id;
     this activity is unavailable (.activity-unavailable,
     [inert]) until that one reports isComplete() === true.
     Leave it out for an activity that's available from the
     start. While unavailable the whole root is hidden, unless
     it contains elements marked data-activity-hidden - then
     only those are hidden (and shown again once available) and
     the rest of the root stays visible.
   - data-activity-complete="true"/"false" is stamped on the
     root by setComplete() and is what a section watches.
   - [data-reset-trigger] buttons inside the root are wired
     automatically to call reset(). A data-reset-trigger button
     outside every activity resets all the activities (that have
     an id) inside its nearest .section instead; give it a CSS
     selector as the attribute value to reset a different area.

   Subclasses call Activity.call(this, root, options) first,
   finish their own setup, then call this.setComplete(...) once
   they can compute it. They call this.setComplete(...) again
   any time completeness changes.
   ================================================== */

var registry = {};

function Activity(root, options) {
  if (!root) throw new Error("Activity: root element is required.");
  if (!root.hasAttribute("data-activity")) {
    console.warn("Activity: root is missing the data-activity attribute.", root);
  }

  this.root = root;
  this.options = options || {};
  this.id = root.id || null;

  if (this.id) registry[this.id] = this;

  this._bindResetButtons();
  this._initAvailability();
}

/* ---------- availability ---------- */

Activity.prototype._initAvailability = function () {
  var self = this;
  var dependsOn = this.root.dataset.activityDependsOn;

  if (!dependsOn) {
    this.setAvailable(true);
    return;
  }

  function recheck() {
    var dependency = registry[dependsOn];
    var available = Boolean(dependency && dependency.isComplete());

    self.setAvailable(available);

    // Reset the dependent activity when its prerequisite is reset
    if (!available && self.isComplete()) {
      self.reset();
    }
  }

  document.addEventListener("activity:change", recheck);
  recheck();
};

Activity.prototype.setAvailable = function (isAvailable) {
  const hideTargets = this.root.querySelectorAll("[data-activity-hidden]");

  /* With [data-activity-hidden] elements, only those are hidden: the root
     itself is left alone (no .activity-unavailable dimming, no [inert]), so
     the rest of it stays visible and usable. */
  if (hideTargets.length) {
    if (this.root.hasAttribute("data-activity-depends-on")) {
      Array.prototype.forEach.call(hideTargets, function (element) { element.hidden = !isAvailable; });
    }
    return;
  }

  this.root.classList.toggle("activity-unavailable", !isAvailable);
  this.root.toggleAttribute("inert", !isAvailable);

  if (this.root.hasAttribute("data-activity-depends-on")) {
      this.root.hidden = !isAvailable;
  }
};

Activity.prototype.isAvailable = function () {
  var hideTargets = this.root.querySelectorAll("[data-activity-hidden]");
  if (hideTargets.length) return !hideTargets[0].hidden;
  return !this.root.classList.contains("activity-unavailable");
};

/* ---------- completion ---------- */

Activity.prototype.setComplete = function (isComplete) {
  this.root.dataset.activityComplete = isComplete ? "true" : "false";

  var detail = { id: this.id, complete: Boolean(isComplete) };
  this.root.dispatchEvent(new CustomEvent("activity:change", { bubbles: true, detail: detail }));
  document.dispatchEvent(new CustomEvent("activity:change", { detail: detail }));
};

Activity.prototype.isComplete = function () {
  return this.root.dataset.activityComplete === "true";
};

/* ---------- reset ---------- */

Activity.prototype._bindResetButtons = function () {
  var self = this;
  Array.prototype.forEach.call(this.root.querySelectorAll("[data-reset-trigger]"), function (button) {
    button.addEventListener("click", function () { self.reset(); });
  });
};

/* Default reset: clear every [data-reset] element inside the root (see
   resetField below), then mark the activity incomplete. Prototypes whose
   own API already has a natural "put everything back" operation (e.g.
   DragDropActivity returning items to the tray) override this instead. */
Activity.prototype.reset = function () {
  Activity.resetFieldsIn(this.root);
  this.setComplete(false);
};

/* Every registered activity (those with a root id), e.g. for saving progress. */
Activity.all = function () {
  return Object.keys(registry).map(function (id) { return registry[id]; });
};

Activity.resetFieldsIn = function (scope) {
  Array.prototype.forEach.call(scope.querySelectorAll("[data-reset]"), Activity.resetField);
};

/* How a single data-reset element is cleared, based on what kind of
   element it is. Add data-reset-list to a container whose entire content
   an activity builds up (an answer list) to have it emptied outright. */
Activity.resetField = function (element) {
  if (element.matches("input, textarea")) {
    element.value = "";
    element.hidden = false;
    element.disabled = false;
    element.style.display = "";
    return;
  }

  if (element.hasAttribute("data-reset-list")) {
    element.innerHTML = "";
    return;
  }

  element.classList.remove("filled", "placed", "visible", "selected", "correct", "incorrect");
};

/* A [data-reset-trigger] button that sits OUTSIDE every activity (e.g. one
   "Reset" button under a whole section) resets every activity inside the
   nearest .section - or, if the button names a selector in its
   data-reset-trigger value, every activity inside the first match of that
   selector. Activities need an id to be found. Dependent activities
   (data-activity-depends-on) also reset themselves when their prerequisite
   does, so the order doesn't matter. */
document.addEventListener("DOMContentLoaded", function () {
  Array.prototype.forEach.call(document.querySelectorAll("[data-reset-trigger]"), function (button) {
    if (button.closest("[data-activity]")) return; /* owned by its own activity */

    button.addEventListener("click", function () {
      var scope = (button.dataset.resetTrigger && document.querySelector(button.dataset.resetTrigger)) ||
        button.closest(".section") ||
        document;

      Array.prototype.forEach.call(scope.querySelectorAll("[data-activity]"), function (element) {
        var activity = registry[element.id];
        if (activity) activity.reset();
      });
    });
  });
});


export { Activity };
