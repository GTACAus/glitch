/* ==================================================
   BLOCKS
   The pieces a teacher can add to a lesson page from the editor's "Add block"
   panel. Each block says:
     title, description  what the teacher sees in the panel
     fields              the boxes of the edit form
     defaults()          what a freshly added block contains
     render(values)      the HTML written into index.html (between
                         <!-- gtac:block TYPE --> markers)
     read(el)            turns that HTML back into values, so the edit form
                         always reflects the real code

   Field types: text, longtext, number, list (of strings),
                choices (answers with one marked correct),
                group (a repeatable set of sub-fields).

   To add a block, add an entry below. Activities it uses must also be
   registered in scripts/lesson.js.
   ================================================== */

(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function textOf(root, selector) {
    var found = root.querySelector(selector);
    return found ? found.textContent.trim() : "";
  }

  var LETTERS = "abcdefghijklmnopqrstuvwxyz";

  window.GTAC_BLOCKS = {

    intro: {
      title: "Learning intentions",
      description: "Lesson title, learning intention and success criteria",
      fields: [
        { key: "label", label: "Small label above the title", type: "text" },
        { key: "title", label: "Lesson title", type: "text" },
        { key: "summary", label: "Short summary", type: "longtext" },
        { key: "intention", label: "Learning intention", type: "longtext" },
        { key: "criteria", label: "Success criteria", type: "list", addLabel: "+ Add a success criterion" }
      ],
      defaults: function () {
        return {
          label: "Lesson 1",
          title: "Your lesson title",
          summary: "A short summary of what students will do in this lesson.",
          intention: "Students will learn to ...",
          criteria: ["I can ...", "I can ...", "I can ..."]
        };
      },
      render: function (v) {
        return '<header class="lesson-intro">\n' +
          '  <div class="lesson-heading">\n' +
          '    <span class="lesson-label">' + esc(v.label) + '</span>\n' +
          '    <h1>' + esc(v.title) + '</h1>\n' +
          '    <p class="lesson-summary">' + esc(v.summary) + '</p>\n' +
          '  </div>\n' +
          '  <section class="intro-card objectives-card objectives-card-wide">\n' +
          '    <p class="intro-eyebrow">Learning intention</p>\n' +
          '    <p class="learning-objective-text">' + esc(v.intention) + '</p>\n' +
          '    <p class="success-heading">Success criteria</p>\n' +
          '    <ol class="objective-list">\n' +
          v.criteria.map(function (c) { return '      <li>' + esc(c) + '</li>\n'; }).join("") +
          '    </ol>\n' +
          '  </section>\n' +
          '</header>';
      },
      read: function (root) {
        return {
          label: textOf(root, ".lesson-label"),
          title: textOf(root, "h1"),
          summary: textOf(root, ".lesson-summary"),
          intention: textOf(root, ".learning-objective-text"),
          criteria: Array.prototype.map.call(root.querySelectorAll(".objective-list li"), function (li) {
            return li.textContent.trim();
          })
        };
      }
    },

    text: {
      title: "Text",
      description: "A heading and a paragraph",
      fields: [
        { key: "heading", label: "Heading", type: "text" },
        { key: "body", label: "Text", type: "longtext" }
      ],
      defaults: function () {
        return { heading: "A heading", body: "Write your text here." };
      },
      render: function (v) {
        return '<section class="section">\n' +
          '  <h2 class="section-title">' + esc(v.heading) + '</h2>\n' +
          '  <p class="activity-instruction">' + esc(v.body) + '</p>\n' +
          '</section>';
      },
      read: function (root) {
        return { heading: textOf(root, ".section-title"), body: textOf(root, ".activity-instruction") };
      }
    },

    ideas: {
      title: "Student ideas",
      description: "Students type ideas and see them appear as a list",
      fields: [
        { key: "heading", label: "Heading", type: "text" },
        { key: "instruction", label: "Instruction for students", type: "longtext" },
        { key: "placeholder", label: "Hint inside the box", type: "text" },
        { key: "minimum", label: "Ideas needed before Next appears", type: "number" }
      ],
      defaults: function () {
        return {
          heading: "Start by thinking",
          instruction: "What do you already know about this topic? Type an idea and press Add.",
          placeholder: "Type an idea",
          minimum: 2
        };
      },
      render: function (v) {
        return '<section class="section">\n' +
          '  <h2 class="section-title">' + esc(v.heading) + '</h2>\n' +
          '  <div class="diagram-box diagram-activity">\n' +
          '    <p class="activity-instruction">' + esc(v.instruction) + '</p>\n' +
          '  </div>\n' +
          '  <div data-activity data-activity-type="input-response">\n' +
          '    <div data-tr-group data-tr-key="ideas" data-tr-min="' + esc(v.minimum) + '">\n' +
          '      <input data-tr-input type="text" placeholder="' + esc(v.placeholder) + '">\n' +
          '      <button data-tr-add class="general-button">Add</button>\n' +
          '      <ul data-tr-list></ul>\n' +
          '    </div>\n' +
          '  </div>\n' +
          '</section>';
      },
      read: function (root) {
        var group = root.querySelector("[data-tr-group]");
        var input = root.querySelector("[data-tr-input]");
        return {
          heading: textOf(root, ".section-title"),
          instruction: textOf(root, ".activity-instruction"),
          placeholder: input ? input.getAttribute("placeholder") || "" : "",
          minimum: group ? Number(group.dataset.trMin || 0) : 0
        };
      }
    },

    mcq: {
      title: "Multiple choice",
      description: "Questions with answer buttons that tell students if they are right",
      fields: [
        { key: "heading", label: "Heading", type: "text" },
        { key: "instruction", label: "Instruction for students", type: "longtext" },
        {
          key: "questions", label: "Questions", type: "group", itemLabel: "Question", addLabel: "+ Add a question",
          fields: [
            { key: "text", label: "Question", type: "text" },
            { key: "choices", label: "Answers (tick the correct one)", type: "choices" },
            { key: "correctText", label: "Shown when right", type: "longtext" },
            { key: "incorrectText", label: "Shown when wrong", type: "longtext" }
          ],
          blank: function () {
            return {
              text: "New question?",
              choices: [{ text: "First answer", correct: true }, { text: "Second answer", correct: false }],
              correctText: "Yes!",
              incorrectText: "Not quite. Try again."
            };
          }
        }
      ],
      defaults: function () {
        return {
          heading: "Check your understanding",
          instruction: "Choose the best answer for each question.",
          questions: [{
            text: "Question 1: write your question here?",
            choices: [
              { text: "First answer", correct: false },
              { text: "Second answer (the right one)", correct: true },
              { text: "Third answer", correct: false }
            ],
            correctText: "Yes! Explain why this is right.",
            incorrectText: "Not quite. Give a hint and let them try again."
          }]
        };
      },
      render: function (v) {
        return '<section class="section">\n' +
          '  <h2 class="section-title">' + esc(v.heading) + '</h2>\n' +
          '  <div class="diagram-box diagram-activity">\n' +
          '    <p class="activity-instruction">' + esc(v.instruction) + '</p>\n' +
          '  </div>\n' +
          '  <div data-activity data-activity-type="multiple-choice">\n' +
          v.questions.map(function (q) {
            var right = Math.max(0, q.choices.findIndex(function (c) { return c.correct; }));
            return '    <div data-mc-question data-mc-answer="' + LETTERS[right] + '">\n' +
              '      <p>' + esc(q.text) + '</p>\n' +
              '      <div data-mc-choices>\n' +
              q.choices.map(function (c, i) {
                return '        <button type="button" data-mc-choice="' + LETTERS[i] + '">' + esc(c.text) + '</button>\n';
              }).join("") +
              '      </div>\n' +
              '      <div data-mc-feedback data-correct-text="' + esc(q.correctText) +
              '" data-incorrect-text="' + esc(q.incorrectText) + '" hidden></div>\n' +
              '    </div>\n';
          }).join("") +
          '  </div>\n' +
          '</section>';
      },
      read: function (root) {
        return {
          heading: textOf(root, ".section-title"),
          instruction: textOf(root, ".activity-instruction"),
          questions: Array.prototype.map.call(root.querySelectorAll("[data-mc-question]"), function (q) {
            var feedback = q.querySelector("[data-mc-feedback]");
            return {
              text: textOf(q, "p"),
              choices: Array.prototype.map.call(q.querySelectorAll("[data-mc-choice]"), function (b) {
                return { text: b.textContent.trim(), correct: b.dataset.mcChoice === q.dataset.mcAnswer };
              }),
              correctText: feedback ? feedback.dataset.correctText || "" : "",
              incorrectText: feedback ? feedback.dataset.incorrectText || "" : ""
            };
          })
        };
      }
    }
  };
})();
