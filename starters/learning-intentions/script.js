import { InputResponseActivity } from "/_glitch/lib/scripts/activities/input-response-activity.js";
import { initSectionActivitiesIn } from "/_glitch/lib/scripts/activities/activity-sections.js";

// Switch on each activity in the page, then let the Next buttons wait for them.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("#ideasActivity, #reflectActivity").forEach(function (root) {
    new InputResponseActivity(root);
  });
  initSectionActivitiesIn(document);
});
