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
                .reduce((sum, k) => sum + parseInt(sc[k] || 0, 10), 0);
            document.getElementById('headerStudentScore').innerText = total;
            document.getElementById('headerStudentScoreBox').style.display = 'inline-block';
        }
    } catch (err) {
        console.error(err);
    }
}
