/* ==================================================
   LESSON PAGE STARTER
   Include this one script on a lesson page and every activity block on it
   switches itself on. A block is any element marked
   data-activity-type="multiple-choice" (or another type listed below).

   - Sections after the first are locked until the student presses Next.
   - Inside the glitch editor's preview everything is unlocked so a teacher
     can see all of their blocks while building, and each block gets a small
     toolbar (drag handle, up, down, edit, delete) that talks to the editor.
   ================================================== */

import { InputResponseActivity } from "./activities/input-response-activity.js";
import { MultipleChoiceActivity } from "./activities/multiple-choice-activity.js";
import { DragDropActivity } from "./activities/drag-drop-activity.js";
import { createNextButtons, initSectionActivitiesIn } from "./activities/activity-sections.js";

const ACTIVITY_TYPES = {
  "input-response": InputResponseActivity,
  "multiple-choice": MultipleChoiceActivity,
  "drag-drop": DragDropActivity
};

/* A tray marked data-shuffle has its items put in a random order, so the order never gives the answers away. */
function shuffleTrays() {
  document.querySelectorAll("[data-dd-tray][data-shuffle]").forEach(function (tray) {
    const items = Array.prototype.slice.call(tray.children);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    items.forEach(function (item) { tray.appendChild(item); });
  });
}

/* Blocks are found by the <!-- gtac:block --> comments around them, in page order. */
function findBlockElements() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const blocks = [];
  while (walker.nextNode()) {
    if (!/^\s*gtac:block /.test(walker.currentNode.nodeValue)) continue;
    let block = walker.currentNode.nextSibling;
    while (block && block.nodeType !== 1) block = block.nextSibling;
    if (block) blocks.push(block);
  }
  return blocks;
}

const EDITOR_STYLE =
  ".gtac-editable { position: relative; outline: 2px dashed transparent; outline-offset: 4px; transition: outline-color .15s; }" +
  ".gtac-editable:hover { outline-color: #7c5cff; }" +
  ".gtac-toolbar { position: absolute; top: -16px; right: 12px; z-index: 5; display: flex; gap: 2px; padding: 3px;" +
  " background: #7c5cff; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,.25);" +
  " opacity: .6; transition: opacity .15s; }" +
  ".gtac-editable:hover > .gtac-toolbar, .gtac-toolbar:focus-within { opacity: 1; }" +
  ".gtac-hint { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 12px; margin: 0 0 18px;" +
  " padding: 10px 14px; background: #ece7ff; color: #24212f; border: 2px solid #7c5cff; border-radius: 12px;" +
  " font: 500 14px/1.4 system-ui, sans-serif; }" +
  ".gtac-hint b { font-weight: 700; }" +
  ".gtac-hint button { margin-left: auto; padding: 5px 12px; cursor: pointer; background: #7c5cff; color: #fff;" +
  " border: 0; border-radius: 999px; font: 700 13px/1 system-ui, sans-serif; }" +
  ".gtac-toolbar button { padding: 5px 9px; cursor: pointer; background: transparent; color: #fff; border: 0;" +
  " border-radius: 999px; font: 700 13px/1 system-ui, sans-serif; }" +
  ".gtac-toolbar button:hover { background: rgba(255,255,255,.25); }" +
  ".gtac-toolbar .gtac-handle { cursor: grab; letter-spacing: -2px; }" +
  ".gtac-drop-before { box-shadow: 0 -6px 0 #7c5cff; }" +
  ".gtac-drop-after { box-shadow: 0 6px 0 #7c5cff; }";

function enableBlockEditing() {
  const style = document.createElement("style");
  style.textContent = EDITOR_STYLE;
  document.head.appendChild(style);

  const blocks = findBlockElements();
  const tell = function (message) { window.parent.postMessage(message, "*"); };

  /* A one-time tip for first-time builders; "Got it" hides it for good in this browser. */
  let tipSeen = false;
  try { tipSeen = localStorage.getItem("gtac.tipSeen") === "1"; } catch (error) { /* the tip just shows each time */ }
  if (!tipSeen && blocks.length) {
    const tip = document.createElement("div");
    tip.className = "gtac-hint";
    tip.innerHTML = "<span><b>Building your lesson:</b> use the purple toolbar on each block to <b>✎ Edit</b> its words, " +
      "move it (⋮⋮ drag or ↑ ↓) or delete it (✕). Add more with <b>＋ Add block</b> at the top.</span>";
    const gotIt = document.createElement("button");
    gotIt.type = "button";
    gotIt.textContent = "Got it";
    gotIt.addEventListener("click", function () {
      tip.remove();
      try { localStorage.setItem("gtac.tipSeen", "1"); } catch (error) { /* ignore */ }
    });
    tip.appendChild(gotIt);
    document.body.insertBefore(tip, document.body.firstChild);
  }

  function clearDropMarks() {
    blocks.forEach(function (b) { b.classList.remove("gtac-drop-before", "gtac-drop-after"); });
  }

  blocks.forEach(function (block, index) {
    block.classList.add("gtac-editable");

    function tool(label, title, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.addEventListener("click", function (event) { event.stopPropagation(); onClick(); });
      return button;
    }

    const toolbar = document.createElement("div");
    toolbar.className = "gtac-toolbar";

    const handle = tool("⋮⋮", "Drag to move this block", function () {});
    handle.className = "gtac-handle";
    toolbar.appendChild(handle);
    if (index > 0) toolbar.appendChild(tool("↑", "Move up", function () { tell({ type: "gtac-move-block", from: index, to: index - 1 }); }));
    if (index < blocks.length - 1) toolbar.appendChild(tool("↓", "Move down", function () { tell({ type: "gtac-move-block", from: index, to: index + 1 }); }));
    toolbar.appendChild(tool("✎ Edit", "Edit this block", function () { tell({ type: "gtac-edit-block", index: index }); }));
    toolbar.appendChild(tool("✕", "Delete this block", function () { tell({ type: "gtac-delete-block", index: index }); }));
    block.insertBefore(toolbar, block.firstChild);

    /* Only the handle starts a drag, so selecting text and typing in the block keep working. */
    handle.addEventListener("mousedown", function () { block.draggable = true; });
    block.addEventListener("dragstart", function (event) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    block.addEventListener("dragend", function () { block.draggable = false; clearDropMarks(); });

    block.addEventListener("dragover", function (event) {
      event.preventDefault();
      const box = block.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      clearDropMarks();
      block.classList.add(after ? "gtac-drop-after" : "gtac-drop-before");
    });
    block.addEventListener("drop", function (event) {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData("text/plain"));
      const box = block.getBoundingClientRect();
      let to = index + (event.clientY > box.top + box.height / 2 ? 1 : 0);
      if (to > from) to -= 1;
      clearDropMarks();
      if (to !== from) tell({ type: "gtac-move-block", from: from, to: to });
    });
  });
}

function startLesson() {
  shuffleTrays();
  document.querySelectorAll("[data-activity-type]").forEach(function (root) {
    const Type = ACTIVITY_TYPES[root.dataset.activityType];
    if (Type) new Type(root, { strictSlots: root.hasAttribute("data-dd-strict") });
    else console.warn("Unknown activity type:", root.dataset.activityType);
  });

  const inEditorPreview = window.self !== window.top;
  if (inEditorPreview && !/\/@\d+\//.test(location.pathname)) enableBlockEditing();
  if (!inEditorPreview) {
    document.querySelectorAll(".section").forEach(function (section, index) {
      if (index > 0) section.classList.add("locked");
    });
  }

  createNextButtons(document);
  initSectionActivitiesIn(document);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startLesson);
} else {
  startLesson();
}
