// ============================================================
// HOME PAGE COURSE CARDS — now managed from admin.html
// The cards, the lock 🔒, the syllabus links and the course list
// of the registration form come from the database.
// If the API can't be reached, the cards written in index.html stay.
// ============================================================
let courseCatalog = null;   // [{ name, level, tag, description, syllabusUrl, isLocked }]

function courseCardId(name) {
    return 'card_' + String(name || '').trim().replace(/^delf/i, 'DELF').replace(/ /g, '_');
}

function escapeCourseText(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCourseCards() {
    const grid = document.querySelector('main .grid');
    if (!grid || !courseCatalog) return;

    grid.innerHTML = courseCatalog.map(c => `
        <div class="card" id="${escapeCourseText(courseCardId(c.name))}">
            <div>
                <div class="level-mark" aria-hidden="true">${escapeCourseText(c.level || '')}<small>${escapeCourseText(c.tag || '')}</small></div>
                <h2>${escapeCourseText(c.name)}</h2>
                <p>${escapeCourseText(c.description || '')}</p>
            </div>
            <button class="btn syllabus-link" data-syllabus="${escapeCourseText(c.syllabusUrl || '')}"><i class="fa-solid fa-download"></i>სილაბუსის ნახვა</button>
        </div>`).join('');

    applyCourseLocks();

    // keep the student's own course highlighted (it was set by the student card)
    const myCourse = (document.getElementById('spCourse')?.textContent || '').trim();
    if (myCourse && myCourse !== '—') {
        const myCard = document.getElementById(courseCardId(myCourse));
        if (myCard) myCard.classList.add('my-course');
    }
}

function applyCourseLocks() {
    if (!courseCatalog) return false;
    courseCatalog.forEach(c => {
        const card = document.getElementById(courseCardId(c.name));
        if (!card) return;
        card.classList.toggle('blocked-course', !!c.isLocked);
        const btn = card.querySelector('.btn');
        if (btn) c.isLocked ? btn.setAttribute('disabled', 'true') : btn.removeAttribute('disabled');
    });
    return true;
}

// Registration form: only the courses that are open
function renderRegistrationCourses() {
    const select = document.getElementById('courseInput');
    if (!select || !courseCatalog) return;
    const chosen = select.value;
    select.innerHTML = '<option value="" disabled selected>აირჩიეთ სასურველი კურსი</option>' +
        courseCatalog.filter(c => !c.isLocked)
            .map(c => `<option value="${escapeCourseText(c.name)}">${escapeCourseText(c.name)}</option>`).join('');
    if (chosen && courseCatalog.some(c => c.name === chosen && !c.isLocked)) select.value = chosen;
}

// The old functions used fixed lists of courses: now they use the database
const _handleCourseAccessFixed = handleCourseAccess;
handleCourseAccess = function (courseName) {
    studentCurrentCourse = courseName;
    if (!applyCourseLocks()) _handleCourseAccessFixed(courseName);
};
const _clearCourseFiltersFixed = clearCourseFilters;
clearCourseFilters = function () {
    if (!applyCourseLocks()) _clearCourseFiltersFixed();
};

// Syllabus buttons (works for cards created later too)
document.querySelector('main .grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.syllabus-link');
    if (!btn || !btn.dataset.syllabus) return;   // old cards keep their own handler
    e.stopImmediatePropagation();
    window.open(btn.dataset.syllabus, '_blank');
}, true);

(async function loadCourseCatalog() {
    try {
        courseCatalog = await api('/api/public/courses');
        renderCourseCards();
        renderRegistrationCourses();
    } catch (err) {
        console.warn('Course list could not be loaded, keeping the built-in cards.', err);
        courseCatalog = null;
    }
})();
