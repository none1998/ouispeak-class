        /* =========================================================
           STUDENT CARD + SCORE CARDS (display only)
           Reads what the original script writes into the page and
           shows it in the new design. No database calls, no changes
           to the original script above.
           ========================================================= */
        (function () {
            const RING_LENGTH = 2 * Math.PI * 52;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const $ = (id) => document.getElementById(id);
            const watch = (el, fn) => {
                new MutationObserver(fn).observe(el, { childList: true, subtree: true, characterData: true });
                fn();
            };
            const afterColon = (el) => {
                const text = el.innerText || el.textContent || '';
                const i = text.indexOf(':');
                return (i >= 0 ? text.slice(i + 1) : text).trim() || '—';
            };

            /* Name and initials */
            watch($('studentName'), () => {
                const parts = $('studentName').textContent.trim().split(/\s+/).filter(Boolean);
                $('spAvatar').textContent = parts.map(p => p[0]).slice(0, 2).join('').toUpperCase() || '–';
            });

            /* ID and course */
            watch($('studentIdDisplay'), () => { $('spId').textContent = afterColon($('studentIdDisplay')); });
            watch($('studentCourse'), () => { $('spCourse').textContent = afterColon($('studentCourse')); });

            /* Total score ring */
            const ring = $('spRing');
            ring.style.strokeDasharray = RING_LENGTH;
            ring.style.strokeDashoffset = RING_LENGTH;
            let firstTotal = true;

            new MutationObserver(() => {
                const value = parseInt($('totalScore').textContent, 10) || 0;
                const pct = Math.max(0, Math.min(value, 100)) / 100;
                ring.style.strokeDashoffset = RING_LENGTH * (1 - pct);
                $('spScoreNote').textContent = 'თქვენი მიმდინარე შეფასება';

                if (reduceMotion) {
                    $('spScore').textContent = value;
                } else {
                    const start = performance.now();
                    const step = (now) => {
                        const t = Math.min((now - start) / 1400, 1);
                        $('spScore').textContent = Math.round(value * (1 - Math.pow(1 - t, 3)));
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }

                if (firstTotal) {
                    firstTotal = false;
                    $('spScoreTile').classList.add('score-arrived');
                }
            }).observe($('totalScore'), { childList: true, subtree: true, characterData: true });

            /* Progress bars on the five score cards */
            document.querySelectorAll('#scoresGrid .score-card').forEach(card => {
                const max = parseInt(card.dataset.max, 10) || 100;
                const valueEl = card.querySelector('.score-points span[id^="score_"]');
                watch(valueEl, () => {
                    const value = parseInt(valueEl.textContent, 10) || 0;
                    card.style.setProperty('--pct', Math.max(0, Math.min(value / max, 1)) * 100);
                });
            });
        })();
    
