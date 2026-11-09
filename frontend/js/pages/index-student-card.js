        /* =========================================================
           STUDENT INFO CARD (display only)
           This block only READS data and fills the new card.
           The original script above is unchanged.
           ========================================================= */
        (function () {
            const RING_LENGTH = 2 * Math.PI * 52;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const $ = (id) => document.getElementById(id);

            const ring = $('spRing');
            ring.style.strokeDasharray = RING_LENGTH;
            ring.style.strokeDashoffset = RING_LENGTH;

            let shownScore = null;

            function showScore(value) {
                const tile = $('spScoreTile');
                if (value === null) {
                    $('spScore').textContent = '—';
                    $('spScoreNote').textContent = 'შეფასება ჯერ არ არის';
                    ring.style.strokeDashoffset = RING_LENGTH;
                    shownScore = null;
                    return;
                }
                if (value === shownScore) return;
                shownScore = value;

                const pct = Math.max(0, Math.min(value, 100)) / 100;
                ring.style.strokeDashoffset = RING_LENGTH * (1 - pct);
                $('spScoreNote').textContent = 'თქვენი მიმდინარე შეფასება';

                if (reduceMotion) {
                    $('spScore').textContent = value;
                } else {
                    const start = performance.now();
                    const step = (now) => {
                        const t = Math.min((now - start) / 1400, 1);
                        const eased = 1 - Math.pow(1 - t, 3);
                        $('spScore').textContent = Math.round(value * eased);
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }

                tile.classList.remove('score-arrived');
                void tile.offsetWidth;
                tile.classList.add('score-arrived');
            }

            /* The score comes from the existing loadHeaderScore() via the header pill */
            function mirrorHeaderScore() {
                const box = $('headerStudentScoreBox');
                if (box.style.display === 'inline-block') {
                    showScore(parseInt($('headerStudentScore').innerText, 10) || 0);
                } else {
                    showScore(null);
                }
            }

            new MutationObserver(mirrorHeaderScore).observe($('headerStudentScoreBox'), {
                attributes: true, childList: true, subtree: true, characterData: true
            });

            async function loadStudentCard(email) {
                try {
                    const { data: student } = await _supabase
                        .from('Students')
                        .select('id, firstName, lastName, course')
                        .eq('email', email)
                        .maybeSingle();
                    if (!student) return;

                    const first = student.firstName || '';
                    const last = student.lastName || '';
                    $('spName').textContent = `${first} ${last}`.trim() || '—';
                    $('spAvatar').textContent = ((first[0] || '') + (last[0] || '')).toUpperCase() || '–';
                    $('spId').textContent = student.id ?? '—';
                    $('spCourse').textContent = student.course || '—';

                    document.querySelectorAll('.grid .card.my-course').forEach(c => c.classList.remove('my-course'));
                    if (student.course) {
                        const myCard = document.getElementById('card_' + student.course.trim().replace(/^delf/i, 'DELF').replace(/ /g, '_'));
                        if (myCard) myCard.classList.add('my-course');
                    }
                } catch (err) {
                    console.error(err);
                }
            }

            _supabase.auth.onAuthStateChange((event, session) => {
                if (session && session.user) {
                    setTimeout(() => loadStudentCard(session.user.email), 0);
                } else {
                    $('spName').textContent = 'იტვირთება…';
                    $('spAvatar').textContent = '–';
                    $('spId').textContent = '—';
                    $('spCourse').textContent = '—';
                    document.querySelectorAll('.grid .card.my-course').forEach(c => c.classList.remove('my-course'));
                }
            });
        })();
    
