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
    section: "content", // "content" | "courses" | "students"
    view: "week",      // "week" = exercises/vocab of one week, "recordings" = lesson videos
    rec: null,         // { all: [{ group, week, lesson, url }], group: 1, links: { "3_1": "https://..." } }
    unsaved: false
};

const RECORDING_WEEKS = 26;

const KIND_ICONS = { questions: "fa-list-check", essay: "fa-pen-nib", match: "fa-link", speaking: "fa-microphone" };

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

    // Course list (replaces the dropdown)
    $("courseList").replaceChildren(...state.courses.map((c) => {
        const isDelf = /delf/i.test(c.name);
        return h("button", {
            class: "course-item" + (c.id === state.courseId ? " active" : "") + (isDelf ? " delf" : ""),
            "aria-pressed": c.id === state.courseId ? "true" : "false",
            onclick: () => {
                if (c.id === state.courseId) return;
                select.value = c.id;
                select.dispatchEvent(new Event("change"));
            }
        },
            h("span", { class: "course-badge" }, c.level || (c.name.match(/\b(A1|A2|B1|B2|C1)\b/) || [""])[0] || "?"),
            h("span", { class: "course-item-text" },
                h("span", { class: "course-item-name" }, c.name),
                h("small", {}, `${c.weeks.length} weeks${c.isLocked ? " · 🔒" : ""}`)));
    }));

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

    if (state.section === "courses") { editor.replaceChildren(renderCoursesManager()); renderSaveState(); return; }
    if (state.section === "students") { editor.replaceChildren(renderStudentsManager()); renderSaveState(); return; }

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
                class: "btn btn-outline add-questions", onclick: () => {
                    blocks.push({ instruction: "", type: null, textFile: null, video: null, audio: null, questions: [] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-list-check" }), "Add exercise block"),
            h("button", {
                class: "btn btn-outline add-essay", onclick: () => {
                    blocks.push({ instruction: "", type: "essay", textFile: null, video: null, audio: null, questions: [] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-pen" }), "Add writing task"),
            h("button", {
                class: "btn btn-outline add-match", onclick: () => {
                    blocks.push({ instruction: "Associez chaque mot français à sa traduction géorgienne.", type: "match", textFile: null, video: null, audio: null,
                        questions: [{ type: "", text: "", answer: "" }, { type: "", text: "", answer: "" }] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-link" }), "Add matching"),
            h("button", {
                class: "btn btn-outline add-speaking", onclick: () => {
                    blocks.push({ instruction: "ჩაიწერეთ ხმა და უპასუხეთ კითხვებს ფრანგულად.", type: "speaking", textFile: null, video: null, audio: null,
                        questions: [{ type: "", text: "", answer: "" }] });
                    markUnsaved(); renderEditor();
                }
            }, h("i", { class: "fa-solid fa-microphone" }), "Add speaking"),
            renderPasteButton("block", (copy) => blocks.push(copy))));
}

function renderBlock(block, i) {
    const blocks = state.week.blocks;
    const isEssay = block.type === "essay";
    block.questions = block.questions || [];

    const kind = block.type || "questions";
    return h("article", { class: `block kind-${kind}` },
        h("div", { class: "block-head" },
            h("span", { class: "block-number" }, i + 1),
            h("span", { class: "kind-icon", "aria-hidden": "true" }, h("i", { class: `fa-solid ${KIND_ICONS[kind] || "fa-list-check"}` })),
            h("select", {
                "aria-label": "Block kind",
                onchange: (e) => { block.type = e.target.value || null; markUnsaved(); renderEditor(); }
            },
                BLOCK_KINDS.map((k) => h("option", { value: k.value, selected: (block.type || "") === k.value }, k.label))),
            h("span", { class: "spacer" }),
            h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => move(blocks, i, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
            h("button", { class: "icon-btn", title: "Move down", disabled: i === blocks.length - 1, onclick: () => move(blocks, i, 1) }, h("i", { class: "fa-solid fa-arrow-down" })),
            h("button", { class: "icon-btn", title: "Copy this exercise (to paste it in any week or course)", onclick: () => copyToClipboard("block", block) }, h("i", { class: "fa-regular fa-copy" })),
            h("button", { class: "icon-btn danger", title: "Delete block", onclick: () => removeAt(blocks, i, "block") }, h("i", { class: "fa-solid fa-trash" }))),
        h("div", { class: "block-body" },
            h("label", {}, "Instruction", boundInput(block, "instruction", { multiline: true, rows: 2 })),
            h("div", { class: "media-row" },
                h("label", {}, "Reading text file", boundInput(block, "textFile", { placeholder: "e.g. texts/a2_text_1.txt" })),
                h("label", {}, "Video", boundInput(block, "video", { placeholder: "e.g. videos/a2_video1.mp4" })),
                renderAudioList(block)),
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
                        }, h("i", { class: "fa-solid fa-plus" }), t.label.replace(/ \(.*\)/, "")))),
                    renderQuestionPasteBox(block)))
    );
}

// ---------- Add many questions at once ----------
// One question per line:
//   question = answer                       → short answer (small box, checked against the answer)
//   question | A | *B | C                    → multiple choice (* marks the correct option)
//   question                                 → open answer (long box, corrected by AI)
const GAP = "_________________";

function parseQuestionList(text) {
    const questions = [];
    const errors = [];
    text.split("\n").forEach((rawLine, i) => {
        const line = rawLine.trim();
        if (!line) return;
        const lineNo = i + 1;

        if (line.includes("|")) {
            const parts = line.split("|").map((x) => x.trim()).filter(Boolean);
            const question = parts[0] || "";
            const options = parts.slice(1);
            const correct = options.filter((o) => o.startsWith("*"));
            if (!question || options.length < 2) { errors.push(`Line ${lineNo}: a multiple choice needs a question and at least 2 options.`); return; }
            if (correct.length !== 1) { errors.push(`Line ${lineNo}: mark exactly ONE correct option with * (e.g. *B) suis tombé).`); return; }
            const clean = options.map((o) => o.replace(/^\*\s*/, ""));
            questions.push({ type: "mc", text: question, options: clean, answer: correct[0].replace(/^\*\s*/, "") });
        } else if (line.includes("=")) {
            const at = line.indexOf("=");
            const question = line.slice(0, at).trim();
            const answer = line.slice(at + 1).trim();
            if (!question || !answer) { errors.push(`Line ${lineNo}: write it as  question = answer`); return; }
            questions.push({ type: "", text: question.replace(/_{3,}/g, GAP), options: null, answer });
        } else {
            questions.push({ type: "open", text: line.replace(/_{3,}/g, GAP), options: null, answer: "" });
        }
    });
    return { questions, errors };
}

function renderQuestionPasteBox(block) {
    const box = h("textarea", {
        rows: 5,
        "aria-label": "Paste questions",
        placeholder: "Je ____ étudiant. = suis\nJe ____ dans l'escalier. | A) ai tombé | *B) suis tombé | C) suis tomber\nმე ვარ სტუდენტი."
    });
    const preview = h("p", { class: "q-note" });
    const updatePreview = () => {
        const { questions, errors } = parseQuestionList(box.value);
        const count = (t) => questions.filter((q) => q.type === t).length;
        preview.textContent = errors.length ? "⚠ " + errors[0]
            : questions.length ? `Ready: ${count("mc")} multiple choice, ${count("")} short answer, ${count("open")} open answer.` : "";
        preview.classList.toggle("paste-error", errors.length > 0);
    };
    box.addEventListener("input", updatePreview);

    return h("details", { class: "paste-details" },
        h("summary", {}, h("i", { class: "fa-solid fa-paste" }), " Add many questions at once"),
        h("div", { class: "paste-box" },
            h("div", { class: "paste-help" },
                h("div", {}, h("code", {}, "question = answer"), " → short answer (small box)"),
                h("div", {}, h("code", {}, "question | A | *B | C"), " → multiple choice, ", h("b", {}, "*"), " marks the correct option"),
                h("div", {}, h("code", {}, "question"), " (nothing else) → open answer, corrected by AI"),
                h("div", {}, "One question per line. Write the gap with a few underscores: ", h("code", {}, "____"))),
            box,
            preview,
            h("div", {}, h("button", {
                class: "btn btn-outline", onclick: () => {
                    const { questions, errors } = parseQuestionList(box.value);
                    if (errors.length) { toast(errors[0], true); return; }
                    if (questions.length === 0) { toast("Nothing to add.", true); return; }
                    block.questions.push(...questions);
                    markUnsaved(); renderEditor();
                    toast(`${questions.length} questions added. Don't forget to save.`);
                }
            }, "Add these questions"))));
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
            }, h("i", { class: "fa-solid fa-plus" }), "Add prompt")),
        renderPromptPasteBox(prompts));
}

function renderPromptPasteBox(prompts) {
    const box = h("textarea", { rows: 4, "aria-label": "Paste prompts", placeholder: "Présentez-vous.\nDécrivez votre ville.\nQu'est-ce que vous avez fait le week-end dernier ?" });
    return h("details", { class: "paste-details" },
        h("summary", {}, h("i", { class: "fa-solid fa-paste" }), " Add many prompts at once"),
        h("div", { class: "paste-box" },
            h("p", { class: "q-note" }, "One prompt per line."),
            box,
            h("div", {}, h("button", {
                class: "btn btn-outline", onclick: () => {
                    const lines = box.value.split("\n").map((l) => l.trim()).filter(Boolean);
                    if (lines.length === 0) { toast("Nothing to add.", true); return; }
                    // replace the empty prompt that a new speaking block starts with
                    for (let i = prompts.length - 1; i >= 0; i--) if (!(prompts[i].text || "").trim()) prompts.splice(i, 1);
                    prompts.push(...lines.map((text) => ({ type: "", text, answer: "" })));
                    markUnsaved(); renderEditor();
                    toast(`${lines.length} prompts added. Don't forget to save.`);
                }
            }, "Add these prompts"))));
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

    return h("div", { class: `question q-type-${q.type || "short"}` },
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
            }, h("i", { class: "fa-solid fa-plus" }), "Add vocabulary section"),
            renderPasteButton("vocab", (copy) => sections.push(copy))));
}

function renderSection(section, i) {
    const sections = state.week.vocabSections;
    const pasteBox = h("textarea", { placeholder: "Un quartier = უბანი\nAnimé = ცოცხალი", "aria-label": "Paste words" });

    return h("article", { class: "block kind-vocab" },
        h("div", { class: "block-head" },
            h("span", { class: "block-number" }, i + 1),
            h("span", { class: "kind-icon", "aria-hidden": "true" }, h("i", { class: "fa-solid fa-language" })),
            h("strong", {}, `${section.words.length} words`),
            h("span", { class: "spacer" }),
            h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => move(sections, i, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
            h("button", { class: "icon-btn", title: "Move down", disabled: i === sections.length - 1, onclick: () => move(sections, i, 1) }, h("i", { class: "fa-solid fa-arrow-down" })),
            h("button", { class: "icon-btn", title: "Copy this section (to paste it in any week or course)", onclick: () => copyToClipboard("vocab", section) }, h("i", { class: "fa-regular fa-copy" })),
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
        audio: (b.audio || "").split("\n").map((x) => x.trim()).filter(Boolean).join("\n") || null,
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


// =====================================================================
// SECTIONS: Course content / Courses (home page) / Students & scores
// =====================================================================
document.querySelectorAll(".section-btn").forEach((btn) => btn.addEventListener("click", () => openSection(btn.dataset.section)));

async function openSection(section) {
    if (section === state.section) return;
    if (!confirmLeave()) return;
    state.unsaved = false;
    state.section = section;
    document.querySelectorAll(".section-btn").forEach((b) => b.classList.toggle("active", b.dataset.section === section));
    $("contentTools").hidden = section !== "content";

    try {
        if (section === "courses") {
            await loadCourses();
            state.coursesDraft = state.courses.map(courseToDraft);
        }
        if (section === "students") await loadStudentsAndScores();
    } catch (err) { toast(err.message, true); }

    renderSidebar();
    renderEditor();
}

// =====================================================================
// COURSES (HOME PAGE): add, edit, reorder, lock, hide, delete
// =====================================================================
function courseToDraft(c) {
    return {
        id: c.id, name: c.name, level: c.level || "", tag: c.tag || "", description: c.description || "",
        syllabusUrl: c.syllabusUrl || "", isLocked: !!c.isLocked, isVisible: c.isVisible !== false,
        original: JSON.stringify([c.name, c.level || "", c.tag || "", c.description || "", c.syllabusUrl || "", !!c.isLocked, c.isVisible !== false, c.sortOrder])
    };
}

function draftSignature(d, index) {
    return JSON.stringify([d.name, d.level, d.tag, d.description, d.syllabusUrl, d.isLocked, d.isVisible, index + 1]);
}

function renderCoursesManager() {
    const drafts = state.coursesDraft || [];
    const check = (d, key, label, hint) => h("label", { class: "check" },
        h("input", { type: "checkbox", checked: d[key], onchange: (e) => { d[key] = e.target.checked; markUnsaved(); renderEditor(); } }),
        h("span", {}, label), hint ? h("small", {}, hint) : null);

    return h("section", {},
        h("div", { class: "editor-head" },
            h("div", {}, h("p", { class: "course-name" }, "Home page"), h("h1", {}, "Courses")),
            h("div", { class: "head-actions" },
                h("span", { id: "saveState", class: "save-state" }),
                h("button", { class: "btn btn-outline", onclick: addCourseFromManager }, h("i", { class: "fa-solid fa-plus" }), "New course"),
                h("button", { class: "btn btn-primary", id: "saveBtn", onclick: saveCourses }, h("i", { class: "fa-solid fa-floppy-disk" }), "Save changes"))),
        h("p", { class: "rec-note" },
            "These are the course cards on the home page, in this order. ",
            h("b", {}, "Locked"), " courses show a 🔒 and can't be chosen when registering. ",
            h("b", {}, "Hidden"), " courses disappear from the home page, but their content and students are kept. ",
            "The course name must be exactly the one in the Students table; renaming a course here also renames it for its students."),
        drafts.length === 0 ? h("div", { class: "empty" }, h("h2", {}, "No courses yet"), h("p", {}, "Click “New course” to add one.")) : null,
        drafts.map((d, i) => {
            const isDelf = /delf/i.test(d.name);
            return h("article", { class: "block course-admin" + (d.isVisible ? "" : " is-hidden") },
                h("div", { class: "block-head" },
                    h("span", { class: "course-preview" + (isDelf ? " delf" : "") }, d.level || "?", h("small", {}, d.tag)),
                    h("strong", { class: "course-title" }, d.name || "Untitled course"),
                    d.isLocked ? h("span", { class: "pill pill-lock" }, "🔒 Locked") : null,
                    !d.isVisible ? h("span", { class: "pill" }, "Hidden") : null,
                    h("span", { class: "spacer" }),
                    h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => move(drafts, i, -1) }, h("i", { class: "fa-solid fa-arrow-up" })),
                    h("button", { class: "icon-btn", title: "Move down", disabled: i === drafts.length - 1, onclick: () => move(drafts, i, 1) }, h("i", { class: "fa-solid fa-arrow-down" })),
                    h("button", { class: "icon-btn danger", title: "Delete course", onclick: () => deleteCourseFromManager(d) }, h("i", { class: "fa-solid fa-trash" }))),
                h("div", { class: "block-body" },
                    h("div", { class: "course-grid" },
                        h("label", { class: "span-2" }, "Course name (exactly as in the Students table)", boundInput(d, "name")),
                        h("label", {}, "Big letters", boundInput(d, "level", { placeholder: "e.g. A2" })),
                        h("label", {}, "Small word", boundInput(d, "tag", { placeholder: "e.g. სასაუბრო or DELF" }))),
                    h("label", {}, "Short description", boundInput(d, "description", { multiline: true, rows: 2 })),
                    h("label", {}, "Syllabus PDF", boundInput(d, "syllabusUrl", { placeholder: "e.g. pdfs/delf_a2_syllabus.pdf or https://…" })),
                    h("div", { class: "check-row" },
                        check(d, "isVisible", "Show on home page"),
                        check(d, "isLocked", "Locked 🔒", "students can't register for it"))));
        }));
}

async function addCourseFromManager() {
    if (!confirmLeave()) return;
    const name = prompt('Name of the new course (e.g. "B2 - სასაუბრო კურსი"):');
    if (!name || !name.trim()) return;
    try {
        await api("/api/admin/courses", { method: "POST", body: JSON.stringify({ name }) });
        state.unsaved = false;
        await loadCourses();
        state.coursesDraft = state.courses.map(courseToDraft);
        renderSidebar(); renderEditor();
        toast("Course created. It starts locked 🔒: fill in its card, unlock it and save.");
    } catch (err) { toast(err.message, true); }
}

async function deleteCourseFromManager(d) {
    const typed = prompt(`This deletes "${d.name}" with ALL its weeks, exercises, vocabulary and recordings.\nTo only remove it from the home page, untick “Show on home page” instead.\n\nType DELETE to confirm:`);
    if (typed !== "DELETE") return;
    try {
        await api("/api/admin/courses/" + d.id, { method: "DELETE" });
        state.unsaved = false;
        await loadCourses();
        state.coursesDraft = state.courses.map(courseToDraft);
        renderSidebar(); renderEditor();
        toast("Course deleted");
    } catch (err) { toast(err.message, true); }
}

async function saveCourses() {
    const drafts = state.coursesDraft;
    const empty = drafts.find((d) => !d.name.trim());
    if (empty) { toast("Every course needs a name.", true); return; }
    const names = drafts.map((d) => d.name.trim());
    if (new Set(names).size !== names.length) { toast("Two courses have the same name.", true); return; }

    $("saveBtn").disabled = true;
    try {
        for (const [i, d] of drafts.entries()) {
            if (draftSignature(d, i) === d.original) continue;
            await api("/api/admin/courses/" + d.id, {
                method: "PUT",
                body: JSON.stringify({
                    name: d.name.trim(), level: d.level, tag: d.tag, description: d.description,
                    syllabusUrl: d.syllabusUrl, isLocked: d.isLocked, isVisible: d.isVisible, sortOrder: i + 1
                })
            });
        }
        state.unsaved = false;
        await loadCourses();
        state.coursesDraft = state.courses.map(courseToDraft);
        renderSidebar(); renderEditor();
        toast("Saved. The home page shows the changes right away.");
    } catch (err) {
        toast("Not saved: " + err.message, true);
        renderSaveState();
    }
}

// =====================================================================
// STUDENTS & SCORES (public."Students" and public."Scores")
// =====================================================================
const SCORE_FIELDS = [
    { key: "homework", label: "Homework" },
    { key: "vocab1", label: "Vocab 1" },
    { key: "vocab2", label: "Vocab 2" },
    { key: "writing", label: "Writing" },
    { key: "speaking", label: "Speaking" }
];

const studentsUi = { tab: "students", search: "", course: "", group: "", edit: null, scoresDraft: {}, scoresOriginal: {} };

async function loadStudentsAndScores() {
    const [students, scores] = await Promise.all([api("/api/admin/students"), api("/api/admin/scores")]);
    state.students = students || [];
    studentsUi.scoresOriginal = {};
    (scores || []).forEach((s) => { studentsUi.scoresOriginal[String(s.student_id)] = s; });
    studentsUi.scoresDraft = {};
    state.students.forEach((st) => {
        const sc = studentsUi.scoresOriginal[String(st.id)] || {};
        studentsUi.scoresDraft[String(st.id)] = Object.fromEntries(SCORE_FIELDS.map((f) => [f.key, sc[f.key] ?? ""]));
    });
    if (!state.courses.length) await loadCourses();
}

function studentName(st) {
    return `${st.firstName || ""} ${st.lastName || ""}`.trim() || "(no name)";
}

function filteredStudents() {
    const q = studentsUi.search.trim().toLowerCase();
    return state.students.filter((st) => {
        if (studentsUi.course && (st.course || "").trim() !== studentsUi.course) return false;
        if (studentsUi.group && String(st.group_number ?? 1) !== studentsUi.group) return false;
        if (!q) return true;
        return [st.id, st.firstName, st.lastName, st.email].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
}

function scoreTotal(draft) {
    return SCORE_FIELDS.reduce((sum, f) => sum + (parseFloat(draft[f.key]) || 0), 0);
}

function renderStudentsManager() {
    const isScores = studentsUi.tab === "scores";
    const courseNames = [...new Set([...state.courses.map((c) => c.name), ...state.students.map((s) => (s.course || "").trim()).filter(Boolean)])];
    const groups = [...new Set(state.students.map((s) => String(s.group_number ?? 1)))].sort((a, b) => a - b);
    const list = filteredStudents();

    const toolbar = h("div", { class: "student-toolbar" },
        h("input", {
            type: "search", placeholder: "Search name, email or ID…", "aria-label": "Search students", value: studentsUi.search,
            oninput: (e) => { studentsUi.search = e.target.value; redrawStudentTable(); }
        }),
        h("select", { "aria-label": "Filter by course", onchange: (e) => { studentsUi.course = e.target.value; redrawStudentTable(); } },
            h("option", { value: "" }, "All courses"),
            courseNames.map((n) => h("option", { value: n, selected: n === studentsUi.course }, n))),
        h("select", { "aria-label": "Filter by group", onchange: (e) => { studentsUi.group = e.target.value; redrawStudentTable(); } },
            h("option", { value: "" }, "All groups"),
            groups.map((g) => h("option", { value: g, selected: g === studentsUi.group }, "Group " + g))),
        !isScores ? h("button", { class: "btn btn-outline", onclick: () => startEditStudent(null) }, h("i", { class: "fa-solid fa-user-plus" }), "Add student") : null);

    return h("section", {},
        h("div", { class: "editor-head" },
            h("div", {}, h("p", { class: "course-name" }, `${state.students.length} students`), h("h1", {}, "Students & scores")),
            h("div", { class: "head-actions" },
                isScores ? h("span", { id: "saveState", class: "save-state" }) : null,
                isScores ? h("button", { class: "btn btn-primary", id: "saveBtn", onclick: saveAllScores }, h("i", { class: "fa-solid fa-floppy-disk" }), "Save scores") : null)),
        h("div", { class: "tabs", role: "tablist" },
            ["students", "scores"].map((t) => h("button", {
                class: "tab" + (studentsUi.tab === t ? " active" : ""), role: "tab", "aria-selected": studentsUi.tab === t ? "true" : "false",
                onclick: () => { if (t !== studentsUi.tab && confirmLeave()) { state.unsaved = false; studentsUi.tab = t; studentsUi.edit = null; renderEditor(); } }
            }, t === "students" ? "Students" : "Scores (evaluation)"))),
        !isScores && studentsUi.edit ? renderStudentForm(courseNames) : null,
        toolbar,
        h("div", { id: "studentTableWrap", class: "table-scroll" }, isScores ? renderScoresTable(list) : renderStudentsTable(list)));
}

function redrawStudentTable() {
    const wrap = $("studentTableWrap");
    if (!wrap) return;
    const list = filteredStudents();
    wrap.replaceChildren(studentsUi.tab === "scores" ? renderScoresTable(list) : renderStudentsTable(list));
}

function renderStudentsTable(list) {
    if (list.length === 0) return h("div", { class: "empty" }, h("h2", {}, "No students found"), h("p", {}, "Change the filters or add a student."));
    return h("table", { class: "data-table" },
        h("thead", {}, h("tr", {}, ["ID", "Name", "Email", "Course", "Group", "Birthday", "Account", "Active", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, list.map((st) => h("tr", { class: st.is_active === false ? "inactive" : "" },
            h("td", { class: "mono" }, st.id),
            h("td", {}, h("strong", {}, studentName(st))),
            h("td", {}, st.email || ""),
            h("td", {}, st.course || ""),
            h("td", {}, st.group_number ?? 1),
            h("td", {}, st.birthday || ""),
            h("td", {}, st.auth_id ? h("span", { class: "pill pill-ok", title: st.auth_id }, "Registered") : h("span", { class: "pill" }, "Not yet")),
            h("td", {}, h("input", {
                type: "checkbox", checked: st.is_active !== false, "aria-label": `Active: ${studentName(st)}`,
                onchange: (e) => quickToggleActive(st, e.target)
            })),
            h("td", {}, h("button", { class: "btn btn-ghost", onclick: () => startEditStudent(st) }, h("i", { class: "fa-solid fa-pen" }), "Edit"))))));
}

async function quickToggleActive(st, checkbox) {
    const value = checkbox.checked;
    checkbox.disabled = true;
    try {
        const row = await api(`/api/admin/students/${encodeURIComponent(st.id)}`, { method: "PUT", body: JSON.stringify({ is_active: value }) });
        Object.assign(st, row);
        toast(`${studentName(st)}: ${value ? "access enabled" : "access blocked"}`);
        redrawStudentTable();
    } catch (err) {
        checkbox.checked = !value;
        toast(err.message, true);
    } finally { checkbox.disabled = false; }
}

function startEditStudent(st) {
    if (studentsUi.edit && !confirmLeave()) return;
    state.unsaved = false;
    studentsUi.edit = st
        ? { isNew: false, originalId: String(st.id), data: { ...st, group_number: st.group_number ?? 1, is_active: st.is_active !== false } }
        : { isNew: true, data: { id: String(Math.floor(1000000000 + Math.random() * 9000000000)), firstName: "", lastName: "", email: "", birthday: "", course: studentsUi.course || "", group_number: 1, is_active: true, auth_id: "" } };
    renderEditor();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStudentForm(courseNames) {
    const ed = studentsUi.edit;
    const d = ed.data;
    const field = (label, key, attrs = {}) => h("label", {}, label, h("input", {
        ...attrs, value: d[key] ?? "",
        oninput: (e) => { d[key] = attrs.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value; markUnsaved(); }
    }));
    const birthdayIsIso = !d.birthday || /^\d{4}-\d{2}-\d{2}/.test(String(d.birthday));
    if (birthdayIsIso && d.birthday) d.birthday = String(d.birthday).slice(0, 10);

    return h("article", { class: "block student-form" },
        h("div", { class: "block-head" },
            h("strong", {}, ed.isNew ? "New student" : `Edit: ${studentName(d)}`),
            h("span", { class: "spacer" }),
            h("button", { class: "icon-btn", title: "Close", onclick: () => { if (confirmLeave()) { state.unsaved = false; studentsUi.edit = null; renderEditor(); } } }, h("i", { class: "fa-solid fa-xmark" }))),
        h("div", { class: "block-body" },
            h("div", { class: "course-grid" },
                field("Student ID", "id", { readonly: !ed.isNew, title: ed.isNew ? "" : "The ID can't be changed (the scores are linked to it)" }),
                field("First name", "firstName"),
                field("Last name", "lastName"),
                field("Email", "email", { type: "email" }),
                field("Birthday", "birthday", { type: birthdayIsIso ? "date" : "text" }),
                h("label", {}, "Course", h("select", {
                    onchange: (e) => { d.course = e.target.value; markUnsaved(); }
                },
                    h("option", { value: "", selected: !d.course }, "— no course —"),
                    [...new Set([...courseNames, (d.course || "").trim()].filter(Boolean))]
                        .map((n) => h("option", { value: n, selected: (d.course || "").trim() === n }, n)))),
                field("Group", "group_number", { type: "number", min: 1, step: 1 }),
                h("label", { class: "check check-inline" },
                    h("input", { type: "checkbox", checked: d.is_active !== false, onchange: (e) => { d.is_active = e.target.checked; markUnsaved(); } }),
                    h("span", {}, "Active (can use the website)"))),
            h("label", {}, "Account link (auth_id)",
                h("input", { value: d.auth_id ?? "", placeholder: "Filled automatically when the student registers", oninput: (e) => { d.auth_id = e.target.value; markUnsaved(); } }),
                h("small", { class: "q-note" }, "Empty it to unlink the account (for example if the student registered with the wrong email).")),
            h("div", { class: "add-row" },
                h("button", { class: "btn btn-primary", onclick: saveStudent }, h("i", { class: "fa-solid fa-floppy-disk" }), ed.isNew ? "Add student" : "Save student"),
                !ed.isNew ? h("button", { class: "btn btn-ghost danger", onclick: deleteStudent }, h("i", { class: "fa-solid fa-trash" }), "Delete student") : null)));
}

async function saveStudent() {
    const ed = studentsUi.edit;
    const d = ed.data;
    if (!String(d.id || "").trim()) { toast("The student needs an ID.", true); return; }
    if (!String(d.email || "").trim()) { toast("The student needs an email.", true); return; }
    const body = {
        id: /^\d+$/.test(String(d.id).trim()) ? Number(String(d.id).trim()) : String(d.id).trim(),
        firstName: (d.firstName || "").trim(), lastName: (d.lastName || "").trim(), email: (d.email || "").trim().toLowerCase(),
        birthday: d.birthday || null, course: d.course || null,
        group_number: d.group_number === "" ? 1 : Number(d.group_number), is_active: d.is_active !== false,
        auth_id: (d.auth_id || "").trim() || null
    };
    if (!ed.isNew) delete body.id;
    try {
        if (ed.isNew) await api("/api/admin/students", { method: "POST", body: JSON.stringify(body) });
        else await api(`/api/admin/students/${encodeURIComponent(ed.originalId)}`, { method: "PUT", body: JSON.stringify(body) });
        state.unsaved = false;
        studentsUi.edit = null;
        await loadStudentsAndScores();
        renderEditor();
        toast(ed.isNew ? "Student added" : "Student saved");
    } catch (err) { toast("Not saved: " + err.message, true); }
}

async function deleteStudent() {
    const ed = studentsUi.edit;
    if (!confirm(`Delete ${studentName(ed.data)} and their scores?\n(Their login account stays in Supabase → Authentication.)`)) return;
    try {
        await api(`/api/admin/students/${encodeURIComponent(ed.originalId)}`, { method: "DELETE" });
        state.unsaved = false;
        studentsUi.edit = null;
        await loadStudentsAndScores();
        renderEditor();
        toast("Student deleted");
    } catch (err) { toast(err.message, true); }
}

function renderScoresTable(list) {
    if (list.length === 0) return h("div", { class: "empty" }, h("h2", {}, "No students found"), h("p", {}, "Change the filters."));
    return h("table", { class: "data-table scores-table" },
        h("thead", {}, h("tr", {},
            h("th", {}, "Student"), h("th", {}, "Course"), h("th", {}, "Group"),
            SCORE_FIELDS.map((f) => h("th", { class: "num" }, f.label)),
            h("th", { class: "num" }, "Total / 100"))),
        h("tbody", {}, list.map((st) => {
            const key = String(st.id);
            const draft = studentsUi.scoresDraft[key] || (studentsUi.scoresDraft[key] = {});
            const totalCell = h("td", { class: "num total" });
            const showTotal = () => {
                const t = scoreTotal(draft);
                totalCell.textContent = Math.round(t * 10) / 10;
                totalCell.classList.toggle("over", t > 100);
            };
            showTotal();
            return h("tr", { class: st.is_active === false ? "inactive" : "" },
                h("td", {}, h("strong", {}, studentName(st)), h("div", { class: "mono small" }, st.id)),
                h("td", {}, st.course || ""),
                h("td", {}, st.group_number ?? 1),
                SCORE_FIELDS.map((f) => h("td", { class: "num" }, h("input", {
                    type: "number", min: 0, step: "0.5", value: draft[f.key] ?? "", "aria-label": `${f.label}: ${studentName(st)}`,
                    oninput: (e) => { draft[f.key] = e.target.value; showTotal(); markUnsaved(); }
                }))),
                totalCell);
        })));
}

async function saveAllScores() {
    const changed = state.students.filter((st) => {
        const key = String(st.id);
        const draft = studentsUi.scoresDraft[key] || {};
        const orig = studentsUi.scoresOriginal[key] || {};
        return SCORE_FIELDS.some((f) => String(draft[f.key] ?? "") !== String(orig[f.key] ?? ""));
    });
    if (changed.length === 0) { toast("Nothing changed."); return; }

    $("saveBtn").disabled = true;
    try {
        for (const st of changed) {
            const draft = studentsUi.scoresDraft[String(st.id)];
            const body = { Name: studentName(st) };
            SCORE_FIELDS.forEach((f) => { body[f.key] = draft[f.key] === "" ? null : Number(draft[f.key]); });
            await api(`/api/admin/scores/${encodeURIComponent(st.id)}`, { method: "PUT", body: JSON.stringify(body) });
        }
        state.unsaved = false;
        await loadStudentsAndScores();
        renderEditor();
        toast(`Saved scores of ${changed.length} student(s). They see them right away.`);
    } catch (err) {
        toast("Not saved: " + err.message, true);
        renderSaveState();
    }
}

// =====================================================================
// SEVERAL AUDIO FILES PER EXERCISE (kept one per line in the same field)
// =====================================================================
function renderAudioList(block) {
    const files = (block.audio || "").split("\n");
    if (files.length === 0) files.push("");
    const save = () => { block.audio = files.join("\n"); markUnsaved(); };

    return h("div", { class: "audio-list" },
        h("span", { class: "audio-label" }, files.filter((f) => f.trim()).length > 1 ? `Audio (${files.filter((f) => f.trim()).length} files)` : "Audio"),
        files.map((file, k) => h("div", { class: "audio-row" },
            h("input", {
                value: file, placeholder: k === 0 ? "e.g. audio/a2_audio1.mp3" : "another audio file",
                "aria-label": `Audio file ${k + 1}`,
                oninput: (e) => { files[k] = e.target.value; save(); }
            }),
            files.length > 1 ? h("button", {
                class: "icon-btn danger", title: "Remove this audio",
                onclick: () => { files.splice(k, 1); save(); renderEditor(); }
            }, h("i", { class: "fa-solid fa-xmark" })) : null)),
        h("button", {
            class: "btn btn-ghost audio-add", onclick: () => { files.push(""); block.audio = files.join("\n"); renderEditor(); }
        }, h("i", { class: "fa-solid fa-plus" }), "Add audio file"));
}

// =====================================================================
// COPY / PASTE an exercise (or a vocabulary section) between weeks and courses
// The copy is kept in this browser until you copy something else.
// =====================================================================
const CLIPBOARD_KEY = "lingono-admin-clipboard";

function readClipboard() {
    try { return JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || "null"); } catch (e) { return null; }
}

function copyToClipboard(kind, item) {
    const data = kind === "block"
        ? {
            instruction: item.instruction || "", type: item.type || null,
            textFile: item.textFile || null, video: item.video || null, audio: item.audio || null,
            questions: (item.questions || []).map((q) => ({ type: q.type || "", text: q.text || "", options: q.options ? [...q.options] : null, answer: q.answer || "" }))
        }
        : { instruction: item.instruction || "", words: (item.words || []).map((w) => ({ french: w.french || "", georgian: w.georgian || "" })) };
    const label = kind === "block"
        ? (BLOCK_KINDS.find((k) => k.value === (item.type || ""))?.label || "Exercise")
        : `Vocabulary (${data.words.length} words)`;
    const from = `${state.week.courseName}, week ${state.week.number}`;
    try {
        localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ kind, data, label, from }));
    } catch (e) { toast("Could not copy (browser storage is blocked).", true); return; }
    renderEditor();
    toast(`Copied. Open any week of any course and click “Paste”.`);
}

function renderPasteButton(kind, add) {
    const clip = readClipboard();
    if (!clip || clip.kind !== kind) return null;
    return h("button", {
        class: "btn btn-paste", title: `Copied from ${clip.from}`,
        onclick: () => {
            add(JSON.parse(JSON.stringify(clip.data)));
            markUnsaved(); renderEditor();
            toast(`Pasted from ${clip.from}. Don't forget to save.`);
        }
    }, h("i", { class: "fa-solid fa-paste" }), `Paste: ${clip.label}`, h("small", {}, clip.from));
}

// =====================================================================
// Text boxes grow with their text, so long questions are fully visible
// =====================================================================
function autosize(el) {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
}
function autosizeAll() {
    document.querySelectorAll("#editor textarea").forEach(autosize);
}
new MutationObserver(() => requestAnimationFrame(autosizeAll)).observe($("editor"), { childList: true });
document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("#editor textarea")) autosize(e.target); });
window.addEventListener("resize", () => requestAnimationFrame(autosizeAll));
