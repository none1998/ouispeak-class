        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let studentCurrentCourse = null;
        let currentLoadedEmail = null; 
        let isFetchingScores = false;  

        async function handleLogout() {
            await _supabase.auth.signOut();
            window.location.href = "index.html";
        }

                function updateUI(session) {
            if (session && session.user) {
                document.getElementById('authRequiredMessage').style.display = 'none';
                document.getElementById('protectedContent').style.display = 'block';
                document.getElementById('logoutBtn').style.display = 'block';
                
                if (currentLoadedEmail !== session.user.email && !isFetchingScores) {
                    isFetchingScores = true;
                    fetchAndDisplayScores(session.user.email).finally(() => {
                        currentLoadedEmail = session.user.email;
                        isFetchingScores = false;
                    });
                }
            } else {
                document.getElementById('authRequiredMessage').style.display = 'block';
                document.getElementById('protectedContent').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'none';
                studentCurrentCourse = null;
                currentLoadedEmail = null;
            }
        }

        _supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                updateUI(null);
                return;
            }
            updateUI(session);
        });

        async function fetchAndDisplayScores(userEmail) {
            try {
                const { data: student, error: studentError } = await _supabase
                    .from('Students')
                    .select('id, firstName, lastName, course, is_active')
                    .eq('email', userEmail)
                    .maybeSingle();

                if (studentError || !student) return;

                if (student.is_active === false) {
                    await _supabase.auth.signOut();
                    alert("პლატფორმაზე წვდომა შეგეზღუდათ დავალიანების გამო.");
                    window.location.href = "index.html";
                    return;
                }

                studentCurrentCourse = student.course;
                document.getElementById('studentName').innerText = `${student.firstName} ${student.lastName}`;
                document.getElementById('headerStudentName').innerText = `${student.firstName} ${student.lastName}`;
                document.getElementById('studentCourse').innerHTML = `<i class="fas fa-graduation-cap"></i> კურსი: ${student.course}`;
                document.getElementById('studentIdDisplay').innerHTML = `<i class="fas fa-id-card"></i> ID: ${student.id}`;

                const { data: scoresData } = await _supabase
                    .from('scores')
                    .select('homework, vocab1, vocab2, writing, speaking')
                    .eq('student_id', student.id)
                    .maybeSingle();

                let finalData = scoresData;

                if (!finalData) {
                    const { data: scoresData2 } = await _supabase
                        .from('Scores')
                        .select('homework, vocab1, vocab2, writing, speaking')
                        .eq('student_id', student.id)
                        .maybeSingle();
                    finalData = scoresData2;
                }

                if (finalData) {
                    document.getElementById('score_homework').innerText = parseInt(finalData.homework || 0, 10);
                    document.getElementById('score_vocab1').innerText = parseInt(finalData.vocab1 || 0, 10);
                    document.getElementById('score_vocab2').innerText = parseInt(finalData.vocab2 || 0, 10);
                    document.getElementById('score_writing').innerText = parseInt(finalData.writing || 0, 10);
                    document.getElementById('score_speaking').innerText = parseInt(finalData.speaking || 0, 10);
                    const total = (parseInt(finalData.homework || 0, 10) + parseInt(finalData.vocab1 || 0, 10) + parseInt(finalData.vocab2 || 0, 10) + parseInt(finalData.writing || 0, 10) + parseInt(finalData.speaking || 0, 10));
                    document.getElementById('totalScore').innerText = total;
                    document.getElementById('headerStudentScore').innerText = total;
                    document.getElementById('headerStudentScoreBox').style.display = 'inline-block';
                }

            } catch (err) {
                console.error("სისტემური კრიტიკული შეცდომა:", err);
            }
        }

        document.getElementById('exercisesNavLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (!studentCurrentCourse) {
                alert("გთხოვთ ჯერ გაიაროთ ავტორიზაცია კურსზე წვდომისთვის.");
                return;
            }
            window.location.href = "exercice.html";
        });
        
        document.getElementById('vocabNavLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (!studentCurrentCourse) {
                alert("გთხოვთ ჯერ გაიაროთ ავტორიზაცია კურსზე წვდომისთვის.");
                return;
            }
            window.location.href = "vocab.html";
        });

    
