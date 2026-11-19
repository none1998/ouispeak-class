// ============================================================
// Helpers used by several pages. Needs _supabase, which each
// page creates at the top of its own js/pages/*.js file.
// ============================================================
async function loadHeaderScore(userEmail) {
    try {
        const { data: student } = await _supabase
            .from('Students')
            .select('id, firstName, lastName')
            .eq('email', userEmail)
            .maybeSingle();
        if (!student) return;

        document.getElementById('headerStudentName').innerText = `${student.firstName} ${student.lastName}`;

        let { data: sc } = await _supabase
            .from('scores')
            .select('homework, vocab1, vocab2, writing, speaking')
            .eq('student_id', student.id)
            .maybeSingle();

        if (!sc) {
            ({ data: sc } = await _supabase
                .from('Scores')
                .select('homework, vocab1, vocab2, writing, speaking')
                .eq('student_id', student.id)
                .maybeSingle());
        }

        if (sc) {
            const total = ['homework', 'vocab1', 'vocab2', 'writing', 'speaking']
                .reduce((sum, k) => sum + (parseFloat(String(sc[k] ?? 0).replace(',', '.')) || 0), 0);
            document.getElementById('headerStudentScore').innerText = String(Math.round(total * 10) / 10).replace('.', ',');
            document.getElementById('headerStudentScoreBox').style.display = 'inline-block';
        }
    } catch (err) {
        console.error(err);
    }
}

// ------------------------------------------------------------
// Adds the "თამაშები" (games) link to the menu of every page,
// so the HTML of each page doesn't need to change.
// ------------------------------------------------------------
(function addGamesLink() {
    const add = () => {
        const nav = document.querySelector(".nav-links");
        if (!nav || nav.querySelector('a[href$="games.html"]')) return;
        const li = document.createElement("li");
        li.innerHTML = '<a href="games.html">თამაშები</a>';
        const scores = nav.querySelector("#scoresNavLink");
        nav.insertBefore(li, scores ? scores.closest("li") : null);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
})();
