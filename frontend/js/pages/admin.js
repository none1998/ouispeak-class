// ============================================================
// ADMIN PAGE: add and edit courses, weeks, exercises and vocabulary.
// Everything is saved through the C# API (js/api.js).
// ============================================================
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    courses: [],       // [{ id, name, weeks: [{ id, number, blockCount, vocabSectionCount }] }]
    courseId: null,
    weekId: null,
    week: null,        // { id, number, courseName, blocks: [...], vocabSections: [...] }
    tab: "exercises",
    view: "week",      // "week" = exercises/vocab of one week, "recordings" = lesson videos
    rec: null,         // { all: [{ group, week, lesson, url }], group: 1, links: { "3_1": "https://..." } }
    unsaved: false
};

const RECORDING_WEEKS = 26;

// Kinds of exercise blocks (what the student sees for the whole block)
const BLOCK_KINDS = [
    { value: "", label: "Questions" },
    { value: "essay", label: "Writing task (essay)" },
    { value: "match", label: "Matching (vocabulary)" },
    { value: "speaking", label: "Speaking (voice recording)" }
];   // the student page shows weeks 1–26

const QUESTION_TYPES = [
    { value: "mc", label: "Multiple choice" },
    { value: "", label: "Short answer (small box)" },
    { value: "open", label: "Open answer (long box, AI)" }
];

// ---------- Small helpers ----------

const $ = (id) => document.getElementById(id);

// Creates an element: h("button", { class: "btn", onclick: fn }, "Text")
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
        else if (key === "class") el.className = value;
        else if (key === "value" || key === "checked" || key === "disabled") el[key] = value;
        else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

function toast(message, isError = false) {
    const t = $("toast");
    t.textContent = message;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = "toast" + (isError ? " error" : "")), 3500);
}

function markUnsaved() {
    if (state.unsaved) return;
    state.unsaved = true;
    renderSaveState();
}

function confirmLeave() {
    return !state.unsaved || confirm("You have unsaved changes. Leave without saving?");
}

window.addEventListener("beforeunload", (e) => {
    if (state.unsaved) { e.preventDefault(); e.returnValue = ""; }
});

// ---------- Login ----------

async function start() {
    const { data } = await _supabase.auth.getSession();
    if (data.session) showApp();
    else showLogin();
}

function showLogin(message = "") {
    $("appView").hidden = true;
    $("loginView").hidden = false;
    $("loginError").textContent = message;
}

$("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginBtn").disabled = true;
    $("loginError").textContent = "";
    const { error } = await _supabase.auth.signInWithPassword({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
    });
    $("loginBtn").disabled = false;
    if (error) $("loginError").textContent = "Wrong email or password.";
    else showApp();
});

$("logoutBtn").addEventListener("click", async () => {
    if (!confirmLeave()) return;
    state.unsaved = false;
    await _supabase.auth.signOut();
    showLogin();
});

async function showApp() {
    try {
        await loadCourses();
    } catch (err) {
        await _supabase.auth.signOut();
        showLogin(err.message.includes("403") || err.message === "" || err.message.startsWith("Error 403")
            ? "This account is not an admin."
            : "Can't reach the API. Is the C# server running? (" + err.message + ")");
        return;
    }
    $("loginView").hidden = true;
    $("appView").hidden = false;
    renderSidebar();
    renderEditor();
}

// ---------- Courses & weeks (sidebar) ----------

async function loadCourses() {
    state.courses = await api("/api/admin/courses");
    if (!state.courses.some((c) => c.id === state.courseId)) {
        state.courseId = state.courses.length ? state.courses[0].id : null;
    }
}

function currentCourse() {
    return state.courses.find((c) => c.id === state.courseId) || null;
}

function renderSidebar() {
    const select = $("courseSelect");
    select.replaceChildren(...state.courses.map((c) =>
        h("option", { value: c.id }, c.name)));
    select.value = state.courseId ?? "";
    select.disabled = state.courses.length === 0;
    $("deleteCourseBtn").disabled = !state.courseId;
    $("addWeekBtn").disabled = !state.courseId;
    $("recordingsBtn").disabled = !state.courseId;
    $("recordingsBtn").classList.toggle("active", state.view === "recordings");

    const course = currentCourse();
    const list = $("weekList");
    if (!course) { list.replaceChildren(); return; }
    if (course.weeks.length === 0) {
        list.replaceChildren(h("p", { class: "muted" }, "No weeks yet."));
        return;
    }
    list.replaceChildren(...course.weeks.map((w) =>
        h("button", {
            class: "week-item" + (state.view === "week" && w.id === state.weekId ? " active" : ""),
            onclick: () => openWeek(w.id)
        },
            h("span", {}, "Week " + w.number),
            h("small", {}, `${w.blockCount} ex, ${w.vocabSectionCount} vocab`))));
}

$("courseSelect").addEventListener("change", (e) => {
    if (!confirmLeave()) { e.target.value = state.courseId; return; }
    state.courseId = Number(e.target.value);
    state.weekId = null; state.week = null; state.unsaved = false;
    state.view = "week"; state.rec = null;
    renderSidebar(); renderEditor();
});

$("recordingsBtn").addEventListener("click", () => openRecordings());

$("addCourseBtn").addEventListener("click", async () => {
    const name = prompt('Course name, exactly as in the Students table (e.g. "A2 - სასაუბრო კურსი"):');
    if (!name || !name.trim()) return;
    try {
        const course = await api("/api/admin/courses", { method: "POST", body: JSON.stringify({ name }) });
        state.courseId = course.id;
        await loadCourses(); renderSidebar(); renderEditor();
        toast("Course created");
    } catch (err) { toast(err.message, true); }
});

$("deleteCourseBtn").addEventListener("click", async () => {
    const course = currentCourse();
    if (!course) return;
    const typed = prompt(`This deletes "${course.name}" with ALL its weeks, exercises and vocabulary.\nType DELETE to confirm:`);
    if (typed !== "DELETE") return;
    try {
        await api("/api/admin/courses/" + course.id, { method: "DELETE" });
        state.courseId = null; state.weekId = null; state.week = null; state.unsaved = false;
        state.view = "week"; state.rec = null;
        await loadCourses(); renderSidebar(); renderEditor();
        toast("Course deleted");
    } catch (err) { toast(err.message, true); }
});

$("addWeekBtn").addEventListener("click", async () => {
    const course = currentCourse();
    if (!course || !confirmLeave()) return;
    const next = course.weeks.length ? Math.max(...course.weeks.map((w) => w.number)) + 1 : 1;
    const answer = prompt("Week number:", next);
    const number = parseInt(answer, 10);
    if (!number) return;
    try {
        const week = await api(`/api/admin/courses/${course.id}/weeks`, { method: "POST", body: JSON.stringify({ number }) });
        state.unsaved = false;
        await loadCourses();
        await openWeek(week.id, true);
        toast(`Week ${number} added`);
    } catch (err) { toast(err.message, true); }
});

async function openWeek(id, skipConfirm = false) {
    if (!skipConfirm && id !== state.weekId && !confirmLeave()) return;
    try {
        const week = await api("/api/admin/weeks/" + id);
        // Prepare editable copies (options as text, one per line)
        week.blocks.forEach((b) => (b.questions || []).forEach((q) => { q.type = q.type || ""; }));
        state.week = week;
        state.weekId = id;
        state.view = "week";
        state.rec = null;
        state.unsaved = false;
        renderSidebar();
        renderEditor();
    } catch (err) { toast(err.message, true); }
}

// ---------- Editor (main area) ----------

function renderEditor() {
    const editor = $("editor");

    if (state.courses.length === 0) {
        editor.replaceChildren(h("div", { class: "empty" },
            h("h2", {}, "No courses in the database yet"),
            h("p", {}, "Bring in all the exercises and vocabulary from your old files (js/data/) in one step, or create a course by hand."),
            h("div", { class: "add-row", style: "justify-content:center" },
                h("button", { class: "btn btn-primary", id: "importBtn", onclick: importOldData },
                    h("i", { class: "fa-solid fa-file-import" }), "Import old content"),
                h("button", { class: "btn btn-outline", onclick: () => $("addCourseBtn").click() }, "Create a course"))));
        return;
    }

    if (state.view === "recordings" && state.rec) {
        editor.replaceChildren(renderRecordings());
        renderSaveState();
        return;
    }

    if (!state.week) {
        editor.replaceChildren(h("div", { class: "empty" },
            h("h2", {}, "Choose a week"),
            h("p", {}, "Pick a week on the left to edit its exercises and vocabulary, or add a new week.")));
        return;
    }

    const w = state.week;
    editor.replaceChildren(
        h("div", { class: "editor-head" },
            h("div", {},
                h("p", { class: "course-name" }, w.courseName),
                h("h1", {}, "Week " + w.number)),
            h("div", { class: "head-actions" },
                h("span", { id: "saveState", class: "save-state" }),
                h("button", { class: "btn btn-ghost danger", onclick: deleteWeek }, h("i", { class: "fa-solid fa-trash" }), "Delete week"),
                h("button", { class: "btn btn-primary", id: "saveBtn", onclick: saveWeek }, h("i", { class: "fa-solid fa-floppy-disk" }), "Save changes"))),
        h("div", { class: "tabs", role: "tablist" },
            tabButton("exercises", `Exercises (${w.blocks.length})`),
            tabButton("vocab", `Vocabulary (${w.vocabSections.length})`)),
        state.tab === "exercises" ? renderBlocks() : renderVocab()
    );
    renderSaveState();
}

function tabButton(name, label) {
    return h("button", {
        class: "tab" + (state.tab === name ? " active" : ""),
        role: "tab",
        "aria-selected": state.tab === name ? "true" : "false",
        onclick: () => { state.tab = name; renderEditor(); }
    }, label);
}

function renderSaveState() {
    const el = $("saveState");
    if (!el) return;
    el.textContent = state.unsaved ? "Unsaved changes" : "All changes saved";
    el.className = "save-state" + (state.unsaved ? " unsaved" : "");
    $("saveBtn").disabled = !state.unsaved;
}

// Moves item i of an array up (-1) or down (+1)
function move(array, i, direction) {
    const j = i + direction;
    if (j < 0 || j >= array.length) return;
    [array[i], array[j]] = [array[j], array[i]];
    markUnsaved(); renderEditor();
}

function removeAt(array, i, what) {
    if (!confirm(`Delete this ${what}?`)) return;
    array.splice(i, 1);
    markUnsaved(); renderEditor();
}

// Text input bound to obj[key]
function boundInput(obj, key, attrs = {}) {
    return h(attrs.multiline ? "textarea" : "input", {
        ...attrs, multiline: null,
        value: obj[key] || "",
        oninput: (e) => { obj[key] = e.target.value; markUnsaved(); }
    });
}

// ---------- Exercises ----------

function renderBlocks() {
    const blocks = state.week.blocks;
    return h("section", {},
        blocks.length === 0 ? h("div", { class: "empty" },
            h("h2", {}, "No exercises this week"),
            h("p", {}, "Each block appears as one step in the sidebar students see (1, 2, 3 …).")) : null,
        blocks.map((block, i) => renderBlock(block, i)),
        h("div", { class: "add-row" },
            h("button", {
                class: "btn btn-outline", onclick: () => {
                    blocks.push({ instruction: "", type: null, textFile: null, video: null, audio: null, questions: [] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-plus" }), "Add exercise block"),
            h("button", {
                class: "btn btn-outline", onclick: () => {
                    blocks.push({ instruction: "", type: "essay", textFile: null, video: null, audio: null, questions: [] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-pen" }), "Add writing task"),
            h("button", {
                class: "btn btn-outline", onclick: () => {
                    blocks.push({ instruction: "Associez chaque mot français à sa traduction géorgienne.", type: "match", textFile: null, video: null, audio: null,
                        questions: [{ type: "", text: "", answer: "" }, { type: "", text: "", answer: "" }] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-link" }), "Add matching"),
            h("button", {
                class: "btn btn-outline", onclick: () => {
                    blocks.push({ instruction: "ჩაიწერეთ ხმა და უპასუხეთ კითხვებს ფრანგულად.", type: "speaking", textFile: null, video: null, audio: null,
                        questions: [{ type: "", text: "", answer: "" }] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-microphone" }), "Add speaking")));
}

function renderBlock(block, i) {
    const blocks = state.week.blocks;
    const isEssay = block.type === "essay";
    block.questions = block.questions || [];

    return h("article", { class: "block" },
        h("div", { class: "block-head" },
            h("span", { class: "block-number" }, i + 1),
            h("select", {
                "aria-label": "Block kind",
                onchange: (e) => { block.type = e.target.value || null; markUnsaved(); renderEditor(); }
            },
                BLOCK_KINDS.map((k) => h("option", { value: k.value, selected: (block.type || "") === k.value }, k.label))),
            h("span", { class: "spacer" }),
            h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => move(blocks, i, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
            h("button", { class: "icon-btn", title: "Move down", disabled: i === blocks.length - 1, onclick: () => move(blocks, i, 1) }, h("i", { class: "fa-solid fa-arrow-down" })),
            h("button", { class: "icon-btn danger", title: "Delete block", onclick: () => removeAt(blocks, i, "block") }, h("i", { class: "fa-solid fa-trash" }))),
        h("div", { class: "block-body" },
            h("label", {}, "Instruction", boundInput(block, "instruction", { multiline: true, rows: 2 })),
            h("div", { class: "media-row" },
                h("label", {}, "Reading text file", boundInput(block, "textFile", { placeholder: "e.g. texts/a2_text_1.txt" })),
                h("label", {}, "Video", boundInput(block, "video", { placeholder: "e.g. videos/a2_video1.mp4" })),
                h("label", {}, "Audio", boundInput(block, "audio", { placeholder: "e.g. audio/a2_audio1.mp3" }))),
            isEssay
                ? h("p", { class: "q-note" }, "Students write a free text for this block. No questions needed.")
                : block.type === "match" ? renderMatchPairs(block)
                : block.type === "speaking" ? renderSpeakingPrompts(block)
                : h("div", { class: "questions" },
                    block.questions.map((q, j) => renderQuestion(block, q, j)),
                    h("div", { class: "add-row" },
                        ...QUESTION_TYPES.map((t) => h("button", {
                            class: "btn btn-ghost", onclick: () => {
                                block.questions.push({ type: t.value, text: "", options: t.value === "mc" ? ["", "", "", ""] : null, answer: "" });
                                markUnsaved(); renderEditor();
                            }
                        }, h("i", { class: "fa-solid fa-plus" }), t.label.replace(/ \(.*\)/, ""))))))
    );
}

// Matching block: each question = one pair (text = French, answer = Georgian)
function renderMatchPairs(block) {
    const pairs = block.questions;
    const pasteBox = h("textarea", { placeholder: "L'armoire = კარადა\nLe couloir = დერეფანი", "aria-label": "Paste pairs" });
    return h("div", { class: "questions" },
        h("p", { class: "q-note" }, "Students match each French word (course colour) with its Georgian meaning (blue). The Georgian words are shuffled automatically."),
        h("table", { class: "words" },
            h("thead", {}, h("tr", {}, h("th", {}), h("th", {}, "French"), h("th", {}, "Georgian"), h("th", {}))),
            h("tbody", {}, pairs.map((pair, j) => h("tr", {},
                h("td", {}, j + 1),
                h("td", {}, boundInput(pair, "text", { "aria-label": "French" })),
                h("td", {}, boundInput(pair, "answer", { "aria-label": "Georgian" })),
                h("td", {}, h("button", {
                    class: "icon-btn danger", title: "Delete pair",
                    onclick: () => { pairs.splice(j, 1); markUnsaved(); renderEditor(); }
                }, h("i", { class: "fa-solid fa-xmark" }))))))),
        h("div", { class: "add-row" },
            h("button", {
                class: "btn btn-ghost", onclick: () => {
                    pairs.push({ type: "", text: "", answer: "" });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-plus" }), "Add pair")),
        h("div", { class: "paste-box" },
            h("label", {}, "Add many at once: one pair per line, French = Georgian", pasteBox),
            h("div", {}, h("button", {
                class: "btn btn-outline", onclick: () => {
                    const added = parseWordList(pasteBox.value);
                    if (added.length === 0) { toast("Nothing to add. Use: French = Georgian", true); return; }
                    pairs.push(...added.map((w) => ({ type: "", text: w.french, answer: w.georgian })));
                    markUnsaved(); renderEditor();
                    toast(`${added.length} pairs added`);
                }
            }, "Add these pairs"))));
}

// Speaking block: each question = one thing the student answers out loud
function renderSpeakingPrompts(block) {
    const prompts = block.questions;
    return h("div", { class: "questions" },
        h("p", { class: "q-note" }, "Students record their voice for each prompt. The recordings are sent to you as links in the answers email."),
        prompts.map((p, j) => h("div", { class: "question" },
            h("span", { class: "q-num" }, j + 1 + "."),
            h("div", { class: "q-fields" },
                boundInput(p, "text", { multiline: true, rows: 2, placeholder: "e.g. Présentez-vous : votre nom, votre âge, votre ville.", "aria-label": "Speaking prompt" })),
            h("div", {},
                h("button", { class: "icon-btn", title: "Move up", disabled: j === 0, onclick: () => move(prompts, j, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
                h("button", { class: "icon-btn danger", title: "Delete prompt", onclick: () => removeAt(prompts, j, "prompt") }, h("i", { class: "fa-solid fa-xmark" }))))),
        h("div", { class: "add-row" },
            h("button", {
                class: "btn btn-ghost", onclick: () => {
                    prompts.push({ type: "", text: "", answer: "" });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-plus" }), "Add prompt")));
}

function renderQuestion(block, q, j) {
    const questions = block.questions;
    const fields = [
        h("div", { class: "q-row" },
            h("select", {
                "aria-label": "Question type",
                onchange: (e) => {
                    q.type = e.target.value;
                    if (q.type === "mc" && !q.options) q.options = ["", "", "", ""];
                    markUnsaved(); renderEditor();
                }
            }, QUESTION_TYPES.map((t) => h("option", { value: t.value, selected: (q.type || "") === t.value }, t.label))),
            boundInput(q, "text", { multiline: true, rows: 1, placeholder: "Question, use ______ for the gap", "aria-label": "Question text" }))
    ];

    if (q.type === "mc") {
        const optionsBox = h("textarea", {
            rows: Math.max(3, (q.options || []).length),
            placeholder: "One option per line",
            "aria-label": "Options, one per line",
            value: (q.options || []).join("\n"),
            oninput: (e) => { q.options = e.target.value.split("\n"); markUnsaved(); },
            onchange: () => renderEditor()   // refresh the correct-answer list
        });
        const options = (q.options || []).map((o) => o.trim()).filter((o) => o !== "");
        const answerSelect = h("select", {
            "aria-label": "Correct answer",
            onchange: (e) => { q.answer = e.target.value; markUnsaved(); }
        },
            h("option", { value: "", selected: !options.includes(q.answer) }, "Choose the correct option…"),
            options.map((o) => h("option", { value: o, selected: o === q.answer }, o)));
        fields.push(h("div", { class: "q-row" },
            h("label", {}, "Options (one per line)", optionsBox),
            h("label", {}, "Correct answer", answerSelect)));
    } else if (q.type === "open") {
        fields.push(h("p", { class: "q-note" }, "Students get a long box to write in. The AI corrects it when they send their answers, so no correct answer is needed."));
    } else {
        fields.push(h("label", {}, "Correct answer", boundInput(q, "answer", { placeholder: "e.g. étudie" })));
    }

    return h("div", { class: "question" },
        h("span", { class: "q-num" }, j + 1 + "."),
        h("div", { class: "q-fields" }, fields),
        h("div", {},
            h("button", { class: "icon-btn", title: "Move up", disabled: j === 0, onclick: () => move(questions, j, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
            h("button", { class: "icon-btn danger", title: "Delete question", onclick: () => removeAt(questions, j, "question") }, h("i", { class: "fa-solid fa-xmark" }))));
}

// ---------- Vocabulary ----------

function renderVocab() {
    const sections = state.week.vocabSections;
    return h("section", {},
        sections.length === 0 ? h("div", { class: "empty" },
            h("h2", {}, "No vocabulary this week"),
            h("p", {}, "Add a section, then type words or paste a whole list at once.")) : null,
        sections.map((s, i) => renderSection(s, i)),
        h("div", { class: "add-row" },
            h("button", {
                class: "btn btn-outline", onclick: () => {
                    sections.push({ instruction: `კვირა ${state.week.number}`, words: [] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-plus" }), "Add vocabulary section")));
}

function renderSection(section, i) {
    const sections = state.week.vocabSections;
    const pasteBox = h("textarea", { placeholder: "Un quartier = უბანი\nAnimé = ცოცხალი", "aria-label": "Paste words" });

    return h("article", { class: "block" },
        h("div", { class: "block-head" },
            h("span", { class: "block-number" }, i + 1),
            h("strong", {}, `${section.words.length} words`),
            h("span", { class: "spacer" }),
            h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => move(sections, i, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
            h("button", { class: "icon-btn", title: "Move down", disabled: i === sections.length - 1, onclick: () => move(sections, i, 1) }, h("i", { class: "fa-solid fa-arrow-down" })),
            h("button", { class: "icon-btn danger", title: "Delete section", onclick: () => removeAt(sections, i, "section") }, h("i", { class: "fa-solid fa-trash" }))),
        h("div", { class: "block-body" },
            h("label", {}, "Title", boundInput(section, "instruction")),
            h("table", { class: "words" },
                h("thead", {}, h("tr", {}, h("th", {}), h("th", {}, "French"), h("th", {}, "Georgian"), h("th", {}))),
                h("tbody", {}, section.words.map((word, j) => h("tr", {},
                    h("td", {}, j + 1),
                    h("td", {}, boundInput(word, "french", { "aria-label": "French" })),
                    h("td", {}, boundInput(word, "georgian", { "aria-label": "Georgian" })),
                    h("td", {}, h("button", {
                        class: "icon-btn danger", title: "Delete word",
                        onclick: () => { section.words.splice(j, 1); markUnsaved(); renderEditor(); }
                    }, h("i", { class: "fa-solid fa-xmark" }))))))),
            h("div", { class: "add-row" },
                h("button", {
                    class: "btn btn-ghost", onclick: () => {
                        section.words.push({ french: "", georgian: "" });
                        markUnsaved(); renderEditor();
                    }
                }, h("i", { class: "fa-solid fa-plus" }), "Add word")),
            h("div", { class: "paste-box" },
                h("label", {}, "Add many at once: one word per line, French = Georgian", pasteBox),
                h("div", {}, h("button", {
                    class: "btn btn-outline", onclick: () => {
                        const added = parseWordList(pasteBox.value);
                        if (added.length === 0) { toast("Nothing to add. Use: French = Georgian", true); return; }
                        section.words.push(...added);
                        markUnsaved(); renderEditor();
                        toast(`${added.length} words added`);
                    }
                }, "Add these words"))))
    );
}

// Accepts "french = georgian", "french - georgian" (with spaces) or "french<TAB>georgian" (copied from Excel)
function parseWordList(text) {
    return text.split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => {
            const parts = line.includes("\t") ? line.split("\t")
                : line.includes("=") ? line.split("=")
                : line.split(" - ");
            return { french: (parts[0] || "").trim(), georgian: parts.slice(1).join(" ").trim() };
        })
        .filter((w) => w.french !== "");
}

// ---------- Save / delete week ----------

async function saveWeek() {
    const w = state.week;

    // Simple checks before saving
    for (const [i, b] of w.blocks.entries()) {
        if (b.type === "match") {
            const pairs = b.questions || [];
            const bad = pairs.findIndex((p) => !(p.text || "").trim() || !(p.answer || "").trim());
            if (pairs.length < 2 || bad >= 0) {
                state.tab = "exercises"; renderEditor();
                toast(pairs.length < 2 ? `Block ${i + 1}: add at least 2 pairs.` : `Block ${i + 1}, pair ${bad + 1}: fill both French and Georgian.`, true);
                return;
            }
            continue;
        }
        if (b.type === "speaking") {
            if (!(b.questions || []).some((p) => (p.text || "").trim())) {
                state.tab = "exercises"; renderEditor();
                toast(`Block ${i + 1}: add at least one speaking prompt.`, true);
                return;
            }
            continue;
        }
        for (const [j, q] of (b.questions || []).entries()) {
            if (b.type !== "essay" && q.type === "mc" && !q.answer) {
                state.tab = "exercises"; renderEditor();
                toast(`Block ${i + 1}, question ${j + 1}: choose the correct answer.`, true);
                return;
            }
        }
    }

    const blocks = w.blocks.map((b) => ({
        instruction: b.instruction || "",
        type: b.type || null,
        textFile: b.textFile || null,
        video: b.video || null,
        audio: b.audio || null,
        questions: b.type === "essay" ? []
            : b.type === "match" ? (b.questions || []).map((q) => ({ type: null, text: q.text || "", options: null, answer: q.answer || "" }))
            : b.type === "speaking" ? (b.questions || []).filter((q) => (q.text || "").trim()).map((q) => ({ type: null, text: q.text, options: null, answer: "" }))
            : (b.questions || []).map((q) => ({
            type: q.type || null,
            text: q.text || "",
            options: q.type === "mc" ? (q.options || []) : null,
            answer: q.type === "open" ? "" : (q.answer || "")
        }))
    }));
    const sections = w.vocabSections.map((s) => ({ instruction: s.instruction || "", words: s.words }));

    $("saveBtn").disabled = true;
    try {
        await api(`/api/admin/weeks/${w.id}/blocks`, { method: "PUT", body: JSON.stringify(blocks) });
        await api(`/api/admin/weeks/${w.id}/vocab`, { method: "PUT", body: JSON.stringify(sections) });
        state.unsaved = false;
        await loadCourses();
        await openWeek(w.id, true);
        toast("Saved. Students see the changes right away.");
    } catch (err) {
        toast("Not saved: " + err.message, true);
        renderSaveState();
    }
}

async function deleteWeek() {
    const w = state.week;
    if (!confirm(`Delete week ${w.number} with all its exercises and vocabulary?`)) return;
    try {
        await api("/api/admin/weeks/" + w.id, { method: "DELETE" });
        state.week = null; state.weekId = null; state.unsaved = false;
        await loadCourses(); renderSidebar(); renderEditor();
        toast(`Week ${w.number} deleted`);
    } catch (err) { toast(err.message, true); }
}

// ---------- Lesson recordings (one set of links per group) ----------

async function openRecordings(group = null, skipConfirm = false) {
    const course = currentCourse();
    if (!course) return;
    if (!skipConfirm && !confirmLeave()) return;
    try {
        const all = await api(`/api/admin/courses/${course.id}/recordings`);
        const groups = groupsIn(all);
        state.rec = { all, group: group ?? (groups[0] || 1), links: {} };
        fillLinks();
        state.view = "recordings";
        state.week = null; state.weekId = null;
        state.unsaved = false;
        renderSidebar(); renderEditor();
    } catch (err) { toast(err.message, true); }
}

function groupsIn(all) {
    return [...new Set(all.map((r) => r.group))].sort((a, b) => a - b);
}

// Copies the saved links of the chosen group into the editable form
function fillLinks() {
    const rec = state.rec;
    rec.links = {};
    for (const r of rec.all) {
        if (r.group === rec.group) rec.links[`${r.week}_${r.lesson}`] = r.url;
    }
}

function renderRecordings() {
    const course = currentCourse();
    const rec = state.rec;
    const groups = groupsIn(rec.all);
    if (!groups.includes(rec.group)) groups.push(rec.group);
    groups.sort((a, b) => a - b);

    const maxSaved = Math.max(0, ...rec.all.map((r) => r.week));
    const weekCount = Math.max(RECORDING_WEEKS, maxSaved);

    const groupSelect = h("select", {
        "aria-label": "Group",
        onchange: (e) => {
            const next = Number(e.target.value);
            if (!confirmLeave()) { e.target.value = rec.group; return; }
            rec.group = next; state.unsaved = false;
            fillLinks(); renderEditor();
        }
    }, groups.map((g) => h("option", { value: g, selected: g === rec.group }, "Group " + g)));

    const rows = [];
    for (let week = 1; week <= weekCount; week++) {
        const cell = (lesson) => h("td", {}, h("input", {
            type: "url",
            placeholder: `Lesson ${lesson} link`,
            "aria-label": `Week ${week}, lesson ${lesson} link`,
            value: rec.links[`${week}_${lesson}`] || "",
            oninput: (e) => {
                rec.links[`${week}_${lesson}`] = e.target.value;
                e.target.closest("tr").classList.toggle("filled",
                    !!(rec.links[`${week}_1`] || rec.links[`${week}_2`]));
                markUnsaved();
            }
        }));
        const filled = rec.links[`${week}_1`] || rec.links[`${week}_2`];
        rows.push(h("tr", { class: filled ? "filled" : "" }, h("td", {}, "Week " + week), cell(1), cell(2)));
    }

    return h("section", {},
        h("div", { class: "editor-head" },
            h("div", {},
                h("p", { class: "course-name" }, course.name),
                h("h1", {}, "Lesson recordings")),
            h("div", { class: "head-actions" },
                h("span", { id: "saveState", class: "save-state" }),
                h("button", { class: "btn btn-primary", id: "saveBtn", onclick: saveRecordings },
                    h("i", { class: "fa-solid fa-floppy-disk" }), "Save changes"))),
        h("div", { class: "group-bar" },
            h("label", {}, "Group", groupSelect),
            h("button", { class: "btn btn-outline", onclick: addGroup }, h("i", { class: "fa-solid fa-plus" }), "New group"),
            rec.all.length === 0
                ? h("button", { class: "btn btn-ghost", id: "importRecBtn", onclick: importOldRecordings },
                    h("i", { class: "fa-solid fa-file-import" }), "Import old links as group 1")
                : null),
        h("p", { class: "rec-note" },
            "Students only see the links of their own group. A student's group is the ",
            h("code", {}, "group_number"),
            " column in the Students table. Weeks without any link stay locked for students."),
        h("div", { class: "table-scroll" },
            h("table", { class: "rec-table" },
                h("thead", {}, h("tr", {}, h("th", {}, "Week"), h("th", {}, "Lesson 1"), h("th", {}, "Lesson 2"))),
                h("tbody", {}, rows))));
}

function addGroup() {
    const rec = state.rec;
    if (!confirmLeave()) return;
    const groups = groupsIn(rec.all);
    const next = groups.length ? Math.max(...groups, rec.group) + 1 : rec.group + 1;
    const number = parseInt(prompt("New group number:", next), 10);
    if (!number || number < 1) return;
    rec.group = number;
    state.unsaved = false;
    fillLinks(); renderEditor();
    toast(`Group ${number}: add its links, then save.`);
}

async function saveRecordings() {
    const course = currentCourse();
    const rec = state.rec;
    const links = Object.entries(rec.links)
        .map(([key, url]) => {
            const [week, lesson] = key.split("_").map(Number);
            return { week, lesson, url: (url || "").trim() };
        })
        .filter((l) => l.url !== "");

    const bad = links.find((l) => !/^https?:\/\//i.test(l.url));
    if (bad) {
        toast(`Week ${bad.week}, lesson ${bad.lesson}: the link must start with https://`, true);
        return;
    }

    $("saveBtn").disabled = true;
    try {
        await api(`/api/admin/courses/${course.id}/recordings/${rec.group}`, { method: "PUT", body: JSON.stringify(links) });
        state.unsaved = false;
        await openRecordings(rec.group, true);
        toast(`Saved. Group ${rec.group} students see the changes right away.`);
    } catch (err) {
        toast("Not saved: " + err.message, true);
        renderSaveState();
    }
}

async function importOldRecordings() {
    const btn = $("importRecBtn");
    btn.disabled = true;
    try {
        await loadScript("js/data/recordings-data.js");
        const result = await api("/api/admin/recordings/import", {
            method: "POST",
            body: JSON.stringify(courseLinksDatabase)
        });
        await loadCourses();
        await openRecordings(1, true);
        toast(`Imported ${result.links} links into group 1.`);
    } catch (err) {
        toast("Import failed: " + err.message, true);
        btn.disabled = false;
    }
}

// ---------- One-time import of the old hardcoded files ----------

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Could not load " + src));
        document.body.append(s);
    });
}

async function importOldData() {
    const btn = $("importBtn");
    btn.disabled = true;
    try {
        await loadScript("js/data/exercises-data.js");
        await loadScript("js/data/vocab-data.js");
        const result = await api("/api/admin/import", {
            method: "POST",
            body: JSON.stringify({ exercises: dataset, vocab: vocabDataset })
        });
        await loadCourses(); renderSidebar(); renderEditor();
        toast(`Imported ${result.courses} courses, ${result.weeks} weeks, ${result.questions} questions, ${result.words} words.`);
    } catch (err) {
        toast("Import failed: " + err.message, true);
        btn.disabled = false;
    }
}

start();
