/* ==================================================
   GENERIC DRAG AND DROP ACTIVITY
   Pair with styles/lesson5_styles/drag_and_drop.css and
   activity-base.js.

   Markup contract (everything is found by data attribute, so the layout
   around it is entirely up to the page):

     <div id="myActivity" data-activity>
       <div data-dd-slot="slot-a" data-dd-answer="beaker"></div>   <!-- drop target; data-dd-answer is optional -->
       <div data-dd-slot="slot-b" data-dd-answer="flask jug"></div> <!-- space-separated: any one of these items -->
       <div data-dd-slot="slot-c"></div>
       <div data-dd-tray data-dd-tray-heading="Word Bank">          <!-- where unplaced items live; heading is optional -->
         <div data-dd-item="beaker">...any content...</div>
         <div data-dd-item="flask">...any content...</div>
         <div data-dd-item="water" data-dd-reusable>water</div>     <!-- see data-dd-reusable below -->
       </div>
       <button data-reset-trigger>Start over</button>
     </div>

   Usage:

     const activity = new DragDropActivity(document.getElementById("myActivity"), {
       strictSlots: true,                       // optional, see below
       onChange: function(placements) { ... },  // placements = { slotId: itemId }
       onIncorrect: function(itemId, slotId) { ... }   // only fires with strictSlots
     });

   API (beyond the shared Activity API - isComplete/setAvailable/reset/...):
     activity.getPlacements()      -> { slotId: itemId }
     activity.setPlacements(map)   -> restore a saved layout
     activity.isCorrect()          -> every slot with a data-dd-answer holds one of its listed items
     root event "dd:change"        -> same as onChange (detail.placements)
     root event "dd:incorrect"     -> same as onIncorrect (detail.itemId, detail.slotId)

   The activity marks itself data-activity-complete once every slot is
   filled AND (when any slot has data-dd-answer) every answer is correct.

   data-dd-answer is a space-separated list of item ids, any one of which
   the slot accepts - a single id behaves exactly as before ("this slot
   wants exactly this item"); several ids means "any one of these items
   belongs here". Slots that share the exact same multi-value answer form a
   permutation group: the same item can't correctly fill two of them at
   once, so "sunlight water oxygen" on three slots means each of those three
   words is used exactly once across the three, in any order.

   data-dd-reusable on a tray item means that item is never "used up": dropping
   it on a slot leaves it sitting in the tray and places a clone into the slot
   instead, so the same word/value can fill more than one slot at once. Only
   meaningful on an item still in the tray - dragging the clone back out just
   removes that clone (the source is already in the tray, nothing to return).

   options.strictSlots: when true, dropping an item on a slot whose
   data-dd-answer doesn't include it sends the item straight back to the
   tray instead of letting it sit there wrong (the slot also gets a brief
   .dd-rejected class for a reject animation). Slots with no data-dd-answer
   always accept any item. Default false: any item may sit in any slot, and
   isCorrect()/completion are the only thing that reflects right vs wrong -
   the original behaviour, unchanged for every activity that doesn't opt in.

   Interaction: drag with mouse/touch/pen (pointer events), or click/tap an
   item then click/tap a slot, or use the keyboard (Enter/Space to pick up
   an item and again on a slot to drop it, Delete/Backspace to send a placed
   item back to the tray). Dropping on an occupied slot swaps the items;
   dropping anywhere else returns the item to the tray.
   ================================================== */

import { Activity } from "./activity-base.js";

const DRAG_THRESHOLD = 5; /* px of movement before a press becomes a drag */

function DragDropActivity(root, options) {
  Activity.call(this, root, options);

  this.tray = root.querySelector("[data-dd-tray]");
  const trayHeading = this.tray && this.tray.getAttribute("data-dd-tray-heading");
  if (trayHeading) {
    const heading = document.createElement("p");
    heading.className = "dd-tray-heading";
    heading.textContent = trayHeading;
    this.tray.insertBefore(heading, this.tray.firstChild);
  }

  this.slots = Array.prototype.slice.call(root.querySelectorAll("[data-dd-slot]"));
  this.items = {};
  this.selectedItem = null;
  this.drag = null;

  /* lets lesson_progress.js find every activity on the page to save/restore its placements */
  DragDropActivity.instances.push(this);

  var self = this;

  Array.prototype.forEach.call(root.querySelectorAll("[data-dd-item]"), function (item) {
    self.items[item.dataset.ddItem] = item;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-pressed", "false");
    item.addEventListener("pointerdown", function (event) { self._onPointerDown(event, item); });
    item.addEventListener("keydown", function (event) { self._onItemKey(event, item); });
    item.addEventListener("dragstart", function (event) { event.preventDefault(); }); /* native image/text drag would cancel the pointer drag */
  });

  this.slots.forEach(function (slot) {
    slot.tabIndex = 0;
    slot.addEventListener("click", function () { self._onSlotActivate(slot); });
    slot.addEventListener("keydown", function (event) {
      if (event.target !== slot) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        self._onSlotActivate(slot);
      }
    });
  });

  /* remember each slot's original content so it can be restored when emptied */
  this.placeholders = new Map();
  this.slots.forEach(function (slot) {
    var nodes = Array.prototype.filter.call(slot.childNodes, function (node) {
      return !(node.nodeType === 1 && node.hasAttribute("data-dd-item"));
    });
    if (nodes.some(function (node) { return node.nodeType === 1 || node.textContent.trim(); })) {
      self.placeholders.set(slot, { nodes: nodes, hidden: false });
    }
  });
  this._refreshFilled();

  this.setComplete(this.isComplete() && this.isCorrect());
}

DragDropActivity.instances = [];

DragDropActivity.prototype = Object.create(Activity.prototype);
DragDropActivity.prototype.constructor = DragDropActivity;

/* ---------- public API ---------- */

DragDropActivity.prototype.getPlacements = function () {
  let result = {};
  this.slots.forEach(function (slot) {
    const item = slot.querySelector("[data-dd-item]");
    if (item) result[slot.dataset.ddSlot] = item.dataset.ddItem;
  });
  return result;
};

DragDropActivity.prototype.setPlacements = function (placements) {
  var self = this;
  this._returnAllToTray();
  Object.keys(placements || {}).forEach(function (slotId) {
    var slot = self._slotById(slotId);
    var item = self.items[placements[slotId]];
    if (slot && item && !self._itemIn(slot)) self._applyPlacement(item, slot);
  });
  this._refreshFilled();
  this._clearSelection();
  this.setComplete(this.isComplete() && this.isCorrect());
};

/* Returns every item to the tray - the natural "start over" for this
   activity, so it's what the shared [data-reset-trigger] button runs. */
DragDropActivity.prototype.reset = function () {
  this._returnAllToTray();
  this._clearSelection();
  this._changed();
};

DragDropActivity.prototype.isComplete = function () {
  /* Activity's constructor can call this (via the depends-on recheck) before this.slots exists */
  if (!this.slots) return false;
  var self = this;
  return this.slots.every(function (slot) { return Boolean(self._itemIn(slot)); });
};

DragDropActivity.prototype.isCorrect = function () {
  if (!this.slots) return false;
  var self = this;
  return this.slots.every(function (slot) {
    if (!slot.dataset.ddAnswer) return true;
    var item = self._itemIn(slot);
    return Boolean(item) && self._slotAccepts(slot, item.dataset.ddItem) && !self._isDuplicateInGroup(slot, item);
  });
};

/* ---------- internals ---------- */

DragDropActivity.prototype._slotById = function (id) {
  return this.slots.filter(function (slot) { return slot.dataset.ddSlot === id; })[0] || null;
};

DragDropActivity.prototype._itemIn = function (slot) {
  return slot.querySelector("[data-dd-item]");
};

DragDropActivity.prototype._slotOf = function (item) {
  var parent = item.parentElement;
  return parent && parent.hasAttribute("data-dd-slot") ? parent : null;
};

DragDropActivity.prototype._put = function (item, slot) {
  // let style = item.style;
  // style = "";
  // style.color = "inherit";
  (slot || this.tray).appendChild(item);
  item.classList.toggle("dd-placed", Boolean(slot));
  this._refreshFilled();
};

/* Slots may carry their own content (e.g. "Drop label"). That content is
   swapped out while the slot holds an item and put back once it's empty. */
DragDropActivity.prototype._refreshFilled = function () {
  var self = this;
  this.slots.forEach(function (slot) {
    var filled = Boolean(slot.querySelector("[data-dd-item]"));
    slot.classList.toggle("dd-filled", filled);

    var placeholder = self.placeholders.get(slot);
    if (!placeholder) return;
    if (filled && !placeholder.hidden) {
      placeholder.nodes.forEach(function (node) { if (node.parentNode === slot) slot.removeChild(node); });
      placeholder.hidden = true;
    } else if (!filled && placeholder.hidden) {
      placeholder.nodes.forEach(function (node) { slot.appendChild(node); });
      placeholder.hidden = false;
    }
  });
};

DragDropActivity.prototype._returnAllToTray = function () {
  var self = this;
  Object.keys(this.items).forEach(function (id) { self._put(self.items[id], null); });
  Array.prototype.forEach.call(this.root.querySelectorAll(".dd-clone"), function (clone) { clone.remove(); });
  this._refreshFilled();
};

DragDropActivity.prototype._isClone = function (item) {
  return item.classList.contains("dd-clone");
};

/* A tray item marked data-dd-reusable is never consumed: placing it spawns
   a clone for the slot instead of moving the original out of the tray. */
DragDropActivity.prototype._isReusableSource = function (item) {
  return item.hasAttribute("data-dd-reusable") && !this._isClone(item);
};

DragDropActivity.prototype._spawnClone = function (sourceItem) {
  var clone = sourceItem.cloneNode(true);
  clone.classList.add("dd-clone");
  clone.removeAttribute("data-dd-reusable");
  clone.tabIndex = 0;
  clone.setAttribute("role", "button");
  clone.setAttribute("aria-pressed", "false");

  var self = this;
  clone.addEventListener("pointerdown", function (event) { self._onPointerDown(event, clone); });
  clone.addEventListener("keydown", function (event) { self._onItemKey(event, clone); });
  clone.addEventListener("dragstart", function (event) { event.preventDefault(); });

  return clone;
};

/* Empties a slot the way appropriate to whatever is currently in it: a
   clone is simply discarded (its source is already in the tray), a
   regular item is returned to the tray. */
DragDropActivity.prototype._vacate = function (slot) {
  var occupant = this._itemIn(slot);
  if (!occupant) return;
  if (this._isClone(occupant)) {
    occupant.remove();
  } else {
    occupant.classList.remove("dd-placed");
    this.tray.appendChild(occupant);
  }
};

/* The DOM move itself, with no rejection check and no change event - used
   both by interactive placement and by the quiet bulk restore in
   setPlacements(). */
DragDropActivity.prototype._applyPlacement = function (item, slot) {
  if (this._isReusableSource(item)) {
    this._vacate(slot);
    var clone = this._spawnClone(item);
    slot.appendChild(clone);
    clone.classList.add("dd-placed");
    return;
  }

  if (this._isClone(item)) {
    this._vacate(slot);
    slot.appendChild(item);
    item.classList.add("dd-placed");
    return;
  }

  this._put(item, slot);
};

/* Place item in slot (null = tray). An occupied target swaps with the item's old slot, or sends the occupant to the tray. */
DragDropActivity.prototype._place = function (item, slot) {
  if (slot && this._rejects(slot, item)) {
    this._onReject(item, slot);
    return;
  }

  if (this._isReusableSource(item)) {
    if (!slot) return; /* already "in the tray" - nothing to do */
    this._applyPlacement(item, slot);
    this._refreshFilled();
    this._changed();
    return;
  }

  if (this._isClone(item)) {
    var itsSlot = this._slotOf(item);
    if (slot === itsSlot) return;
    if (!slot) {
      item.remove(); /* the source is already in the tray; discard this instance */
    } else {
      this._applyPlacement(item, slot);
    }
    this._refreshFilled();
    this._changed();
    return;
  }

  var previousSlot = this._slotOf(item);
  if (slot === previousSlot) return;

  var occupant = slot ? this._itemIn(slot) : null;
  if (occupant) this._put(occupant, previousSlot);
  this._put(item, slot);
  this._changed();
};

/* data-dd-answer is a space-separated list of item ids the slot accepts. */
DragDropActivity.prototype._slotAccepts = function (slot, itemId) {
  var answer = slot.dataset.ddAnswer;
  if (!answer) return true;
  return answer.split(/\s+/).indexOf(itemId) !== -1;
};

/* Slots that share the exact same (multi-value) data-dd-answer form a
   permutation group - "any one of these words, each used once across the
   group" - so the same item can't correctly fill two of them at once.
   Single-answer slots never collide this way unless two of them were
   deliberately given the identical one-item answer. */
DragDropActivity.prototype._isDuplicateInGroup = function (slot, item) {
  var answer = slot.dataset.ddAnswer;
  var itemId = item.dataset.ddItem;
  var self = this;
  return this.slots.some(function (other) {
    if (other === slot || other.dataset.ddAnswer !== answer) return false;
    var occupant = self._itemIn(other);
    return Boolean(occupant) && occupant.dataset.ddItem === itemId;
  });
};

/* With strictSlots on, a slot that names an answer refuses any other item,
   and refuses an otherwise-correct item that's already used elsewhere in
   its permutation group. */
DragDropActivity.prototype._rejects = function (slot, item) {
  if (!this.options.strictSlots) return false;
  if (!slot.dataset.ddAnswer) return false;
  if (!this._slotAccepts(slot, item.dataset.ddItem)) return true;
  return this._isDuplicateInGroup(slot, item);
};

DragDropActivity.prototype._onReject = function (item, slot) {
  slot.classList.remove("dd-rejected");
  void slot.offsetWidth; /* restarts the reject animation on repeated wrong drops */
  slot.classList.add("dd-rejected");
  window.setTimeout(function () { slot.classList.remove("dd-rejected"); }, 500);

  var itemId = item.dataset.ddItem;
  var slotId = slot.dataset.ddSlot;

  if (typeof this.options.onIncorrect === "function") this.options.onIncorrect(itemId, slotId);
  this.root.dispatchEvent(new CustomEvent("dd:incorrect", {
    detail: { itemId: itemId, slotId: slotId },
    bubbles: true
  }));
};

DragDropActivity.prototype._changed = function () {
  var placements = this.getPlacements();
  if (typeof this.options.onChange === "function") this.options.onChange(placements);
  this.root.dispatchEvent(new CustomEvent("dd:change", { detail: { placements: placements }, bubbles: true }));
  this.setComplete(this.isComplete() && this.isCorrect());
};

/* ----- click / keyboard pick-up-and-drop ----- */

DragDropActivity.prototype._select = function (item) {
  this._clearSelection();
  this.selectedItem = item;
  item.classList.add("dd-selected");
  item.setAttribute("aria-pressed", "true");
  this.root.classList.add("dd-has-selection");
};

DragDropActivity.prototype._clearSelection = function () {
  if (this.selectedItem) {
    this.selectedItem.classList.remove("dd-selected");
    this.selectedItem.setAttribute("aria-pressed", "false");
  }
  this.selectedItem = null;
  this.root.classList.remove("dd-has-selection");
};

DragDropActivity.prototype._toggleSelect = function (item) {
  if (this.selectedItem === item) this._clearSelection();
  else this._select(item);
};

DragDropActivity.prototype._onSlotActivate = function (slot) {
  if (!this.selectedItem) return;
  var item = this.selectedItem;
  this._clearSelection();
  this._place(item, slot);
};

DragDropActivity.prototype._onItemKey = function (event, item) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    this._toggleSelect(item);
  } else if ((event.key === "Delete" || event.key === "Backspace") && this._slotOf(item)) {
    event.preventDefault();
    this._clearSelection();
    this._place(item, null);
  } else if (event.key === "Escape") {
    this._clearSelection();
  }
};

/* ----- pointer dragging ----- */

DragDropActivity.prototype._onPointerDown = function (event, item) {
  if (event.button !== undefined && event.button !== 0) return;
  if (this.drag) return;

  var rect = item.getBoundingClientRect();
  this.drag = {
    item: item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    moved: false,
    ghost: null,
    hoverSlot: null
  };

  var self = this;
  this._move = function (e) { self._onPointerMove(e); };
  this._up = function (e) { self._onPointerUp(e); };
  document.addEventListener("pointermove", this._move);
  document.addEventListener("pointerup", this._up);
  document.addEventListener("pointercancel", this._up);
};

DragDropActivity.prototype._onPointerMove = function (event) {
  var drag = this.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;

  if (!drag.moved) {
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    this._clearSelection();
    this._startGhost(drag);
  }

  event.preventDefault();
  drag.ghost.style.left = (event.clientX - drag.offsetX) + "px";
  drag.ghost.style.top = (event.clientY - drag.offsetY) + "px";
  this._setHoverSlot(this._slotAt(event.clientX, event.clientY));
};

DragDropActivity.prototype._onPointerUp = function (event) {
  var drag = this.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;

  document.removeEventListener("pointermove", this._move);
  document.removeEventListener("pointerup", this._up);
  document.removeEventListener("pointercancel", this._up);
  this.drag = null;

  if (!drag.moved) {
    this._toggleSelect(drag.item); /* plain click / tap */
    return;
  }

  var cancelled = event.type === "pointercancel";
  var target = cancelled ? null : this._slotAt(event.clientX, event.clientY);

  drag.ghost.remove();
  drag.item.classList.remove("dd-dragging");
  this.root.classList.remove("dd-is-dragging");
  this._setHoverSlot(null, drag);

  this._place(drag.item, target);
};

DragDropActivity.prototype._startGhost = function (drag) {
  var ghost = drag.item.cloneNode(true);
  ghost.removeAttribute("tabindex"); /* keeps data-dd-item so item styling applies; it lives on <body>, outside the root, so lookups never see it */
  ghost.classList.remove("dd-selected", "dd-placed");
  ghost.classList.add("dd-ghost");
  ghost.style.width = drag.width + "px";
  ghost.style.height = drag.height + "px";
  document.body.appendChild(ghost);

  drag.ghost = ghost;
  drag.item.classList.add("dd-dragging");
  this.root.classList.add("dd-is-dragging");
};

/* Slot under the pointer (the ghost has pointer-events: none so it never blocks this). */
DragDropActivity.prototype._slotAt = function (x, y) {
  var el = document.elementFromPoint(x, y);
  var slot = el && el.closest("[data-dd-slot]");
  return slot && this.root.contains(slot) ? slot : null;
};

DragDropActivity.prototype._setHoverSlot = function (slot, dragOverride) {
  var drag = dragOverride || this.drag;
  if (!drag || drag.hoverSlot === slot) return;
  if (drag.hoverSlot) drag.hoverSlot.classList.remove("dd-hover");
  if (slot) slot.classList.add("dd-hover");
  drag.hoverSlot = slot;
  /* the ghost bobs while over a slot (styled in drag_and_drop_base.css) */
  if (drag.ghost) drag.ghost.classList.toggle("dd-ghost-hover", Boolean(slot));
};


export { DragDropActivity };
