// ============================================================
// Course content now comes from the C# API instead of being
// written inside the website. The API only sends the course
// the logged-in student is enrolled in.
// ============================================================
const dataset = {};        // exercises (used by js/pages/exercice.js)
const vocabDataset = {};   // vocabulary (used by js/pages/vocab.js)

async function loadCourseContent(kind) {
    try {
        const content = await api("/api/content/" + kind);   // "exercises" or "vocab"
        Object.assign(kind === "exercises" ? dataset : vocabDataset, content);
    } catch (err) {
        console.error("Could not load course content:", err);
        alert("კურსის მასალის ჩატვირთვა ვერ მოხერხდა. სცადეთ თავიდან.");
    }
}
