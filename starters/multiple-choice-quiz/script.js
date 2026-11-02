import { MultipleChoiceActivity } from "/_glitch/lib/scripts/activities/multiple-choice-activity.js";

// Switch on the quiz. "live" means a wrong answer after a right one counts as not finished.
document.addEventListener("DOMContentLoaded", function () {
  new MultipleChoiceActivity(document.getElementById("quiz"));
});
