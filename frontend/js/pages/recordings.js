        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Recording links now come from the C# API: only the student's own course AND group.
        let courseLinksDatabase = {};

        let currentStudentCourse = null;
        let currentSelectedWeek = null;


                async function checkUserSession() {
            try {
                const { data: { session }, error } = await _supabase.auth.getSession();
                if (error || !session) { window.location.href = "index.html"; return; }
                
                const { data: studentData, error: dbError } = await _supabase
                    .from('Students')
                    .select('course, is_active')
                    .eq('auth_id', session.user.id)
                    .single();

                if (dbError || !studentData) {
                    document.getElementById('userCourseBadge').innerText = "სტუდენტი არ არის ნაპოვნი";
                    renderWeeksGrid();
                    return;
                }

                if (studentData.is_active === false) {
                    await _supabase.auth.signOut();
                    window.location.href = "index.html";
                    return;
                }

                currentStudentCourse = studentData.course ? studentData.course.trim() : null;
                if (currentStudentCourse) {
                    try {
                        courseLinksDatabase = { [currentStudentCourse]: await api("/api/content/recordings") };
                    } catch (err) {
                        console.error("Could not load recordings:", err);
                    }
                }
                document.getElementById('userCourseBadge').innerText = currentStudentCourse || "კურსი არ არის მინიჭებული";
                renderWeeksGrid();
            } catch (err) {
                console.error(err);
                window.location.href = "index.html";
            }
        }

        function renderWeeksGrid() {
            const weeksGrid = document.getElementById('weeksGrid');
            if (!weeksGrid) return;
            weeksGrid.innerHTML = ''; 

            const activeDatabase = courseLinksDatabase[currentStudentCourse] || {};

            for (let i = 1; i <= 26; i++) {
                const card = document.createElement('div');
                card.className = 'week-card';
                card.innerText = `კვირა ${i}`;
                
                const weekData = activeDatabase[`week_${i}`];
                const hasLinks = weekData && (weekData.lesson_1 || weekData.lesson_2);
                
                if (!hasLinks) {
                    card.classList.add('blocked');
                } else {
                    card.addEventListener('click', () => showModal(i));
                }
                weeksGrid.appendChild(card);
            }
        }

        function showModal(weekNumber) {
            currentSelectedWeek = weekNumber;
            document.getElementById('modalWeekTitle').innerText = `კვირა ${weekNumber}`;
            
            // Update download button path dynamically based on chosen course and week number
            const downloadBtn = document.getElementById('modalDownloadBtn');
            if (downloadBtn) {
                let fileName = `gakvetili${weekNumber}.pdf`;

                if (currentStudentCourse === "A1 - სასაუბრო კურსი") {
                    fileName = `a1_combine_kv${weekNumber}.pdf`;
                } else if (currentStudentCourse === "A2 - სასაუბრო კურსი") {
                    fileName = `a2_combine_kv${weekNumber}.pdf`;
                } else if (currentStudentCourse === "DELF A2 - კურსი") {
                    fileName = `a2_delf_combine_kv${weekNumber}.pdf`;
                } else if (currentStudentCourse === "DELF B1 - კურსი") {
                    fileName = `b1_delf_combine_kv${weekNumber}.pdf`;
                }

                downloadBtn.href = `files/${fileName}`;
            }

            document.getElementById('glacialOverlay').classList.add('open');
        }

        function hideModal() {
            document.getElementById('glacialOverlay').classList.remove('open');
        }

        function closeModal(event) {
            if (event.target.id === 'glacialOverlay') {
                hideModal();
            }
        }

        function playLesson(lessonNumber) {
            if (!currentStudentCourse || !currentSelectedWeek) return;
            
            const activeDatabase = courseLinksDatabase[currentStudentCourse] || {};
            const weekData = activeDatabase[`week_${currentSelectedWeek}`];
            const rawUrl = lessonNumber === 1 ? weekData.lesson_1 : weekData.lesson_2;

            if (!rawUrl) {
                alert("ამ გაკვეთილის ჩანაწერი ჯერჯერობით არ არის ატვირთული.");
                return;
            }
            window.open(rawUrl, '_blank');
        }

        async function handleLogout() {
            await _supabase.auth.signOut();
            window.location.href = "index.html";
        }

        window.addEventListener('DOMContentLoaded', checkUserSession);
        _supabase.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) {
            loadHeaderScore(data.session.user.email);
        }
    });
    
