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

function startLesson() {
  document.querySelectorAll("[data-activity-type]").forEach(function (root) {
    const Type = ACTIVITY_TYPES[root.dataset.activityType];
    if (Type) new Type(root);
    else console.warn("Unknown activity type:", root.dataset.activityType);
  });

  const inEditorPreview = window.self !== window.top;
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
