/* ==================================================
   SELECT ITEMS
   A set of items the student picks from; the activity is complete once
   enough of them are selected. Covers a "tick every box to continue"
   checklist, and a "choose at least N" pick-list. Pair with activity-base.js.

   Markup contract:

     <div id="myChecklist" data-activity data-select-required="4">
       <label data-select-item>
         <input type="checkbox" />
         <span>Every bar starts at zero.</span>
       </label>

       <button type="button" data-select-item="owl">Owl</button>   <!-- no checkbox: the item itself toggles -->

       <button type="button" data-select-reveal hidden>Continue</button>
     </div>

   Usage:

     const activity = new SelectItemsActivity(document.getElementById("myChecklist"), {
       required: 4,            // optional, see below
       onChange: function(detail) { ... }
     });

   An item ([data-select-item]) is selected when the checkbox/radio inside it
   is checked, or - when it holds none - when it has been clicked (it then
   gets the "selected" class and aria-pressed="true"). The attribute value,
   if any, is the item's id (otherwise its position, as a string).

   The activity is data-activity-complete once AT LEAST the required number
   of items are selected. The required number comes from options.required,
   else the root's data-select-required, else every item.

   Anything marked [data-select-reveal] is hidden until the activity is
   complete (e.g. a "Continue" button), and hidden again if an item is
   un-selected. A section's Next button needs nothing extra: activity-sections.js
   shows it once this activity is complete.

   API (beyond the shared Activity API):
     activity.getSelected()        -> ["id", ...]
     activity.setSelected(ids)     -> restore a saved selection
     root event "select:change"    -> same as onChange
                                      (detail = { selected, count, required, complete })

   options.classes.selected overrides the class given to a clicked item that
   has no checkbox (default "selected"). A [data-reset-trigger] button inside
   the root - or calling reset() - clears every item.
   ================================================== */

import { Activity } from "./activity-base.js";

function SelectItemsActivity(root, options) {
  Activity.call(this, root, options);

  var self = this;
  this.selectedClass = (this.options.classes && this.options.classes.selected) || "selected";
  this.items = Array.prototype.slice.call(root.querySelectorAll("[data-select-item]"));
  this.revealTargets = Array.prototype.slice.call(root.querySelectorAll("[data-select-reveal]"));

  this.items.forEach(function (item) {
    var input = self._inputOf(item);
    if (input) {
      input.addEventListener("change", function () { self._changed(); });
    } else {
      item.setAttribute("aria-pressed", "false");
      item.addEventListener("click", function () {
        self._setItemSelected(item, !self._isSelected(item));
        self._changed();
      });
    }
  });

  this._update(false);
}

SelectItemsActivity.prototype = Object.create(Activity.prototype);
SelectItemsActivity.prototype.constructor = SelectItemsActivity;

/* ---------- public API ---------- */

SelectItemsActivity.prototype.getSelected = function () {
  var self = this;
  return this.items.filter(function (item) { return self._isSelected(item); })
    .map(function (item) { return self._idOf(item); });
};

SelectItemsActivity.prototype.setSelected = function (ids) {
  var self = this;
  this.items.forEach(function (item) {
    self._setItemSelected(item, ids.indexOf(self._idOf(item)) !== -1);
  });
  this._update(false);
};

SelectItemsActivity.prototype.getRequired = function () {
  /* Called by the base constructor (depends-on check) before this.items exists. */
  var total = this.items ? this.items.length : 0;
  var configured = this.options.required !== undefined ? this.options.required : this.root.dataset.selectRequired;
  var required = Number(configured);
  if (configured === undefined || configured === "all" || !(required > 0)) return total;
  return Math.min(required, total);
};

SelectItemsActivity.prototype.isComplete = function () {
  if (!this.items || !this.items.length) return false;
  return this.getSelected().length >= this.getRequired();
};

SelectItemsActivity.prototype.reset = function () {
  var self = this;
  this.items.forEach(function (item) { self._setItemSelected(item, false); });
  this._update(true);
};

/* ---------- internals ---------- */

SelectItemsActivity.prototype._inputOf = function (item) {
  return item.querySelector("input[type='checkbox'], input[type='radio']");
};

SelectItemsActivity.prototype._idOf = function (item) {
  return item.dataset.selectItem || String(this.items.indexOf(item));
};

SelectItemsActivity.prototype._isSelected = function (item) {
  var input = this._inputOf(item);
  return input ? input.checked : item.classList.contains(this.selectedClass);
};

SelectItemsActivity.prototype._setItemSelected = function (item, selected) {
  var input = this._inputOf(item);
  if (input) {
    input.checked = selected;
    return;
  }
  item.classList.toggle(this.selectedClass, selected);
  item.setAttribute("aria-pressed", selected ? "true" : "false");
};

SelectItemsActivity.prototype._changed = function () {
  this._update(true);
};

SelectItemsActivity.prototype._update = function (notify) {
  var complete = this.isComplete();

  this.revealTargets.forEach(function (target) { target.hidden = !complete; });

  if (notify) {
    var detail = {
      selected: this.getSelected(),
      count: this.getSelected().length,
      required: this.getRequired(),
      complete: complete
    };
    if (typeof this.options.onChange === "function") this.options.onChange(detail);
    this.root.dispatchEvent(new CustomEvent("select:change", { detail: detail, bubbles: true }));
  }

  this.setComplete(complete);
};


export { SelectItemsActivity };
