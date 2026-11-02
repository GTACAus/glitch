/* ==================================================
   LESSON PAGE STARTER
   Include this one script on a lesson page and every activity block on it
   switches itself on. A block is any element marked
   data-activity-type="multiple-choice" (or another type listed below).

   - Sections after the first are locked until the student presses Next.
   - Inside the glitch editor's preview everything is unlocked so a teacher
     can see all of their blocks while building.
   ================================================== */

import { InputResponseActivity } from "./activities/input-response-activity.js";
import { MultipleChoiceActivity } from "./activities/multiple-choice-activity.js";
import { createNextButtons, initSectionActivitiesIn } from "./activities/activity-sections.js";

const ACTIVITY_TYPES = {
  "input-response": InputResponseActivity,
  "multiple-choice": MultipleChoiceActivity
};

/* In the glitch editor's preview, each block gets an "Edit" button that asks the editor
   to open that block's form. Blocks are found by the <!-- gtac:block --> comments around them. */
function enableBlockEditing() {
  const style = document.createElement("style");
  style.textContent =
    ".gtac-editable { position: relative; outline: 2px dashed transparent; outline-offset: 4px; transition: outline-color .15s; }" +
    ".gtac-editable:hover { outline-color: #7c5cff; }" +
    ".gtac-edit-btn { position: absolute; top: -14px; right: 12px; z-index: 5; padding: 6px 12px; cursor: pointer;" +
    " background: #7c5cff; color: #fff; border: 0; border-radius: 999px; font: 700 13px/1 system-ui, sans-serif;" +
    " opacity: 0; transition: opacity .15s; box-shadow: 0 2px 8px rgba(0,0,0,.25); }" +
    ".gtac-editable:hover > .gtac-edit-btn, .gtac-edit-btn:focus { opacity: 1; }";
  document.head.appendChild(style);

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const starts = [];
  while (walker.nextNode()) {
    if (/^\s*gtac:block /.test(walker.currentNode.nodeValue)) starts.push(walker.currentNode);
  }

  starts.forEach(function (start, index) {
    let block = start.nextSibling;
    while (block && block.nodeType !== 1) block = block.nextSibling;
    if (!block) return;

    block.classList.add("gtac-editable");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gtac-edit-btn";
    button.textContent = "✎ Edit";
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      window.parent.postMessage({ type: "gtac-edit-block", index: index }, "*");
    });
    block.insertBefore(button, block.firstChild);
  });
}

function startLesson() {
  document.querySelectorAll("[data-activity-type]").forEach(function (root) {
    const Type = ACTIVITY_TYPES[root.dataset.activityType];
    if (Type) new Type(root);
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
