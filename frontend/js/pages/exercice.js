        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let studentCourse = null;
        let authenticatedUserEmail = "";
        let currentActiveBlock = 1;

        // Object to cache user input states globally across multiple exercise blocks
        const userAnswersCache = {};
        const validationResultsCache = {};

        // Number of exercise blocks in a week. It comes from the database (admin page), so it is no longer fixed at 6.
        function getBlockCount(subject) {
            const weekKey = subject || document.getElementById('subjectSelect').value;
            const week = dataset[studentCourse]?.[weekKey];
            if (!week) return 0;
            const numbers = Object.keys(week).map(Number).filter(n => !isNaN(n));
            return numbers.length ? Math.max(...numbers) : 0;
        }

        // Builds the "Exercice 1, 2, 3 ..." buttons for the blocks of the selected week
        function buildExerciseSidebar(subject) {
            const sidebar = document.getElementById('exerciseSidebar');
            const count = Math.max(getBlockCount(subject), 1);
            sidebar.innerHTML = "";
            for (let b = 1; b <= count; b++) {
                const btn = document.createElement('button');
                btn.className = "sidebar-item" + (b === 1 ? " active" : "");
                btn.textContent = `Exercice ${b}`;
                btn.addEventListener('click', () => loadExerciseBlock(b));
                sidebar.appendChild(btn);
            }
        }





        function normalizeShortAnswer(str) {
            return (str || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        }

        function stripAccents(str) {
            return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }

        function getFormattingFeedback(studentAns, targetAns, isSentenceStart = false) {
            const s = (studentAns || "").trim();
            const t = (targetAns || "").trim();
            if (s === t) return "";

            let notes = [];
            const sStrip = stripAccents(s);
            const tStrip = stripAccents(t);

            if (s !== t && sStrip.toLowerCase() === tStrip.toLowerCase()) {
                const sCase = sStrip;
                const tCase = tStrip;
                
                if (sCase !== tCase) {
                    if (isSentenceStart && s.charAt(0) !== s.charAt(0).toUpperCase() && t.charAt(0) === t.charAt(0).toUpperCase()) {
                        notes.push("სიტყვა უნდა დაიწყო დიდი ასოთი (წინადადების დასაწყისში)");
                    } else if (!isSentenceStart && s.charAt(0) === s.charAt(0).toUpperCase() && t.charAt(0) !== t.charAt(0).toUpperCase()) {
                        notes.push("სიტყვა უნდა დაიწყო პატარა ასოთი თუ ის წინადადების შუაშია");
                    } else {
                        notes.push("დაიცავი დიდი და პატარა ასოების მართლწერა");
                    }
                }

                if (sStrip !== s || tStrip !== t) {
                    if (s.toLowerCase() !== t.toLowerCase()) {
                        notes.push(`სიტყვა უნდა დაიწეროს სწორი მახვილებით: "${t}"`);
                    }
                }
            }

            if (notes.length > 0) {
                return " თუმცა გაითვალისწინე, რომ " + notes.join(" და ") + ".";
            }
            return "";
        }


        function showError(msg) {
            const errBox = document.getElementById('authError');
            errBox.innerText = msg.message || msg || "დაფიქსირდა შეცდომა";
            errBox.style.display = "block";
        }

        async function handleAuthSubmit(email, password, studentId) {
            const { data: authData, error: authError } = await _supabase.auth.signInWithPassword({ email, password });
            if (authError) return showError(authError);

            const { data: studentData, error: dbError } = await _supabase
                .from('Students')
                .select('id, course, is_active')
                .eq('id', studentId)
                .eq('email', email)
                .maybeSingle();

            if (dbError || !studentData) {
                await _supabase.auth.signOut();
                return showError("არასწორი სტუდენტის ID ან ელ-ფოსტა.");
            }

            if (studentData.is_active === false) {
                await _supabase.auth.signOut();
                return showError("პლატფორმაზე წვდომა შეგეზღუდათ დავალიანების გამო. გთხოვთ, დაუკავშირდეთ ადმინისტრაციას.");
            }

            checkUserSession();
        }

        function submitForm(e) {
            e.preventDefault();
            document.getElementById('authError').style.display = "none";
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            const studentId = document.getElementById('studentIdInput').value;
            handleAuthSubmit(email, password, studentId);
        }

        async function handleLogout() {
            await _supabase.auth.signOut();
            checkUserSession();
            location.reload();
        }

        async function checkUserSession() {
            const { data: { session } } = await _supabase.auth.getSession();
            
            if (session) {
                // Query using your exact database table schema names
                const { data: studentData, error } = await _supabase
                    .from('Students') // Notice the capital 'S'
                    .select('course, is_active')
                    .eq('auth_id', session.user.id) // Matching on your custom auth_id column
                    .single();

                // If the student was found but is explicitly set to inactive
                if (!error && studentData && studentData.is_active === false) {
                    alert("თქვენი პროფილი დეაქტივირებულია. გთხოვთ, მიმართოთ ადმინისტრატორს.");
                    await _supabase.auth.signOut();
                    location.reload();
                    return;
                }

                // Standard workflow for active profiles
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('protectedContent').style.display = 'block';
                document.getElementById('logoutBtn').style.display = 'block';
                
                authenticatedUserEmail = session.user.email;
                
                if (!error && studentData) {
                    studentCourse = studentData.course;
                    await loadCourseContent("exercises");
                    document.getElementById('studentIdInput').value = session.user.id;
                    loadSubjects();
                }
            } else {
                document.getElementById('authSection').style.display = 'block';
                document.getElementById('protectedContent').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'none';
            }
        }

        function handleSubjectChange() {
            const selectElement = document.getElementById('subjectSelect');
            const selectedValue = selectElement.value;
            const titleElement = document.getElementById('exerciseTitle');
            const sidebar = document.getElementById('exerciseSidebar');
            const sendBtn = document.querySelector('.send-answers-btn');
            const downloadBtn = document.getElementById('downloadWordBtn');
            const feedback = document.getElementById('resultFeedback');

            // Reset cache when changing weeks
            for (let prop in userAnswersCache) { delete userAnswersCache[prop]; }
            for (let prop in validationResultsCache) { delete validationResultsCache[prop]; }

            // Restore previously saved progress (from browser storage) for the selected week
            restoreSavedProgress(selectedValue);

            if (!selectedValue) {
                titleElement.innerText = studentCourse ? `${studentCourse} - სავარჯიშოები` : "ონლაინ სავარჯიშოები";
                sidebar.style.display = "none";
                if (sendBtn) sendBtn.style.display = "none";
                if (downloadBtn) downloadBtn.style.display = "none";
                document.getElementById('exerciseQuestionsContainer').innerHTML = '<div class="instruction-box">გთხოვთ აირჩიოთ კვირა და სავარჯიშო ბლოკი.</div>';
                feedback.innerHTML = "";
                return;
            }

            sidebar.style.display = "flex"; 
            const selectedText = selectElement.options[selectElement.selectedIndex].text;
            titleElement.innerText = `${studentCourse || ''} - ${selectedText}`;
            buildExerciseSidebar(selectedValue);
            loadExerciseBlock(1); 
        }

        // ===== Progress saving (browser localStorage) =====
        function getProgressStorageKey(subject) {
            return `ouispeak_progress_${authenticatedUserEmail || 'guest'}_${studentCourse || 'nocourse'}_${subject}`;
        }

        function saveProgressToBrowser() {
            const subject = document.getElementById('subjectSelect').value;
            const status = document.getElementById('saveProgressStatus');
            if (!subject) return;
            saveCurrentBlockAnswersToCache();
            try {
                localStorage.setItem(getProgressStorageKey(subject), JSON.stringify(userAnswersCache));
                status.style.color = "#10b981";
                status.innerHTML = '<i class="fa-solid fa-circle-check"></i> შენახულია!';
            } catch (e) {
                console.error("Saving progress failed:", e);
                status.style.color = "#ef4135";
                status.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> შენახვა ვერ მოხერხდა.';
            }
            setTimeout(() => { status.innerHTML = ""; }, 3000);
        }

        function restoreSavedProgress(subject) {
            const saveBtn = document.getElementById('saveProgressBtn');
            if (saveBtn) saveBtn.style.display = subject ? "inline-flex" : "none";
            if (!subject) return;
            try {
                const saved = localStorage.getItem(getProgressStorageKey(subject));
                if (saved) Object.assign(userAnswersCache, JSON.parse(saved));
            } catch (e) {
                console.error("Restoring progress failed:", e);
            }
        }

        function saveCurrentBlockAnswersToCache() {
            const subject = document.getElementById('subjectSelect').value;
            if (!studentCourse || !dataset[studentCourse] || !dataset[studentCourse][subject]) return;
            
            const prevBlockData = dataset[studentCourse][subject][currentActiveBlock];
            if (!prevBlockData) return;

            const cacheKeyPrefix = `${subject}_block_${currentActiveBlock}`;

            if (prevBlockData.type === "essay") {
                const essayTextarea = document.getElementById('essayTextarea');
                if (essayTextarea) {
                    userAnswersCache[`${cacheKeyPrefix}_essay`] = essayTextarea.value;
                }
            } else {
                const questions = prevBlockData.questions || [];
                questions.forEach((q, index) => {
                    if (q.type === "mc" || q.type === "vf") {
                        const checkedRadio = document.querySelector(`input[name="question_choice_${index}"]:checked`);
                        if (checkedRadio) {
                            userAnswersCache[`${cacheKeyPrefix}_q_${index}`] = checkedRadio.value;
                        }
                    } else {
                        const input = document.getElementById(`input_q_${index}`);
                        if (input) {
                            userAnswersCache[`${cacheKeyPrefix}_q_${index}`] = input.value;
                        }
                    }
                });
            }
        }

        function loadExerciseBlock(blockNumber) {
            saveCurrentBlockAnswersToCache();
            currentActiveBlock = blockNumber;
            const items = document.querySelectorAll('.sidebar-item');
            items.forEach((item, index) => {
                if ((index + 1) === blockNumber) item.classList.add('active');
                else item.classList.remove('active');
            });
            renderExercise();
        }

        function updateWordCount() {
            const textarea = document.getElementById('essayTextarea');
            if (!textarea) return;
            const text = textarea.value.trim();
            const words = text ? text.split(/\s+/).length : 0;
            document.getElementById('wordCounter').innerText = `სიტყვების რაოდენობა: ${words}`;
        }

        function renderExercise() {
            const subject = document.getElementById('subjectSelect').value;
            const container = document.getElementById('exerciseQuestionsContainer');
            const sendBtn = document.querySelector('.send-answers-btn');
            const downloadBtn = document.getElementById('downloadWordBtn');
            document.getElementById('resultFeedback').innerHTML = "";

            // Strictly show actions layout buttons only at the end of the final (6th) exercice block interface window
            if (currentActiveBlock === getBlockCount()) {
                if (sendBtn) sendBtn.style.display = "inline-flex";
                if (downloadBtn) downloadBtn.style.display = "inline-flex";
            } else {
                if (sendBtn) sendBtn.style.display = "none";
                if (downloadBtn) downloadBtn.style.display = "none";
            }

            if (!studentCourse || !dataset[studentCourse] || !dataset[studentCourse][subject] || !dataset[studentCourse][subject][currentActiveBlock]) {
                container.innerHTML = `<div class="instruction-box" style="border-left-color: var(--secondary); color: var(--secondary);">ამ კვირის სავარჯიშოები მიმდინარე კურსისთვის ჯერ არ არის დამატებული.</div>`;
                return;
            }

            const blockData = dataset[studentCourse][subject][currentActiveBlock]; 
            const instruction = blockData.instruction;
            const cacheKeyPrefix = `${subject}_block_${currentActiveBlock}`;
            
            container.innerHTML = `<div class="instruction-box">${instruction}</div>`;

            // Case 1: Essay Block
            if (blockData.type === "essay") {
                const cachedEssayValue = userAnswersCache[`${cacheKeyPrefix}_essay`] || "";
                const essayDiv = document.createElement('div');
                essayDiv.className = "form-group";
                essayDiv.style.marginTop = "1.5rem";
                essayDiv.innerHTML = `
                    <textarea id="essayTextarea" class="essay-textarea-input" placeholder="დაწერეთ თქვენი ესე აქ..." oninput="updateWordCount()">${cachedEssayValue}</textarea>
                    <div id="wordCounter" class="word-counter-view">სიტყვების რაოდენობა: 0</div>
                `;
                container.appendChild(essayDiv);
                updateWordCount();
                return;
            }

            // Inject audio player if present
            // (several audio files can be given, one per line)
            if (blockData.audio) {
                const audioFiles = String(blockData.audio).split("\n").map(a => a.trim()).filter(Boolean);
                audioFiles.forEach((src, n) => {
                    const audioDiv = document.createElement('div');
                    audioDiv.className = "audio-player-container";
                    if (audioFiles.length > 1) {
                        const label = document.createElement('div');
                        label.className = "audio-player-label";
                        label.textContent = `აუდიო ${n + 1}`;
                        audioDiv.appendChild(label);
                    }
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.src = src;
                    audioDiv.appendChild(audio);
                    container.appendChild(audioDiv);
                });
            }

            // Inject video player if present
            if (blockData.video) {
                const videoDiv = document.createElement('div');
                videoDiv.className = "video-player-container";
                videoDiv.innerHTML = `<video controls src="${blockData.video}"></video>`;
                container.appendChild(videoDiv);
            }

            // Inject text file presentation box if present
            if (blockData.textFile) {
                const textDiv = document.createElement('div');
                textDiv.className = "text-file-container";
                textDiv.innerText = "იტვირთება ტექსტი...";
                fetch(blockData.textFile)
                    .then(res => {
                        if (!res.ok) throw new Error("File not found");
                        return res.text();
                    })
                    .then(data => {
                        textDiv.innerText = data;
                    })
                    .catch(err => {
                        console.error(err);
                        textDiv.innerText = "ტექსტის ჩატვირთვა ვერ მოხერხდა.";
                    });
                container.appendChild(textDiv);
            }

            // Matching (French ↔ Georgian) and speaking (voice recording) blocks have their own design
            if (blockData.type === "match") {
                renderMatchingBlock(container, blockData, cacheKeyPrefix);
                return;
            }
            if (blockData.type === "speaking") {
                renderSpeakingBlock(container, blockData, cacheKeyPrefix);
                return;
            }

            // General Questions Render Loop
            const questions = blockData.questions || [];
            questions.forEach((q, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.className = "exercise-sentence-item";
                const cachedAnswerValue = userAnswersCache[`${cacheKeyPrefix}_q_${index}`] || "";
                const valObj = validationResultsCache[`${cacheKeyPrefix}_q_${index}`];
                
                if (q.type === "mc" || q.type === "vf") {
                    questionDiv.appendChild(document.createTextNode(`${index + 1}. ${q.text}`));
                    const optionsGroup = document.createElement('div');
                    optionsGroup.className = "options-group";
                    
                    q.options.forEach(opt => {
                        const label = document.createElement('label');
                        label.className = "option-label";
                        
                        const radio = document.createElement('input');
                        radio.type = "radio";
                        radio.name = `question_choice_${index}`;
                        radio.value = opt;
                        radio.className = "choice-radio-input";
                        radio.dataset.correctAnswer = q.answer;
                        if (cachedAnswerValue === opt) {
                            radio.checked = true;
                            if (valObj !== undefined) {
                                label.classList.add(valObj.isCorrect ? 'correct-choice' : 'incorrect-choice');
                            }
                        }
                        
                        label.appendChild(radio);
                        label.appendChild(document.createTextNode(` ${opt}`));
                        optionsGroup.appendChild(label);
                    });
                    questionDiv.appendChild(optionsGroup);
                } else {
                    const parts = q.text.split("_________________");
                    questionDiv.appendChild(document.createTextNode(`${index + 1}. `));
                    
                    // Allow to easily modify width via inline style as requested
                    if (q.text.includes("<br>")) {
                        const labelSpan = document.createElement('span');
                        labelSpan.innerHTML = parts[0];
                        questionDiv.appendChild(labelSpan);
                    } else {
                        questionDiv.appendChild(document.createTextNode(parts[0]));
                    }
                    
                    // The answer box depends ONLY on the question type (chosen in the admin page):
                    //   "open"   -> long box (several lines), corrected by AI
                    //   others   -> small box for a short answer, checked against the correct answer
                    const isOpenAnswer = q.type === "open";
                    const input = document.createElement(isOpenAnswer ? 'textarea' : 'input');
                    if (isOpenAnswer) {
                        input.className = "blank-input open-answer-input";
                        input.rows = 3;
                    } else {
                        input.type = "text";
                        input.className = "blank-input";
                        input.style.width = "150px";
                    }
                    
                    input.dataset.correctAnswer = q.answer;
                    input.id = `input_q_${index}`;
                    input.autocomplete = "off";
                    input.value = cachedAnswerValue;
                    
                    if (valObj !== undefined) {
                        input.classList.add(valObj.isCorrect ? 'correct' : 'incorrect');
                    }
                    
                    questionDiv.appendChild(input);
                    if (parts[1]) {
                        if (q.text.includes("<br>")) {
                            const remainingSpan = document.createElement('span');
                            remainingSpan.innerHTML = parts[1];
                            questionDiv.appendChild(remainingSpan);
                        } else {
                            questionDiv.appendChild(document.createTextNode(parts[1]));
                        }
                    }
                }

                if (valObj !== undefined) {
                    const badge = document.createElement('div');
                    badge.style.marginTop = "0.35rem";
                    badge.style.fontSize = "0.92rem";
                    badge.style.fontWeight = "600";
                    if (valObj.isCorrect) {
                        badge.style.color = "#10b981";
                        badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> სწორია!${valObj.feedback ? `<span style="color: #64748b; font-weight: 500;">${valObj.feedback}</span>` : ""}`;
                    } else {
                        badge.style.color = "#ef4135";
                        const answerHint = q.answer ? ` (სწორი პასუხი: ${q.answer})` : "";
                        badge.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> არასწორია!${answerHint}`;
                    }
                    questionDiv.appendChild(badge);
                }
                
                container.appendChild(questionDiv);
            });
        }

        function evaluateAllExercisesLive() {
            const subject = document.getElementById('subjectSelect').value;
            let fullStructuredPayload = "";

            for (let b = 1; b <= getBlockCount(); b++) {
                const blockData = dataset[studentCourse]?.[subject]?.[b];
                if (!blockData) {
                    fullStructuredPayload += `\n=========================================\nExercice ${b}: (მონაცემები არ არის დამატებული)\n=========================================\n`;
                    continue;
                }

                fullStructuredPayload += `\n=========================================\nExercice ${b}: ${blockData.instruction}\n=========================================\n`;
                const cacheKeyPrefix = `${subject}_block_${b}`;

                if (blockData.type === "essay") {
                    let textContent = "";
                    if (b === currentActiveBlock) {
                        const essayTextarea = document.getElementById('essayTextarea');
                        textContent = essayTextarea ? essayTextarea.value.trim() : "";
                    } else {
                        textContent = (userAnswersCache[`${cacheKeyPrefix}_essay`] || "").trim();
                    }
                    const wordsCount = textContent ? textContent.split(/\s+/).length : 0;
                    fullStructuredPayload += `ესეს ტიპის დავალება:\nსიტყვების რაოდენობა: ${wordsCount}\nტექსტი:\n${textContent || "(ცარიელი)"}\n`;
                } else {
                    const questions = blockData.questions || [];
                    questions.forEach((q, index) => {
                        let studentAns = "";
                        if (b === currentActiveBlock) {
                            if (q.type === "mc" || q.type === "vf") {
                                const checkedRadio = document.querySelector(`input[name="question_choice_${index}"]:checked`);
                                studentAns = checkedRadio ? checkedRadio.value : "";
                            } else {
                                const input = document.getElementById(`input_q_${index}`);
                                studentAns = input ? input.value : "";
                            }
                        } else {
                            studentAns = userAnswersCache[`${cacheKeyPrefix}_q_${index}`] || "";
                        }

                        const trimmedStudentAns = studentAns.trim();
                        const displayAns = trimmedStudentAns || "______";

                        let statusSuffix = "";

                        // Evaluate only short-answer questions, MC, and VF with defined answers (case and accent insensitive)
                        if (q.type === "mc" || q.type === "vf" || (q.answer && q.answer.trim() !== "")) {
                            const isCorrect = normalizeShortAnswer(trimmedStudentAns) === normalizeShortAnswer(q.answer);
                            
                            const isSentenceStart = q.text ? (q.text.trim().startsWith("_________________") || q.text.trim().startsWith("<br>_________________")) : false;
                            const formattingNote = isCorrect ? getFormattingFeedback(trimmedStudentAns, q.answer, isSentenceStart) : "";
                            
                            validationResultsCache[`${cacheKeyPrefix}_q_${index}`] = {
                                isCorrect: isCorrect,
                                feedback: formattingNote
                            };

                            if (isCorrect) {
                                statusSuffix = ` -> [სწორია! ✅${formattingNote ? formattingNote : ""}]`;
                            } else {
                                statusSuffix = ` -> [არასწორია! ❌ (სწორი პასუხი: ${q.answer})]`;
                            }
                        }

                        const originalText = q.text.replace(/<br>/g, " ");
                        const completedSentence = originalText.includes("_________________") ? 
                            originalText.replace("_________________", ` [ ${displayAns} ] `) : 
                            `${originalText} -> პასუხი: [ ${displayAns} ]`;

                        fullStructuredPayload += `${index + 1}: ${completedSentence}${statusSuffix}\n`;
                    });
                }
            }

            renderExercise();
            return { payload: fullStructuredPayload };
        }

        function sendAnswersToEmail() {
            saveCurrentBlockAnswersToCache();
            const subjectSelect = document.getElementById('subjectSelect');
            const subject = subjectSelect.value;
            const selectedWeek = subjectSelect.options[subjectSelect.selectedIndex].text;
            const studentId = document.getElementById('studentIdInput').value || "N/A";
            const feedback = document.getElementById('resultFeedback');

            feedback.innerHTML = `<span style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> იგზავნება...</span>`;

            // Instant synchronous evaluation for short answers
            const resultsData = evaluateAllExercisesLive();

            // EmailJS Integration Area
            emailjs.init("ubHY-_bGG6-4A4a3d");

            const templateParams = {
                to_email: "ouispeakinfo@gmail.com",
                from_email: authenticatedUserEmail, 
                student_id: studentId,
                course: studentCourse,
                week: selectedWeek,
                exercise_block: `ყველა ბლოკი (1-${getBlockCount()})`,
                answers_payload: resultsData.payload
            };

            emailjs.send("service_4k5phem", "template_dpz0tuk", templateParams)
                .then(() => {
                    feedback.innerHTML = `<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> ყველა სავარჯიშოს პასუხები წარმატებით გაიგზავნა!</span>`;
                }, (error) => {
                    console.error("Email delivery failed:", error);
                    feedback.innerHTML = `<span style="color: var(--secondary);"><i class="fa-solid fa-circle-xmark"></i> გაგზავნა ვერ მოხერხდა. სცადეთ მოგვიანებით.</span>`;
                });
        }

        function downloadWordFile() {
            saveCurrentBlockAnswersToCache();
            const subjectSelect = document.getElementById('subjectSelect');
            const selectedWeek = subjectSelect.options[subjectSelect.selectedIndex].text;
            
            // Loop and compile logs for all 6 exercises blocks
            let fullStructuredPayload = "";
            for (let b = 1; b <= getBlockCount(); b++) {
                const blockData = dataset[studentCourse]?.[subjectSelect.value]?.[b];
                if (!blockData) continue;
                fullStructuredPayload += `\n=========================================\nExercice ${b}: ${blockData.instruction}\n=========================================\n`;
                const cacheKeyPrefix = `${subjectSelect.value}_block_${b}`;

                if (blockData.type === "essay") {
                    const textContent = (userAnswersCache[`${cacheKeyPrefix}_essay`] || "").trim();
                    const wordsCount = textContent ? textContent.split(/\s+/).length : 0;
                    fullStructuredPayload += `ესეს ტიპის დავალება:\nსიტყვების რაოდენობა: ${wordsCount}\nტექსტი:\n${textContent || "(ცარიელი)"}\n`;
                } else {
                    const questions = blockData.questions || [];
                    questions.forEach((q, index) => {
                        const studentAns = userAnswersCache[`${cacheKeyPrefix}_q_${index}`] || "";
                        const trimmedStudentAns = studentAns.trim();
                        const displayAns = trimmedStudentAns || "______";
                        const originalText = q.text.replace(/<br>/g, " ");
                        const completedSentence = originalText.includes("_________________") ? 
                            originalText.replace("_________________", ` [ ${displayAns} ] `) : 
                            `${originalText} -> პასუხი: [ ${displayAns} ]`;
                        fullStructuredPayload += `${index + 1}: ${completedSentence}\n`;
                    });
                }
            }
            
            // Generate clean standard web-doc architecture schema data layout string stream
            const headerInfo = `OuiSpeak სავარჯიშოების ანგარიში\nკურსი: ${studentCourse || 'N/A'}\nკვირა: ${selectedWeek}\nსტუდენტის ID: ${document.getElementById('studentIdInput').value || 'N/A'}\n-----------------------------------------\n`;
            const finalStringContent = headerInfo + fullStructuredPayload;
            
            const blob = new Blob([finalStringContent], { type: "application/msword;charset=utf-8" });
            const downloadUrl = URL.createObjectURL(blob);
            
            const temporaryAnchor = document.createElement('a');
            temporaryAnchor.href = downloadUrl;
            temporaryAnchor.download = `${studentCourse || 'OuiSpeak'}_${selectedWeek}_Exercises.doc`;
            document.body.appendChild(temporaryAnchor);
            temporaryAnchor.click();
            document.body.removeChild(temporaryAnchor);
            URL.revokeObjectURL(downloadUrl);
        }

        // ===== AI correction (translation & essay exercises only) =====
        // Checking runs once, after the student clicks the send button at the end of Exercice 6.
        // The Gemini key is NOT stored in this page. It lives as a secret inside the Supabase Edge Function below.
        const AI_CORRECTION_ENDPOINT = `${SUPABASE_URL}/functions/v1/gemini-correct`;
        // Models are tried in order; if the first is busy/unavailable the next one is used automatically
        const AI_CORRECTION_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

        // Stores AI results (key -> { answer, res }) so they can be shown again and added to the email
        const aiCorrectionCache = {};
        let aiCheckInProgress = false;

        function aiEscapeHtml(str) {
            return String(str === undefined || str === null ? "" : str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\n/g, "<br>");
        }

        function aiGetCurrentBlockInfo() {
            const subject = document.getElementById('subjectSelect').value;
            if (!studentCourse || !dataset[studentCourse] || !dataset[studentCourse][subject]) return null;
            const blockData = dataset[studentCourse][subject][currentActiveBlock];
            if (!blockData) return null;
            return { subject, blockData, cacheKeyPrefix: `${subject}_block_${currentActiveBlock}` };
        }

        // Translation questions that have no fixed answer in the code are corrected by AI
        function aiIsTranslationQuestion(q) {
            return q && q.type === "open" && (!q.answer || q.answer.trim() === "");
        }

        function aiBuildFeedbackHtml(res) {
            if (res.delf) return delfBuildCardHtml(res.delf, res);
            if (res.simple) return feedbackBuildCardHtml(res.simple, res);
            if (res.is_correct) {
                return `<div class="ai-fb ai-fb-correct"><i class="fa-solid fa-circle-check"></i> სწორია, ყოჩაღ!</div>`;
            }
            return `<div class="ai-fb ai-fb-wrong">
                <div class="ai-fb-title"><i class="fa-solid fa-circle-xmark"></i> არასწორია</div>
                <div><strong>შეცდომები:</strong> ${aiEscapeHtml(res.errors)}</div>
                <div class="ai-fb-right"><strong>სწორი ვერსია:</strong> ${aiEscapeHtml(res.correct)}</div>
            </div>`;
        }

        function aiShowFeedback(parentEl, res, boxId) {
            const old = parentEl.querySelector(`[data-ai-box="${boxId}"]`);
            if (old) old.remove();
            const holder = document.createElement('div');
            holder.setAttribute('data-ai-box', boxId);
            holder.innerHTML = aiBuildFeedbackHtml(res);
            parentEl.appendChild(holder);
        }

        function aiHideFeedback(parentEl, boxId) {
            const old = parentEl.querySelector(`[data-ai-box="${boxId}"]`);
            if (old) old.remove();
        }

        function aiSleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // ---------- One robust way to ask the AI ----------
        // - every attempt has a time limit (a stuck request no longer blocks for minutes)
        // - on overload / time-out it switches to the other model straight away
        // - when Gemini says "too many requests", it waits as long as Gemini asks
        const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/gemini-delf`;

        async function aiRequest(promptText, { audio = [], thinking = "off", timeoutMs = 40000, maxTotalMs = 120000 } = {}) {
            let token = SUPABASE_ANON_KEY;
            try {
                const { data } = await _supabase.auth.getSession();
                if (data && data.session && data.session.access_token) token = data.session.access_token;
            } catch (e) { /* fall back to the anon key */ }

            const started = Date.now();
            const models = [AI_CORRECTION_MODELS[0], AI_CORRECTION_MODELS[1], AI_CORRECTION_MODELS[0], AI_CORRECTION_MODELS[1]];
            let lastError = new Error("AI request failed");

            for (let attempt = 0; attempt < models.length; attempt++) {
                const timeLeft = maxTotalMs - (Date.now() - started);
                if (timeLeft < 5000) break;
                const limit = Math.min(timeoutMs, timeLeft);
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), limit);
                try {
                    const response = await fetch(AI_ENDPOINT, {
                        method: "POST",
                        signal: controller.signal,
                        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
                        body: JSON.stringify({ model: models[attempt], prompt: promptText, audio, thinking, timeoutMs: limit - 3000 })
                    });

                    if (response.status === 429) {
                        lastError = new Error("Gemini 429: too many requests");
                        const wait = Math.min(Number(response.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1), 20000);
                        await aiSleep(wait);
                        continue;
                    }
                    if ([404, 500, 502, 503, 504].includes(response.status)) {
                        lastError = new Error(`Gemini ${response.status} (${models[attempt]})`);
                        await aiSleep(800);
                        continue;
                    }
                    if (!response.ok) throw new Error(`Gemini error ${response.status}`);

                    const data = await response.json();
                    const parts = data?.candidates?.[0]?.content?.parts || [];
                    const raw = parts.filter(p => !p.thought).map(p => p.text || "").join("").replace(/```json|```/g, "").trim();
                    return JSON.parse(raw);
                } catch (err) {
                    // time-out, network hiccup or unreadable reply -> try again (other model)
                    if (err.name === "AbortError" || err instanceof TypeError || err instanceof SyntaxError) {
                        lastError = err.name === "AbortError" ? new Error(`AI time-out after ${Math.round(limit / 1000)}s`) : err;
                        continue;
                    }
                    throw err;
                } finally {
                    clearTimeout(timer);
                }
            }
            throw lastError;
        }

        // Short tasks (translations): no "thinking", quick time limit
        async function aiCallGemini(promptText) {
            return aiRequest(promptText, { thinking: "off", timeoutMs: 40000, maxTotalMs: 120000 });
        }

        function aiBuildTranslationPrompt(instruction, items) {
            return `You are a kind but precise French teacher for Georgian-speaking students.
The exercise instruction (in Georgian) is: "${instruction}"
From this instruction and the sentences, work out the translation direction (Georgian -> French or French -> Georgian).
Below is a JSON list of items. "source" is the sentence to translate, "student_answer" is the student's translation.

For EACH item decide whether the student's translation is correct. Check grammar, conjugation, agreement, articles, word order, spelling and accents, and meaning.
- Accept any natural, correct alternative translation (it does not have to match a single reference).
- Ignore a missing or different final punctuation mark and capital letter at the start.
- If it is correct: is_correct = true, errors = "", correct = "".
- If it is wrong: is_correct = false, "errors" = a SHORT explanation IN GEORGIAN (max 2 short sentences) of exactly what is wrong (quote the wrong word/form and give the correct form, e.g. "viennet (ორთოგრაფია: viennent)"), and "correct" = the full correct translation in the target language.

Reply ONLY with JSON in this exact shape, with one object per item and the same "index" values:
{"results":[{"index":0,"is_correct":true,"errors":"","correct":""}]}

Items:
${JSON.stringify(items)}`;
        }

        // All translation sentences of the week in ONE prompt, grouped by exercise
        function aiBuildMultiTranslationPrompt(items) {
            const groups = [];
            items.forEach(it => {
                let g = groups.find(x => x.block === it.block);
                if (!g) groups.push(g = { block: it.block, instruction: it.instruction, items: [] });
                g.items.push({ id: it.id, source: it.source, student_answer: it.student_answer });
            });
            return `You are a kind but precise French teacher for Georgian-speaking students.
Below are translation exercises. For each exercise, work out the translation direction (Georgian -> French or French -> Georgian) from its instruction (in Georgian) and its sentences.
"source" is the sentence to translate, "student_answer" is the student's translation.

For EACH item decide whether the student's translation is correct. Check grammar, conjugation, agreement, articles, word order, spelling and accents, and meaning.
- Accept any natural, correct alternative translation (it does not have to match a single reference).
- Ignore a missing or different final punctuation mark and capital letter at the start.
- If it is correct: is_correct = true, errors = "", correct = "".
- If it is wrong: is_correct = false, "errors" = a SHORT explanation IN GEORGIAN (max 2 short sentences) of exactly what is wrong (quote the wrong word/form and give the correct form, e.g. "viennet (ორთოგრაფია: viennent)"), and "correct" = the full correct translation in the target language.

Reply ONLY with JSON in this exact shape, with one object per item and the same "id" values:
{"results":[{"id":0,"is_correct":true,"errors":"","correct":""}]}

Exercises:
${JSON.stringify(groups.map(g => ({ instruction: g.instruction, items: g.items })))}`;
        }

        function aiBuildEssayPrompt(instruction, text) {
            return `You are a kind but precise French teacher for Georgian-speaking students.
The writing task given to the student (in Georgian) is: "${instruction}"
Here is the student's text:
"""
${text}
"""

Check whether the text fulfils the task, and check grammar, conjugation, agreement, articles, vocabulary, word order, spelling and accents.
- If everything is correct: is_correct = true, errors = "", correct = "".
- If there are mistakes: is_correct = false, "errors" = a concise list IN GEORGIAN of each mistake (quote the wrong part and give the correction in one short line per mistake; use line breaks between mistakes; also say if the task requirements are not met, e.g. fewer sentences than asked), and "correct" = the full corrected version of the student's text in French.

Reply ONLY with JSON in this exact shape:
{"is_correct":true,"errors":"","correct":""}`;
        }

        // ---------- "Please wait" overlay ----------
        function aiShowOverlay(total) {
            aiHideOverlay();
            const overlay = document.createElement('div');
            overlay.id = "aiOverlay";
            overlay.className = "ai-overlay";
            overlay.setAttribute('role', 'alertdialog');
            overlay.setAttribute('aria-live', 'polite');
            overlay.innerHTML = `
                <div class="ai-overlay-card">
                    <div class="ai-orb"><span></span><span></span><span></span></div>
                    <h2 class="ai-overlay-title">გთხოვთ მოიცადოთ,</h2>
                    <p class="ai-overlay-text">მიმდინარეობს პასუხების შემოწმება</p>
                    <div class="ai-overlay-progress-track"><div class="ai-overlay-progress-fill" id="aiOverlayFill"></div></div>
                    <div class="ai-overlay-count" id="aiOverlayCount"></div>
                    <div class="ai-overlay-note">გვერდი არ დახუროთ</div>
                </div>
            `;
            document.body.appendChild(overlay);
            const page = document.querySelector('.premium-container-box');
            if (page) page.inert = true;
            document.body.style.overflow = "hidden";
            aiUpdateOverlay(0, total);
        }

        function aiUpdateOverlay(done, total) {
            const fill = document.getElementById('aiOverlayFill');
            const count = document.getElementById('aiOverlayCount');
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            if (fill) fill.style.width = Math.max(pct, 6) + "%";
            if (count) count.innerText = `${done} / ${total}`;
        }

        function aiHideOverlay() {
            const overlay = document.getElementById('aiOverlay');
            if (overlay) overlay.remove();
            const page = document.querySelector('.premium-container-box');
            if (page) page.inert = false;
            document.body.style.overflow = "";
        }

        // Runs async tasks with a small limit of parallel requests
        async function aiRunTasks(tasks, limit, onTaskDone) {
            let next = 0;
            async function worker() {
                while (next < tasks.length) {
                    const task = tasks[next++];
                    try { await task(); } catch (e) { console.error("AI task failed:", e); }
                    onTaskDone();
                }
            }
            await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
        }

        // Checks ALL translation + essay answers of the 6 exercise blocks of the selected week
        async function aiCheckAllAnswers() {
            const subject = document.getElementById('subjectSelect').value;
            if (!studentCourse || !subject) return;

            const tasks = [];
            const translationItems = [];   // all translation sentences of the week, checked together

            for (let b = 1; b <= getBlockCount(); b++) {
                const blockData = dataset[studentCourse]?.[subject]?.[b];
                if (!blockData) continue;
                const prefix = `${subject}_block_${b}`;

                if (blockData.type === "essay") {
                    const key = `${prefix}_essay`;
                    const raw = userAnswersCache[key] || "";
                    const text = raw.trim();
                    if (!text) continue;
                    const cached = aiCorrectionCache[key];
                    if (cached && cached.answer.trim() === text) continue;
                    tasks.push(async () => {
                        // Other courses: no grid, only strengths, weaknesses and advice in Georgian
                        if (!isDelfCourse(studentCourse)) {
                            const result = await delfCallGemini(feedbackBuildWritingPrompt(courseLevelFor(studentCourse), blockData.instruction, text), []);
                            aiCorrectionCache[key] = {
                                answer: raw,
                                res: { is_correct: true, errors: result.errors || "", correct: result.correct || "", simple: feedbackFromResult("writing", result) }
                            };
                            return;
                        }
                        // DELF courses: graded like a real DELF examiner, with the official grid of the course level
                        const level = delfLevelFor(studentCourse);
                        const result = await delfCallGemini(delfBuildWritingPrompt(level, blockData.instruction, text), []);
                        const delf = delfScoreWriting(level, result, text);
                        aiCorrectionCache[key] = {
                            answer: raw,
                            res: {
                                is_correct: delf.total >= delf.max / 2,
                                errors: result.errors || "",
                                correct: result.correct || "",
                                delf
                            }
                        };
                    });
                } else if (blockData.type === "speaking") {
                    // Voice recordings of this block, graded with the DELF oral grid
                    const recs = (blockData.questions || []).map((q, index) => ({ q, index, rec: speakingRecordings[`${prefix}_q_${index}`] }))
                        .filter(x => x.rec && x.rec.blob);
                    if (recs.length === 0) continue;
                    const key = `${prefix}_speaking`;
                    const signature = recs.map(x => x.rec.url).join("|");
                    const cached = aiCorrectionCache[key];
                    if (cached && cached.answer === signature) continue;
                    tasks.push(async () => {
                        const audio = await delfRecordingsToAudio(recs.map(x => x.rec));
                        const prompts = recs.map(x => x.q.text.replace(/<br>/g, " "));
                        if (!isDelfCourse(studentCourse)) {
                            const result = await delfCallGemini(feedbackBuildSpeakingPrompt(courseLevelFor(studentCourse), blockData.instruction, prompts), audio);
                            aiCorrectionCache[key] = {
                                answer: signature,
                                res: { is_correct: true, errors: "", correct: "", simple: feedbackFromResult("speaking", result, recs.map(x => x.index)) }
                            };
                            return;
                        }
                        const level = delfLevelFor(studentCourse);
                        const result = await delfCallGemini(delfBuildSpeakingPrompt(level, blockData.instruction, prompts), audio);
                        aiCorrectionCache[key] = {
                            answer: signature,
                            res: { is_correct: true, errors: "", correct: "", delf: delfScoreSpeaking(level, result, recs.map(x => x.index)) }
                        };
                    });
                } else {
                    const items = [];
                    (blockData.questions || []).forEach((q, index) => {
                        if (!aiIsTranslationQuestion(q)) return;
                        const key = `${prefix}_q_${index}`;
                        const raw = userAnswersCache[key] || "";
                        const answer = raw.trim();
                        if (!answer) return;
                        const cached = aiCorrectionCache[key];
                        if (cached && cached.answer.trim() === answer) return;
                        const source = q.text.split("_________________")[0].replace(/<br>/g, " ").trim();
                        items.push({ index, source, student_answer: answer, raw, key });
                    });
                    items.forEach(it => translationItems.push({ ...it, block: b, instruction: blockData.instruction }));
                }
            }

            // Few big requests are much faster than many small ones (and avoid Gemini's per-minute limits)
            const TRANSLATIONS_PER_REQUEST = 40;
            for (let i = 0; i < translationItems.length; i += TRANSLATIONS_PER_REQUEST) {
                const chunk = translationItems.slice(i, i + TRANSLATIONS_PER_REQUEST).map((it, n) => ({ ...it, id: n }));
                tasks.push(async () => {
                    const result = await aiCallGemini(aiBuildMultiTranslationPrompt(chunk));
                    const list = Array.isArray(result.results) ? result.results : [];
                    chunk.forEach(it => {
                        const r = list.find(x => Number(x.id) === it.id);
                        if (!r) return;
                        aiCorrectionCache[it.key] = {
                            answer: it.raw,
                            res: { is_correct: r.is_correct === true, errors: r.errors || "", correct: r.correct || "" }
                        };
                    });
                });
            }

            if (tasks.length === 0) return;

            aiShowOverlay(tasks.length);
            let done = 0;
            await aiRunTasks(tasks, 3, () => {
                done++;
                aiUpdateOverlay(done, tasks.length);
            });
            // let the progress bar visibly reach 100% before the overlay disappears
            await aiSleep(600);
        }

        // Adds the AI verdicts to the text that is sent by email (original function stays untouched)
        function aiFormatInline(res) {
            const oneLine = (s) => String(s || "").replace(/\s*\n+\s*/g, " ").trim();
            if (res.is_correct) return "[AI: სწორია ✅]";
            return `[AI: არასწორია ❌ | შეცდომები: ${oneLine(res.errors)} | სწორი ვერსია: ${oneLine(res.correct)}]`;
        }

        function aiAugmentPayload(payload) {
            const subject = document.getElementById('subjectSelect').value;
            const sections = String(payload).split(/(?=\n=+\nExercice \d+:)/);

            return sections.map(section => {
                const m = section.match(/Exercice (\d+):/);
                if (!m) return section;
                const b = Number(m[1]);
                const blockData = dataset[studentCourse]?.[subject]?.[b];
                if (!blockData) return section;
                const prefix = `${subject}_block_${b}`;

                if (blockData.type === "essay") {
                    const raw = userAnswersCache[`${prefix}_essay`] || "";
                    if (!raw.trim()) return section;
                    const cached = aiCorrectionCache[`${prefix}_essay`];
                    let note;
                    if (!cached) {
                        note = "AI შემოწმება: ვერ შესრულდა (მასწავლებელმა შეამოწმოს ხელით)";
                    } else if (cached.res.delf) {
                        note = delfBuildEmailText(cached.res.delf, cached.res);
                    } else if (cached.res.simple) {
                        note = feedbackBuildEmailText(cached.res.simple, cached.res);
                    } else if (cached.res.is_correct) {
                        note = "AI შემოწმება: სწორია ✅";
                    } else {
                        note = `AI შემოწმება: არასწორია ❌\nშეცდომები: ${cached.res.errors}\nსწორი ვერსია: ${cached.res.correct}`;
                    }
                    return section.replace(/\s+$/, "") + `\n${note}\n`;
                }

                if (blockData.type === "speaking") {
                    const cached = aiCorrectionCache[`${prefix}_speaking`];
                    if (!cached || !(cached.res.delf || cached.res.simple)) return section;
                    const text = cached.res.delf ? delfBuildEmailText(cached.res.delf, cached.res) : feedbackBuildEmailText(cached.res.simple, cached.res);
                    return section.replace(/\s+$/, "") + `\n${text}\n`;
                }

                const questions = blockData.questions || [];
                return section.split("\n").map(line => {
                    const lm = line.match(/^(\d+): /);
                    if (!lm) return line;
                    const index = Number(lm[1]) - 1;
                    const q = questions[index];
                    if (!aiIsTranslationQuestion(q)) return line;
                    const raw = userAnswersCache[`${prefix}_q_${index}`] || "";
                    if (!raw.trim()) return line;
                    const cached = aiCorrectionCache[`${prefix}_q_${index}`];
                    if (!cached) return `${line} -> [AI: შემოწმება ვერ შესრულდა]`;
                    return `${line} -> ${aiFormatInline(cached.res)}`;
                }).join("\n");
            }).join("");
        }

        // ---------- Clear (გასუფთავება) button ----------
        function clearCurrentExerciseAnswers() {
            const info = aiGetCurrentBlockInfo();
            if (!info) return;
            if (!confirm("ნამდვილად გსურთ ამ სავარჯიშოში ჩაწერილი პასუხების წაშლა?")) return;
            const prefix = `${info.cacheKeyPrefix}_`;
            [userAnswersCache, validationResultsCache, aiCorrectionCache].forEach(store => {
                Object.keys(store).forEach(k => { if (k.startsWith(prefix)) delete store[k]; });
            });
            // voice recordings of this exercise are removed too
            speakingStopActive();
            Object.keys(speakingRecordings).forEach(k => {
                if (k.startsWith(prefix)) { URL.revokeObjectURL(speakingRecordings[k].url); delete speakingRecordings[k]; }
            });
            renderExercise();
        }

        // ---------- Hooks on top of the existing functions (original code untouched) ----------
        const _originalRenderExercise = renderExercise;
        renderExercise = function () {
            _originalRenderExercise.apply(this, arguments);

            const info = aiGetCurrentBlockInfo();
            if (!info) return;
            const { blockData, cacheKeyPrefix } = info;
            const container = document.getElementById('exerciseQuestionsContainer');
            const isEssay = blockData.type === "essay";
            const questions = blockData.questions || [];

            // Show saved AI feedback (after sending) for essay / translation answers that were not edited since
            if (isEssay) {
                const textarea = document.getElementById('essayTextarea');
                if (textarea) {
                    const cached = aiCorrectionCache[`${cacheKeyPrefix}_essay`];
                    if (cached && cached.answer === textarea.value) {
                        aiShowFeedback(textarea.parentElement, cached.res, "essay");
                    }
                    textarea.addEventListener('input', () => aiHideFeedback(textarea.parentElement, "essay"));
                }
            } else {
                const itemEls = container.querySelectorAll('.exercise-sentence-item');
                questions.forEach((q, index) => {
                    if (!aiIsTranslationQuestion(q)) return;
                    const el = itemEls[index];
                    const input = document.getElementById(`input_q_${index}`);
                    if (!el || !input) return;
                    const cached = aiCorrectionCache[`${cacheKeyPrefix}_q_${index}`];
                    if (cached && cached.answer === input.value) {
                        aiShowFeedback(el, cached.res, "q");
                    }
                    input.addEventListener('input', () => aiHideFeedback(el, "q"));
                });
            }

            // Clear button at the end of every exercise
            const clearWrapper = document.createElement('div');
            clearWrapper.className = "exercise-clear-wrapper";
            clearWrapper.innerHTML = `
                <button type="button" class="exercise-clear-btn" onclick="clearCurrentExerciseAnswers()">
                    <i class="fa-solid fa-eraser"></i> გასუფთავება
                </button>
            `;
            container.appendChild(clearWrapper);
        };

        const _originalEvaluateAllExercisesLive = evaluateAllExercisesLive;
        evaluateAllExercisesLive = function () {
            const result = _originalEvaluateAllExercisesLive.apply(this, arguments);
            try {
                result.payload = aiAugmentPayload(result.payload);
            } catch (e) {
                console.error("Adding AI results to the payload failed:", e);
            }
            return result;
        };

        const _originalSendAnswersToEmail = sendAnswersToEmail;
        sendAnswersToEmail = async function () {
            if (aiCheckInProgress) return;
            aiCheckInProgress = true;
            try {
                saveCurrentBlockAnswersToCache();
                await aiCheckAllAnswers();
            } catch (e) {
                console.error("AI correction failed:", e);
            } finally {
                aiHideOverlay();
                aiCheckInProgress = false;
            }
            return _originalSendAnswersToEmail.apply(this, arguments);
        };

        // ===== PDF download of the completed and corrected exercises (same content as the email) =====
        // New code only. It reuses the same steps as sending: AI check -> evaluateAllExercisesLive() -> payload.
        // The button uses id="downloadWordBtn", so the existing code already shows it only at Exercice 6.
        let pdfDownloadInProgress = false;

        function pdfEscape(str) {
            return String(str ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }

        function pdfFormatLine(line) {
            // Split "sentence -> [status] -> [AI ...]" into the sentence and its status chips
            const parts = line.split(" -> [");
            let main = pdfEscape(parts[0]).replace(/\[ ([^\]]*?) \]/g, '<b style="color:#0055a5;background:#eaf2fb;padding:1px 6px;border-radius:5px;">$1</b>');
            const chips = parts.slice(1).map(p => {
                const text = p.replace(/\]\s*$/, "");
                const bad = text.includes("❌");
                const color = bad ? "#c9302a" : "#047857";
                const bg = bad ? "#fdeeed" : "#ecfdf5";
                return `<div style="margin-top:4px;padding:4px 10px;border-radius:8px;background:${bg};color:${color};font-size:11px;font-weight:600;">${pdfEscape(text)}</div>`;
            }).join("");
            return main + chips;
        }

        function buildAnswersPdfElement(info, payload) {
            let rightCount = 0;
            let wrongCount = 0;

            // Cut the payload into its "Exercice N: ..." sections
            const sectionRegex = /\n=+\nExercice (\d+): ([^\n]*)\n=+\n/g;
            const sections = [];
            let match;
            let lastIndex = null;
            let lastHead = null;
            while ((match = sectionRegex.exec(payload)) !== null) {
                if (lastHead) sections.push({ ...lastHead, body: payload.slice(lastIndex, match.index) });
                lastHead = { number: match[1], title: match[2] };
                lastIndex = sectionRegex.lastIndex;
            }
            if (lastHead) sections.push({ ...lastHead, body: payload.slice(lastIndex) });

            const sectionsHtml = sections.map(sec => {
                const rows = sec.body.split("\n").map(line => {
                    if (!line.trim()) return "";
                    const bad = line.includes("❌");
                    const good = !bad && line.includes("✅");
                    if (bad) wrongCount++;
                    if (good) rightCount++;
                    const border = bad ? "#ef4135" : (good ? "#10b981" : "#e2e8f0");
                    return `<div class="pdf-row" style="page-break-inside:avoid;break-inside:avoid;margin:0 0 6px 0;padding:8px 12px;border:1px solid #e2e8f0;border-left:4px solid ${border};border-radius:8px;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;">${pdfFormatLine(line)}</div>`;
                }).join("");
                return `
                    <div class="pdf-head" style="page-break-inside:avoid;break-inside:avoid;margin:18px 0 8px 0;padding:10px 14px;background:#eaf2fb;border-left:5px solid #0055a5;border-radius:10px;">
                        <div style="font-size:11px;font-weight:700;color:#0055a5;">Exercice ${pdfEscape(sec.number)}</div>
                        <div style="font-size:14px;font-weight:800;color:#082c55;">${pdfEscape(sec.title)}</div>
                    </div>
                    ${rows || '<div style="font-size:12px;color:#64748b;">—</div>'}
                `;
            }).join("");

            const today = new Date().toLocaleDateString("ka-GE");
            const infoRows = [
                ["ელ-ფოსტა", info.from_email],
                ["სტუდენტის ID", info.student_id],
                ["კურსი", info.course],
                ["კვირა", info.week],
                ["სავარჯიშოები", info.exercise_block],
                ["თარიღი", today]
            ].map(([k, v]) => `
                <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:6px 10px;">
                    <div style="font-size:9.5px;color:rgba(255,255,255,0.7);">${pdfEscape(k)}</div>
                    <div style="font-size:12px;font-weight:700;color:#ffffff;word-break:break-all;">${pdfEscape(v || "N/A")}</div>
                </div>`).join("");

            const el = document.createElement("div");
            el.style.cssText = "width:700px;padding:0;background:#ffffff;color:#0f172a;font-family:'Inter','Noto Sans Georgian','Segoe UI',sans-serif;";
            el.innerHTML = `
                <div style="position:relative;overflow:hidden;background:#082c55;border-radius:14px;padding:22px 24px 20px 32px;color:#ffffff;">
                    <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:linear-gradient(180deg,#0055a5 0 33.33%,#ffffff 33.33% 66.66%,#ef4135 66.66% 100%);"></div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.7);">OuiSpeak</div>
                    <div style="font-size:22px;font-weight:800;margin:2px 0 14px 0;">სავარჯიშოების პასუხები</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${infoRows}</div>
                </div>
                <div style="display:flex;gap:10px;margin:14px 0 4px 0;">
                    <div style="flex:1;padding:10px 14px;border-radius:10px;background:#ecfdf5;color:#047857;font-weight:700;font-size:13px;">✅ სწორი: ${rightCount}</div>
                    <div style="flex:1;padding:10px 14px;border-radius:10px;background:#fdeeed;color:#c9302a;font-weight:700;font-size:13px;">❌ არასწორი: ${wrongCount}</div>
                </div>
                ${sectionsHtml}
                <div style="margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">© 2026 OuiSpeak</div>
            `;
            return el;
        }

        async function downloadAnswersPdf() {
            if (pdfDownloadInProgress || aiCheckInProgress) return;
            const feedback = document.getElementById('resultFeedback');
            if (typeof html2pdf === "undefined") {
                feedback.innerHTML = `<span style="color: var(--secondary);"><i class="fa-solid fa-circle-xmark"></i> PDF-ის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.</span>`;
                return;
            }

            pdfDownloadInProgress = true;
            aiCheckInProgress = true;
            try {
                // 1. Same AI check as before sending (already checked answers are not sent again)
                saveCurrentBlockAnswersToCache();
                try {
                    await aiCheckAllAnswers();
                } catch (e) {
                    console.error("AI correction failed:", e);
                } finally {
                    aiHideOverlay();
                }

                // 2. Same corrected text that goes into the email
                const subjectSelect = document.getElementById('subjectSelect');
                const selectedWeek = subjectSelect.options[subjectSelect.selectedIndex].text;
                const resultsData = evaluateAllExercisesLive();
                const info = {
                    from_email: authenticatedUserEmail,
                    student_id: document.getElementById('studentIdInput').value || "N/A",
                    course: studentCourse,
                    week: selectedWeek,
                    exercise_block: `ყველა ბლოკი (1-${getBlockCount()})`
                };

                document.getElementById('resultFeedback').innerHTML = `<span style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> PDF მზადდება...</span>`;

                // 3. Build and save the PDF
                const element = buildAnswersPdfElement(info, resultsData.payload);
                const safeName = `${studentCourse || "OuiSpeak"}_${selectedWeek}_პასუხები`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
                await html2pdf().set({
                    margin: [10, 10, 12, 10],
                    filename: `${safeName}.pdf`,
                    image: { type: "jpeg", quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                    pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-row", ".pdf-head"] }
                }).from(element).save();

                document.getElementById('resultFeedback').innerHTML = `<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> PDF ფაილი გადმოწერილია!</span>`;
            } catch (e) {
                console.error("PDF download failed:", e);
                document.getElementById('resultFeedback').innerHTML = `<span style="color: var(--secondary);"><i class="fa-solid fa-circle-xmark"></i> PDF-ის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.</span>`;
            } finally {
                pdfDownloadInProgress = false;
                aiCheckInProgress = false;
            }
        }


        // ===== X button on the "please wait" checking screen =====
        // New code only. The original functions stay as they are; aiCheckAllAnswers is wrapped the same way
        // the existing hooks above wrap renderExercise / sendAnswersToEmail.
        // When the student presses X, the waiting send / PDF step is dropped (nothing is sent or downloaded),
        // the screen closes and the student is back on the exercises. Answers stay exactly as they were.
        let aiCancelCurrentCheck = null;

        const _aiCheckAllAnswersBeforeCancel = aiCheckAllAnswers;
        aiCheckAllAnswers = function () {
            const self = this;
            const args = arguments;
            return new Promise((resolve, reject) => {
                let cancelled = false;
                aiCancelCurrentCheck = () => { cancelled = true; };
                _aiCheckAllAnswersBeforeCancel.apply(self, args).then(
                    (value) => { if (!cancelled) { aiCancelCurrentCheck = null; resolve(value); } },
                    (error) => { if (!cancelled) { aiCancelCurrentCheck = null; reject(error); } }
                );
            });
        };

        function aiCancelCheck() {
            if (aiCancelCurrentCheck) aiCancelCurrentCheck();
            aiCancelCurrentCheck = null;
            aiHideOverlay();
            aiCheckInProgress = false;
            pdfDownloadInProgress = false;
            const feedback = document.getElementById('resultFeedback');
            if (feedback) {
                feedback.innerHTML = `<span style="color: var(--secondary);"><i class="fa-solid fa-circle-xmark"></i> შემოწმება შეწყდა. პასუხები არ გაიგზავნა.</span>`;
            }
        }

        // Adds the X button whenever the checking screen appears
        new MutationObserver(() => {
            const card = document.querySelector('#aiOverlay .ai-overlay-card');
            if (!card || card.querySelector('.ai-overlay-close')) return;
            const closeBtn = document.createElement('button');
            closeBtn.type = "button";
            closeBtn.className = "ai-overlay-close";
            closeBtn.title = "შეწყვეტა";
            closeBtn.setAttribute('aria-label', "შეწყვეტა და სავარჯიშოებზე დაბრუნება");
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', aiCancelCheck);
            card.appendChild(closeBtn);
        }).observe(document.body, { childList: true });

        // Esc key does the same as the X button
        document.addEventListener('keydown', (e) => {
            if (e.key === "Escape" && document.getElementById('aiOverlay')) aiCancelCheck();
        });


        checkUserSession();
         _supabase.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) {
            loadHeaderScore(data.session.user.email);
        }
    });
    

        // =====================================================================
        // ===== NEW EXERCISE TYPES: matching (vocabulary) & speaking (voice) =====
        // =====================================================================
        // Both reuse the existing machinery: every answer is kept in a hidden
        // <input id="input_q_N">, so saving, checking, the email and the PDF
        // keep working exactly as for the other exercises.

        // ---------- Shared helpers ----------
        function exEscape(str) {
            return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        }

        // Same colours as the course buttons on the home page: DELF courses red, the others blue
        function getCourseAccent(course) {
            return (course || "").includes("DELF")
                ? { color: "#ef4135", dark: "#c9302a" }
                : { color: "#0055a5", dark: "#003f7d" };
        }

        // Shuffle that is always the same for the same block (so the order doesn't jump around)
        function seededShuffle(items, seedText) {
            let seed = 0;
            for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
            const random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            const result = items.slice();
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            // never show the Georgian words in exactly the same order as the French ones
            if (result.length > 1 && result.every((v, i) => v === items[i])) result.push(result.shift());
            return result;
        }

        function addHiddenAnswerInput(parent, index, value) {
            const input = document.createElement('input');
            input.type = "hidden";
            input.id = `input_q_${index}`;
            input.value = value || "";
            parent.appendChild(input);
            return input;
        }

        // ---------- MATCHING: French word ↔ Georgian meaning ----------
        function renderMatchingBlock(container, blockData, prefix) {
            const questions = blockData.questions || [];
            const accent = getCourseAccent(studentCourse);

            const board = document.createElement('div');
            board.className = "match-board";
            board.style.setProperty('--match-accent', accent.color);
            board.style.setProperty('--match-accent-dark', accent.dark);

            const hiddenInputs = questions.map((q, i) =>
                addHiddenAnswerInput(board, i, userAnswersCache[`${prefix}_q_${i}`]));

            // pairs[frenchIndex] = georgianIndex (index of the question whose Georgian word was chosen)
            const pairs = {};
            const used = new Set();
            questions.forEach((q, i) => {
                const saved = userAnswersCache[`${prefix}_q_${i}`];
                if (!saved) return;
                const k = questions.findIndex((x, j) => !used.has(j) && x.answer === saved);
                if (k >= 0) { pairs[i] = k; used.add(k); }
            });

            const georgianOrder = seededShuffle(questions.map((_, i) => i), prefix + questions.map(q => q.text).join("|"));
            let selectedFrench = null;
            let selectedGeorgian = null;

            const progress = document.createElement('div');
            progress.className = "match-progress";
            const columns = document.createElement('div');
            columns.className = "match-columns";
            board.appendChild(progress);
            board.appendChild(columns);

            function setAnswer(frenchIndex, georgianIndex) {
                const key = `${prefix}_q_${frenchIndex}`;
                const value = georgianIndex === undefined ? "" : questions[georgianIndex].answer;
                hiddenInputs[frenchIndex].value = value;
                userAnswersCache[key] = value;
                delete validationResultsCache[key];   // the old ✓/✗ no longer applies
            }

            function frenchOf(georgianIndex) {
                const found = Object.keys(pairs).find(f => pairs[f] === georgianIndex);
                return found === undefined ? null : Number(found);
            }

            function connect(frenchIndex, georgianIndex) {
                const previousFrench = frenchOf(georgianIndex);
                if (previousFrench !== null) { delete pairs[previousFrench]; setAnswer(previousFrench); }
                pairs[frenchIndex] = georgianIndex;
                setAnswer(frenchIndex, georgianIndex);
                selectedFrench = null;
                selectedGeorgian = null;
            }

            function clickFrench(i) {
                if (pairs[i] !== undefined && selectedGeorgian === null) {   // tap a matched word = undo
                    delete pairs[i];
                    setAnswer(i);
                    selectedFrench = null;
                } else if (selectedGeorgian !== null) {
                    connect(i, selectedGeorgian);
                } else {
                    selectedFrench = selectedFrench === i ? null : i;
                }
                draw();
            }

            function clickGeorgian(k) {
                const owner = frenchOf(k);
                if (owner !== null && selectedFrench === null) {              // tap a matched word = undo
                    delete pairs[owner];
                    setAnswer(owner);
                    selectedGeorgian = null;
                } else if (selectedFrench !== null) {
                    connect(selectedFrench, k);
                } else {
                    selectedGeorgian = selectedGeorgian === k ? null : k;
                }
                draw();
            }

            function draw() {
                const matched = Object.keys(pairs).length;
                progress.innerHTML = `
                    <span><i class="fa-solid fa-link"></i> დაკავშირებულია ${matched} / ${questions.length}</span>
                    <span class="match-hint">აირჩიეთ ფრანგული სიტყვა, შემდეგ მისი ქართული მნიშვნელობა</span>`;

                const frCol = document.createElement('div');
                frCol.className = "match-col";
                const kaCol = document.createElement('div');
                kaCol.className = "match-col";

                questions.forEach((q, i) => {
                    const result = validationResultsCache[`${prefix}_q_${i}`];
                    const btn = document.createElement('button');
                    btn.type = "button";
                    btn.className = "match-item match-fr"
                        + (selectedFrench === i ? " selected" : "")
                        + (pairs[i] !== undefined ? " paired" : "")
                        + (result ? (result.isCorrect ? " correct" : " incorrect") : "");
                    btn.setAttribute('aria-pressed', selectedFrench === i ? "true" : "false");
                    btn.innerHTML = `
                        <span class="match-num">${i + 1}</span>
                        <span class="match-text" lang="fr">${exEscape(q.text)}</span>
                        ${result ? `<i class="fa-solid ${result.isCorrect ? "fa-circle-check" : "fa-circle-xmark"} match-icon"></i>` : ""}
                        ${result && !result.isCorrect ? `<span class="match-fix">სწორი: ${exEscape(q.answer)}</span>` : ""}`;
                    btn.addEventListener('click', () => clickFrench(i));
                    frCol.appendChild(btn);
                });

                georgianOrder.forEach(k => {
                    const owner = frenchOf(k);
                    const btn = document.createElement('button');
                    btn.type = "button";
                    btn.className = "match-item match-ka"
                        + (selectedGeorgian === k ? " selected" : "")
                        + (owner !== null ? " paired" : "");
                    btn.setAttribute('aria-pressed', selectedGeorgian === k ? "true" : "false");
                    btn.innerHTML = `
                        <span class="match-text" lang="ka">${exEscape(questions[k].answer)}</span>
                        ${owner !== null ? `<span class="match-num">${owner + 1}</span>` : ""}`;
                    btn.addEventListener('click', () => clickGeorgian(k));
                    kaCol.appendChild(btn);
                });

                columns.replaceChildren(frCol, kaCol);
            }

            draw();
            container.appendChild(board);
        }

        // ---------- SPEAKING: students record their voice ----------
        // Recordings are uploaded to Supabase Storage (bucket "speaking") when the student sends the answers.
        // The email then contains a private link (valid 1 year) to listen to each recording.
        const SPEAKING_MAX_SECONDS = 180;
        const SPEAKING_LINK_SECONDS = 60 * 60 * 24 * 365;
        const speakingRecordings = {};   // key -> { blob, url, seconds, uploadedUrl }
        let speakingActive = null;       // { recorder, stream, timer, key }

        function speakingFormatTime(sec) {
            const s = Math.max(0, Math.round(sec));
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        }

        function speakingPickMimeType() {
            const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
            return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
        }

        // Stops the recording in progress (if any). Resolves when the recording is saved.
        function speakingStopActive() {
            if (!speakingActive) return Promise.resolve();
            const done = speakingActive.done;
            if (speakingActive.recorder.state !== "inactive") speakingActive.recorder.stop();
            return done;
        }

        function renderSpeakingBlock(container, blockData, prefix) {
            speakingStopActive();
            const questions = blockData.questions || [];
            const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
            const accent = getCourseAccent(studentCourse);

            const list = document.createElement('div');
            list.className = "speak-list";
            list.style.setProperty('--speak-accent', accent.color);

            if (!supported) {
                list.innerHTML = `<div class="speak-warning"><i class="fa-solid fa-triangle-exclamation"></i> თქვენი ბრაუზერი ხმის ჩაწერას ვერ ახერხებს. გამოიყენეთ Chrome, Safari ან Firefox-ის ახალი ვერსია.</div>`;
                container.appendChild(list);
                return;
            }

            questions.forEach((q, i) => {
                const key = `${prefix}_q_${i}`;
                const card = document.createElement('div');
                card.className = "speak-card";
                const hidden = addHiddenAnswerInput(card, i, userAnswersCache[key]);
                const body = document.createElement('div');
                body.className = "speak-body";
                card.insertAdjacentHTML('afterbegin', `
                    <div class="speak-prompt"><span class="speak-num">${i + 1}</span><span lang="fr">${q.text}</span></div>`);
                card.appendChild(body);
                list.appendChild(card);

                const draw = () => drawSpeakingCard(body, key, hidden);
                draw();
            });

            const note = document.createElement('p');
            note.className = "speak-note";
            note.innerHTML = `<i class="fa-solid fa-circle-info"></i> ჩანაწერები მასწავლებელს გაეგზავნება პასუხების გაგზავნისას. გაგზავნამდე გვერდი არ დახუროთ.`;
            list.appendChild(note);

            // DELF-style evaluation (shown after sending, while the recordings are unchanged)
            const signature = questions.map((q, i) => speakingRecordings[`${prefix}_q_${i}`])
                .filter(r => r && r.blob).map(r => r.url).join("|");
            const evaluation = aiCorrectionCache[`${prefix}_speaking`];
            if (evaluation && evaluation.answer === signature && (evaluation.res.delf || evaluation.res.simple)) {
                list.insertAdjacentHTML('beforeend', aiBuildFeedbackHtml(evaluation.res));
            }
            container.appendChild(list);
        }

        function drawSpeakingCard(body, key, hidden) {
            const rec = speakingRecordings[key];
            const sentUrl = !rec && /^https?:\/\//.test(userAnswersCache[key] || "") ? userAnswersCache[key] : null;
            const isRecordingHere = speakingActive && speakingActive.key === key;
            const redraw = () => drawSpeakingCard(body, key, hidden);

            if (isRecordingHere) {
                body.innerHTML = `
                    <button type="button" class="speak-btn speak-stop"><i class="fa-solid fa-stop"></i></button>
                    <div class="speak-live"><span class="speak-dot"></span> მიმდინარეობს ჩაწერა <b class="speak-timer">0:00</b> / ${speakingFormatTime(SPEAKING_MAX_SECONDS)}</div>`;
                body.querySelector('.speak-stop').addEventListener('click', speakingStopActive);
                speakingActive.timerEl = body.querySelector('.speak-timer');
                return;
            }

            if (rec || sentUrl) {
                body.innerHTML = `
                    <audio controls src="${exEscape(rec ? rec.url : sentUrl)}"></audio>
                    <div class="speak-actions">
                        ${rec ? `<span class="speak-len"><i class="fa-solid fa-microphone"></i> ${speakingFormatTime(rec.seconds)}</span>` : `<span class="speak-len"><i class="fa-solid fa-circle-check"></i> გაგზავნილია</span>`}
                        <button type="button" class="speak-link-btn speak-redo"><i class="fa-solid fa-rotate-right"></i> თავიდან ჩაწერა</button>
                        <button type="button" class="speak-link-btn speak-delete"><i class="fa-solid fa-trash"></i> წაშლა</button>
                    </div>`;
                body.querySelector('.speak-redo').addEventListener('click', () => speakingStart(key, hidden, redraw));
                body.querySelector('.speak-delete').addEventListener('click', () => {
                    if (!confirm("წავშალოთ ეს ჩანაწერი?")) return;
                    if (rec) URL.revokeObjectURL(rec.url);
                    delete speakingRecordings[key];
                    userAnswersCache[key] = "";
                    hidden.value = "";
                    redraw();
                });
                return;
            }

            body.innerHTML = `
                <button type="button" class="speak-btn speak-start"><i class="fa-solid fa-microphone"></i></button>
                <div class="speak-idle">დააჭირეთ და ისაუბრეთ ფრანგულად <span>(მაქს. ${speakingFormatTime(SPEAKING_MAX_SECONDS)})</span></div>`;
            body.querySelector('.speak-start').addEventListener('click', () => speakingStart(key, hidden, redraw));
        }

        async function speakingStart(key, hidden, redraw) {
            await speakingStopActive();
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e) {
                console.error("Microphone access failed:", e);
                alert("მიკროფონთან წვდომა ვერ მოხერხდა. ბრაუზერში დაუშვით მიკროფონის გამოყენება და სცადეთ თავიდან.");
                return;
            }

            const mimeType = speakingPickMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const chunks = [];
            const startedAt = Date.now();
            let markDone;
            const done = new Promise(resolve => { markDone = resolve; });
            speakingActive = { recorder, stream, key, timer: null, timerEl: null, done };

            recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onstop = () => {
                clearInterval(speakingActive && speakingActive.timer);
                stream.getTracks().forEach(t => t.stop());
                speakingActive = null;
                const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
                const seconds = (Date.now() - startedAt) / 1000;
                if (blob.size > 0) {
                    const old = speakingRecordings[key];
                    if (old) URL.revokeObjectURL(old.url);
                    speakingRecordings[key] = { blob, url: URL.createObjectURL(blob), seconds, uploadedUrl: null };
                    const label = `🎙 ხმოვანი ჩანაწერი (${speakingFormatTime(seconds)})`;
                    userAnswersCache[key] = label;
                    hidden.value = label;
                }
                redraw();
                markDone();
            };

            speakingActive.timer = setInterval(() => {
                const sec = (Date.now() - startedAt) / 1000;
                if (speakingActive && speakingActive.timerEl) speakingActive.timerEl.textContent = speakingFormatTime(sec);
                if (sec >= SPEAKING_MAX_SECONDS) speakingStopActive();
            }, 250);

            recorder.start();
            redraw();
        }

        // Uploads the new recordings of the selected week and puts their links into the answers
        async function uploadSpeakingRecordings() {
            await speakingStopActive();
            const subject = document.getElementById('subjectSelect').value;
            const pending = Object.entries(speakingRecordings)
                .filter(([key, rec]) => key.startsWith(`${subject}_block_`) && !rec.uploadedUrl);
            if (pending.length === 0) return true;

            const feedback = document.getElementById('resultFeedback');
            feedback.innerHTML = `<span style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> ხმოვანი ჩანაწერები იტვირთება...</span>`;

            try {
                const { data: { session } } = await _supabase.auth.getSession();
                if (!session) throw new Error("Not logged in");
                const userId = session.user.id;

                for (const [key, rec] of pending) {
                    const contentType = (rec.blob.type || "audio/webm").split(";")[0];
                    const ext = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
                    const path = `${userId}/${key}_${Date.now()}.${ext}`;

                    const { error: uploadError } = await _supabase.storage.from("speaking")
                        .upload(path, rec.blob, { contentType, upsert: false });
                    if (uploadError) throw uploadError;

                    const { data, error: linkError } = await _supabase.storage.from("speaking")
                        .createSignedUrl(path, SPEAKING_LINK_SECONDS);
                    if (linkError) throw linkError;

                    rec.uploadedUrl = data.signedUrl;
                    userAnswersCache[key] = data.signedUrl;
                    const index = key.split("_q_")[1];
                    const hidden = key.startsWith(`${subject}_block_${currentActiveBlock}_`) ? document.getElementById(`input_q_${index}`) : null;
                    if (hidden) hidden.value = data.signedUrl;
                }
                return true;
            } catch (e) {
                console.error("Uploading recordings failed:", e);
                feedback.innerHTML = `<span style="color: var(--secondary);"><i class="fa-solid fa-circle-xmark"></i> ხმოვანი ჩანაწერების ატვირთვა ვერ მოხერხდა. სცადეთ თავიდან.</span>`;
                return false;
            }
        }

        const _sendAnswersBeforeSpeaking = sendAnswersToEmail;
        sendAnswersToEmail = async function () {
            if (aiCheckInProgress) return;
            saveCurrentBlockAnswersToCache();
            const ok = await uploadSpeakingRecordings();
            if (!ok) return;
            return _sendAnswersBeforeSpeaking.apply(this, arguments);
        };

        // =====================================================================
        // ===== DELF-STYLE GRADING (essays + speaking) =====
        // =====================================================================
        // The AI grades like an official DELF examiner, with the official grids
        // (production écrite / production orale, A2 or B1), gives points per
        // criterion, an estimated exam score out of 25 and explains everything
        // to the student in Georgian.
        // Uses the Supabase Edge Function "gemini-delf" (it can also receive audio).

        const DELF_ENDPOINT = `${SUPABASE_URL}/functions/v1/gemini-delf`;

        const DELF_BANDS = (level) => ["არ არის / არასაკმარისი", "დონეზე დაბლა", level, `${level}+`];

        const DELF_WRITING = {
            A2: { values: [0, 0.5, 1.5, 2.5], max: 12.5, examFactor: 2, defaultWords: 60 },
            B1: { values: [0, 1, 3, 5], max: 25, examFactor: 1, defaultWords: 160 }
        };

        const DELF_WRITING_CRITERIA = [
            { id: "tache", fr: "Réalisation de la tâche", ka: "დავალების შესრულება",
              help: "შეასრულეთ თუ არა ყველაფერი, რასაც დავალება ითხოვდა: თემა, ტექსტის ტიპი (წერილი, მესიჯი, აღწერა…), ყველა მოთხოვნილი პუნქტი და სიტყვების რაოდენობა." },
            { id: "coherence", fr: "Cohérence et cohésion", ka: "თანმიმდევრულობა და ბმულობა",
              help: "რამდენად ლოგიკურად არის აწყობილი ტექსტი და აკავშირებთ თუ არა იდეებს სიტყვებით: et, mais, parce que, donc, ensuite, enfin…" },
            { id: "socio", fr: "Adéquation sociolinguistique", ka: "სოციოლინგვისტური შესაბამისობა",
              help: "სწორად მიმართავთ თუ არა ადრესატს (tu ან vous), გაქვთ თუ არა მისალმება, დამშვიდობება და ტექსტის ტიპის შესაბამისი ფორმა." },
            { id: "lexique", fr: "Lexique", ka: "ლექსიკა",
              help: "რამდენად მდიდარი და ზუსტია სიტყვების მარაგი თემისთვის და რამდენად სწორია მართლწერა." },
            { id: "morpho", fr: "Morphosyntaxe", ka: "გრამატიკა",
              help: "ზმნების უღლება და დროები, სქესსა და რიცხვში შეთანხმება, არტიკლები, წინადადების წყობა." }
        ];

        const DELF_ORAL_TASKS = {
            A2: "entretien dirigé (~1:30), monologue suivi (~2 min), exercice en interaction (3–4 min)",
            B1: "entretien dirigé (2–3 min), exercice en interaction (3–4 min), expression d'un point de vue (5–7 min)"
        };
        const DELF_ORAL = {
            task: { values: [0, 1, 2.5, 4] },
            lexique: { values: [0, 1, 3, 5], fr: "Lexique", ka: "ლექსიკა",
                help: "სიტყვების მარაგი და მათი სწორად გამოყენება ყველა პასუხში." },
            morpho: { values: [0, 1, 2.5, 4], fr: "Morphosyntaxe", ka: "გრამატიკა",
                help: "ზმნების უღლება, დროები, შეთანხმება და წინადადების წყობა ზეპირ მეტყველებაში." },
            phono: { values: [0, 1, 2.5, 4], fr: "Maîtrise du système phonologique", ka: "გამოთქმა",
                help: "რამდენად გასაგებად და სწორად წარმოთქვამთ ფრანგულ ბგერებს, მახვილს და ინტონაციას." }
        };

        const DELF_ANOMALIES = {
            hors_sujet_thematique: "თემას გადაცდა (hors-sujet thématique): „დავალების შესრულება“ და „ლექსიკა“ ვერ მიიღებს უმაღლეს დონეს.",
            hors_sujet_discursif: "ტექსტის ტიპი არ შეესაბამება დავალებას (hors-sujet discursif): „დავალების შესრულება“ და „თანმიმდევრულობა“ შეფასდა „დონეზე დაბლა“-ზე მეტი არა.",
            hors_sujet_complet: "ტექსტი სრულად გადაცდა დავალებას (hors-sujet complet): პირველი სამი კრიტერიუმი = 0, ლექსიკა და გრამატიკა მაქსიმუმ „დონეზე დაბლა“.",
            copie_blanche: "ტექსტი ცარიელია (copie blanche): ყველა კრიტერიუმი = 0.",
            manque_matiere: "ტექსტი ძალიან მოკლეა (manque de matière évaluable): მოთხოვნილი სიტყვების 50%-ზე ნაკლები, ამიტომ ყველა კრიტერიუმი = 0."
        };

        function delfLevelFor(course) {
            return /B1/i.test(course || "") ? "B1" : "A2";
        }

        function delfSnap(value, allowed) {
            const n = Number(String(value ?? "").replace(",", "."));
            if (isNaN(n)) return allowed[0];
            return allowed.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best, allowed[0]);
        }

        function delfFmt(n) {
            return String(Math.round(n * 10) / 10).replace(".", ",");
        }

        function delfWordCount(text) {
            const t = (text || "").trim();
            return t ? t.split(/\s+/).length : 0;
        }

        // ---------- Prompts ----------
        function delfBuildWritingPrompt(level, instruction, text) {
            const g = DELF_WRITING[level];
            const v = g.values;
            return `You are an official, experienced DELF ${level} examiner (France Éducation international).
Grade the student's text exactly like in the real exam, with the official "Grille d'évaluation de la production écrite – DELF ${level}".
Be objective and realistic, like a real examiner: not lenient, not harsh. A few small mistakes do NOT make a text fail; judge the overall level reached.

Task given to the student: "${instruction}"
Student's text (${delfWordCount(text)} words):
"""
${text}
"""

For EACH criterion choose exactly ONE level and give its points:
${v[0]} = non répondu ou production insuffisante; ${v[1]} = en dessous du niveau ciblé; ${v[2]} = au niveau ${level}; ${v[3]} = au niveau ${level}+ (clearly above ${level}).
Criteria:
- tache: Réalisation de la tâche (respects the task: topic, type of text, all requested points, length)
- coherence: Cohérence et cohésion (logical organisation, connectors)
- socio: Adéquation sociolinguistique (register tu/vous, greetings/closing, form adapted to the text type)
- lexique: Lexique (range and accuracy of vocabulary, spelling)
- morpho: Morphosyntaxe (conjugation, tenses, agreement, articles, word order)

Anomalies (only if they really apply): "hors_sujet_thematique", "hors_sujet_discursif", "hors_sujet_complet", "copie_blanche", "manque_matiere" (fewer than 50% of the expected number of words).
expected_words = the number of words requested in the task; if the task does not say, use ${g.defaultWords}.

Write ALL comments IN GEORGIAN, addressed to the student, short and concrete, quoting their French words as examples.
Reply ONLY with JSON in this exact shape:
{"expected_words":${g.defaultWords},"criteria":{"tache":{"points":0,"comment":""},"coherence":{"points":0,"comment":""},"socio":{"points":0,"comment":""},"lexique":{"points":0,"comment":""},"morpho":{"points":0,"comment":""}},"anomalies":[],"summary":"2-3 sentences: overall level and what the examiner would think","strengths":"what is good","improvements":"the 2-3 most important things to work on","errors":"one mistake per line: wrong → correct (short explanation)","correct":"the full corrected text in French"}`;
        }

        function delfBuildSpeakingPrompt(level, instruction, prompts) {
            const o = DELF_ORAL;
            return `You are an official, experienced DELF ${level} examiner (France Éducation international) grading the PRODUCTION ORALE with the official grid.
The real exam has 3 parts: ${DELF_ORAL_TASKS[level]}. Here the student answered ${prompts.length} question(s) by recording their voice at home.
Audio file number N is the answer to question number N.
Exercise instruction: "${instruction}"
Questions:
${prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Listen carefully to every recording. Be objective and realistic like a real examiner (not lenient, not harsh).
For EACH recording: write what the student said (transcript in French, as heard) and grade "Réalisation de la tâche" for that answer:
${o.task.values[0]} = no answer / insufficient; ${o.task.values[1]} = below ${level}; ${o.task.values[2]} = ${level}; ${o.task.values[3]} = ${level}+.
A silent, unintelligible or non-French recording gets ${o.task.values[0]}.
Then, for ALL recordings together:
- lexique (Lexique): ${o.lexique.values.join(" / ")}
- morpho (Morphosyntaxe): ${o.morpho.values.join(" / ")}
- phono (Maîtrise du système phonologique: pronunciation, intonation, fluency): ${o.phono.values.join(" / ")}
(values in order: insufficient / below ${level} / ${level} / ${level}+)

Write ALL comments IN GEORGIAN, addressed to the student, short and concrete, quoting their French words as examples.
Reply ONLY with JSON in this exact shape:
{"answers":[{"index":1,"transcript":"","points":0,"comment":""}],"lexique":{"points":0,"comment":""},"morpho":{"points":0,"comment":""},"phono":{"points":0,"comment":""},"summary":"2-3 sentences: overall level","strengths":"","improvements":"the 2-3 most important things to work on","errors":"one mistake per line: what was said → correct French (short explanation)"}`;
        }

        // ---------- Calling the AI (text + optional audio) ----------
        async function delfCallGemini(promptText, audio) {
            const hasAudio = Array.isArray(audio) && audio.length > 0;
            return aiRequest(promptText, {
                audio: audio || [],
                thinking: "low",
                timeoutMs: hasAudio ? 90000 : 60000,
                maxTotalMs: hasAudio ? 200000 : 150000
            });
        }

        // Recordings → small mono WAV files (a format the AI can listen to), as base64
        async function delfRecordingsToAudio(recordings) {
            const totalSeconds = recordings.reduce((s, r) => s + (r.seconds || 0), 0);
            const rate = totalSeconds <= 240 ? 16000 : 8000;
            const out = [];
            for (const rec of recordings) {
                out.push({ mimeType: "audio/wav", data: await delfBlobToWavBase64(rec.blob, rate) });
            }
            return out;
        }

        async function delfBlobToWavBase64(blob, rate) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            ctx.close();
            const length = Math.max(1, Math.ceil(decoded.duration * rate));
            const offline = new OfflineAudioContext(1, length, rate);
            const source = offline.createBufferSource();
            source.buffer = decoded;
            source.connect(offline.destination);
            source.start();
            const pcm = (await offline.startRendering()).getChannelData(0);

            const buffer = new ArrayBuffer(44 + pcm.length * 2);
            const view = new DataView(buffer);
            const writeText = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
            writeText(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); writeText(8, "WAVE");
            writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
            view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
            writeText(36, "data"); view.setUint32(40, pcm.length * 2, true);
            for (let i = 0; i < pcm.length; i++) {
                const v = Math.max(-1, Math.min(1, pcm[i]));
                view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
            }

            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            return btoa(binary);
        }

        // ---------- Turning the AI answer into official points ----------
        function delfScoreWriting(level, r, text) {
            const g = DELF_WRITING[level];
            const v = g.values;
            const crit = {};
            DELF_WRITING_CRITERIA.forEach(c => {
                crit[c.id] = { ...c, values: v, points: delfSnap(r?.criteria?.[c.id]?.points, v), comment: r?.criteria?.[c.id]?.comment || "" };
            });

            const words = delfWordCount(text);
            const expected = Number(r?.expected_words) > 0 ? Number(r.expected_words) : g.defaultWords;
            const anomalies = new Set((Array.isArray(r?.anomalies) ? r.anomalies : []).filter(a => DELF_ANOMALIES[a]));
            if (words === 0) anomalies.add("copie_blanche");
            else if (words < expected / 2) anomalies.add("manque_matiere");

            const cap = (id, index) => { crit[id].points = Math.min(crit[id].points, v[index]); };
            if (anomalies.has("hors_sujet_thematique")) { cap("tache", 2); cap("lexique", 2); }
            if (anomalies.has("hors_sujet_discursif")) { cap("tache", 1); cap("coherence", 1); }
            if (anomalies.has("hors_sujet_complet")) { cap("tache", 0); cap("coherence", 0); cap("socio", 0); cap("lexique", 1); cap("morpho", 1); }
            if (anomalies.has("copie_blanche") || anomalies.has("manque_matiere")) Object.keys(crit).forEach(id => cap(id, 0));

            const criteria = DELF_WRITING_CRITERIA.map(c => crit[c.id]);
            const total = criteria.reduce((s, c) => s + c.points, 0);
            return {
                kind: "writing", level, criteria, anomalies: [...anomalies], words, expected,
                total, max: g.max, exam25: total * g.examFactor,
                summary: r?.summary || "", strengths: r?.strengths || "", improvements: r?.improvements || ""
            };
        }

        function delfScoreSpeaking(level, r, questionIndexes) {
            const o = DELF_ORAL;
            const list = Array.isArray(r?.answers) ? r.answers : [];
            const answers = questionIndexes.map((qIndex, i) => {
                const a = list.find(x => Number(x.index) === i + 1) || list[i] || {};
                return { question: qIndex + 1, transcript: a.transcript || "", points: delfSnap(a.points, o.task.values), comment: a.comment || "" };
            });
            const avg = answers.length ? answers.reduce((s, a) => s + a.points, 0) / answers.length : 0;
            const taskPart = Math.round(avg * 3 * 2) / 2;   // the 3 exam tasks (3 × 4 = 12 points), rounded to 0.5

            const criteria = [
                { id: "taches", fr: "Réalisation des tâches", ka: "დავალებების შესრულება",
                  help: "უპასუხეთ თუ არა თითოეულ კითხვას სრულად, თემაზე და საკმარისი ხანგრძლივობით. გამოცდაზე 3 დავალებაა (თითო 4 ქულა = 12); აქ ქულა თქვენი პასუხების საშუალოდან არის გამოთვლილი.",
                  points: taskPart, max: 12, comment: "" },
                ...["lexique", "morpho", "phono"].map(id => ({
                    id, fr: o[id].fr, ka: o[id].ka, help: o[id].help, values: o[id].values,
                    points: delfSnap(r?.[id]?.points, o[id].values), comment: r?.[id]?.comment || ""
                }))
            ];
            const total = criteria.reduce((s, c) => s + c.points, 0);
            return {
                kind: "speaking", level, criteria, answers, anomalies: [],
                total, max: 25, exam25: total,
                summary: r?.summary || "", strengths: r?.strengths || "", improvements: r?.improvements || "",
                errors: r?.errors || ""
            };
        }

        // ---------- Showing the result to the student (Georgian) ----------
        function delfText(str) {
            return aiEscapeHtml(str || "").replace(/\n/g, "<br>");
        }

        function delfBandIndex(c) {
            return c.values ? c.values.indexOf(c.points) : -1;
        }

        function delfBuildCardHtml(d, res) {
            const bands = DELF_BANDS(d.level);
            const isWriting = d.kind === "writing";
            const maxOf = (c) => c.max ?? c.values[c.values.length - 1];
            const percent = Math.round((d.exam25 / 25) * 100);
            const tone = d.exam25 >= 12.5 ? "good" : d.exam25 >= 5 ? "mid" : "low";

            const rows = d.criteria.map(c => {
                const b = delfBandIndex(c);
                return `
                <div class="delf-row">
                    <div class="delf-crit">
                        <div class="delf-crit-name">${aiEscapeHtml(c.ka)} <span lang="fr">${aiEscapeHtml(c.fr)}</span></div>
                        <div class="delf-crit-help">${aiEscapeHtml(c.help)}</div>
                        ${c.comment ? `<div class="delf-crit-comment">${delfText(c.comment)}</div>` : ""}
                    </div>
                    <div class="delf-crit-score">
                        ${b >= 0 ? `<span class="delf-band delf-band-${b}">${aiEscapeHtml(bands[b])}</span>` : ""}
                        <b>${delfFmt(c.points)}</b><small>/ ${delfFmt(maxOf(c))}</small>
                    </div>
                </div>`;
            }).join("");

            const answersHtml = !isWriting && d.answers.length ? `
                <div class="delf-section-title">თქვენი პასუხები</div>
                ${d.answers.map(a => `
                    <div class="delf-answer">
                        <div class="delf-answer-head"><span>კითხვა ${a.question}</span><b>${delfFmt(a.points)} / 4</b></div>
                        ${a.transcript ? `<div class="delf-transcript" lang="fr">„${aiEscapeHtml(a.transcript)}“</div>` : ""}
                        ${a.comment ? `<div class="delf-crit-comment">${delfText(a.comment)}</div>` : ""}
                    </div>`).join("")}` : "";

            const anomaliesHtml = d.anomalies.length ? `
                <div class="delf-anomaly"><i class="fa-solid fa-triangle-exclamation"></i>
                    ${d.anomalies.map(a => aiEscapeHtml(DELF_ANOMALIES[a])).join("<br>")}</div>` : "";

            const examNote = isWriting && d.level === "A2"
                ? "DELF A2-ის წერით ნაწილში 2 დავალებაა, თითო 12,5 ქულა. ეს ტექსტი ერთი დავალებაა, ამიტომ 25-ქულიან სკალაზე ქულა გაორმაგებულია."
                : isWriting ? "DELF B1-ის წერითი ნაწილი ერთი ტექსტია, 25 ქულა."
                : "გამოცდაზე ზეპირი ნაწილი 25 ქულაა: 12 ქულა დავალებებზე და 13 ქულა ენის ცოდნაზე (ლექსიკა, გრამატიკა, გამოთქმა).";

            const errors = isWriting ? res.errors : d.errors;

            return `
            <div class="delf-card delf-${tone}">
                <div class="delf-head">
                    <div>
                        <div class="delf-kicker">DELF ${d.level} · ${isWriting ? "წერითი დავალების" : "ზეპირი დავალების"} შეფასება</div>
                        <div class="delf-score">${delfFmt(d.total)} <span>/ ${delfFmt(d.max)}</span></div>
                        ${isWriting ? `<div class="delf-words">${d.words} სიტყვა (მოთხოვნილია ~${d.expected})</div>` : ""}
                    </div>
                    <div class="delf-exam">
                        <div>გამოცდაზე სავარაუდოდ</div>
                        <div class="delf-exam-score">${delfFmt(d.exam25)}<span> / 25</span></div>
                        <div class="delf-meter"><span style="width:${Math.min(100, percent)}%"></span></div>
                    </div>
                </div>
                ${d.summary ? `<p class="delf-summary">${delfText(d.summary)}</p>` : ""}
                ${anomaliesHtml}
                <div class="delf-section-title">შეფასება კრიტერიუმების მიხედვით</div>
                <div class="delf-rows">${rows}</div>
                ${answersHtml}
                ${d.strengths ? `<div class="delf-box delf-box-good"><b><i class="fa-solid fa-thumbs-up"></i> რა გამოგივიდათ კარგად</b><div>${delfText(d.strengths)}</div></div>` : ""}
                ${d.improvements ? `<div class="delf-box delf-box-work"><b><i class="fa-solid fa-bullseye"></i> რაზე იმუშაოთ</b><div>${delfText(d.improvements)}</div></div>` : ""}
                ${errors ? `<details class="delf-details"><summary>შეცდომები და შესწორებები</summary><div>${delfText(errors)}</div></details>` : ""}
                ${isWriting && res.correct ? `<details class="delf-details"><summary>შესწორებული ტექსტი</summary><div lang="fr">${delfText(res.correct)}</div></details>` : ""}
                <details class="delf-details">
                    <summary>როგორ აფასებს DELF-ის გამომცდელი?</summary>
                    <div>
                        <p>გამომცდელი იყენებს ოფიციალურ ცხრილს (grille d'évaluation). ${isWriting ? "ტექსტი" : "მეტყველება"} ფასდება რამდენიმე კრიტერიუმით და თითოეულში ირჩევა ერთი დონე:</p>
                        <ul>
                            <li><b>${bands[0]}</b> (non répondu / production insuffisante) — პასუხი არ არის ან ძალიან ცოტაა შესაფასებლად.</li>
                            <li><b>${bands[1]}</b> (en dessous du niveau ciblé) — ჯერ ვერ აღწევს ${d.level} დონეს.</li>
                            <li><b>${bands[2]}</b> (au niveau ciblé) — ${d.level} დონის შესაბამისია.</li>
                            <li><b>${bands[3]}</b> — ${d.level} დონეზე უკეთესია.</li>
                        </ul>
                        <p>ერთი-ორი პატარა შეცდომა ტექსტს „არასწორს“ არ ხდის: გამომცდელი აფასებს, რამდენად კარგად ახერხებთ ენის გამოყენებას მთლიანობაში.</p>
                        <p>${examNote} გამოცდის ჩასაბარებლად საჭიროა სულ მინიმუმ 50/100 ქულა და თითო ნაწილში მინიმუმ 5/25.</p>
                    </div>
                </details>
                <p class="delf-disclaimer">ეს არის ხელოვნური ინტელექტის სავარაუდო შეფასება DELF-ის ოფიციალური ცხრილით. საბოლოო შეფასებას მასწავლებელი ადასტურებს.</p>
            </div>`;
        }

        // Same result as plain text, for the email and the PDF
        function delfBuildEmailText(d, res) {
            const bands = DELF_BANDS(d.level);
            const lines = [`DELF ${d.level} შეფასება (AI, ${d.kind === "writing" ? "წერა" : "ლაპარაკი"}): ${delfFmt(d.total)} / ${delfFmt(d.max)}  →  გამოცდაზე ≈ ${delfFmt(d.exam25)} / 25`];
            d.anomalies.forEach(a => lines.push(`⚠ ${DELF_ANOMALIES[a]}`));
            d.criteria.forEach(c => {
                const b = delfBandIndex(c);
                const max = c.max ?? c.values[c.values.length - 1];
                lines.push(`• ${c.fr} (${c.ka}): ${delfFmt(c.points)}/${delfFmt(max)}${b >= 0 ? ` [${bands[b]}]` : ""}${c.comment ? ` — ${c.comment.replace(/\s*\n+\s*/g, " ")}` : ""}`);
            });
            (d.answers || []).forEach(a => lines.push(`  კითხვა ${a.question}: ${delfFmt(a.points)}/4 — „${a.transcript}“ ${a.comment ? `— ${a.comment.replace(/\s*\n+\s*/g, " ")}` : ""}`));
            if (d.summary) lines.push(`შეჯამება: ${d.summary.replace(/\s*\n+\s*/g, " ")}`);
            const errors = d.kind === "writing" ? res.errors : d.errors;
            if (errors) lines.push(`შეცდომები:\n${errors}`);
            if (d.kind === "writing" && res.correct) lines.push(`შესწორებული ტექსტი:\n${res.correct}`);
            return lines.join("\n");
        }

        // =====================================================================
        // ===== FEEDBACK FOR NON-DELF COURSES (no grid, no score) =====
        // =====================================================================
        // DELF courses use the official DELF grids above. All other courses get
        // only strengths, weaknesses and a little advice, in Georgian.

        function isDelfCourse(course) {
            return /DELF/i.test(course || "");
        }

        function courseLevelFor(course) {
            const m = (course || "").match(/\b(A1|A2|B1|B2)\b/i);
            return m ? m[1].toUpperCase() : "A2";
        }

        function feedbackBuildWritingPrompt(level, instruction, text) {
            return `You are a kind, encouraging but honest French teacher for Georgian-speaking students at level ${level}.
Writing task given to the student: "${instruction}"
Student's text:
"""
${text}
"""

Do NOT give a score or a grade. Judge the text for a ${level} learner (do not expect more than this level).
Write everything IN GEORGIAN, addressed to the student ("თქვენ"), short and concrete, quoting their French words as examples:
- strengths: what they did well (2-3 points)
- weaknesses: the main weak points (2-3 points)
- advice: a little practical advice to do better next time (2-3 short tips)
- errors: one mistake per line: wrong → correct (very short explanation)
- correct: the full corrected text in French
Reply ONLY with JSON in this exact shape:
{"strengths":"","weaknesses":"","advice":"","errors":"","correct":""}`;
        }

        function feedbackBuildSpeakingPrompt(level, instruction, prompts) {
            return `You are a kind, encouraging but honest French teacher for Georgian-speaking students at level ${level}.
The student answered ${prompts.length} question(s) by recording their voice. Audio file number N is the answer to question number N.
Exercise instruction: "${instruction}"
Questions:
${prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Listen carefully. Do NOT give a score or a grade. Judge them as a ${level} learner (do not expect more than this level).
For each recording, write what the student said (transcript in French, as heard).
Then write everything else IN GEORGIAN, addressed to the student ("თქვენ"), short and concrete, quoting their French words as examples:
- strengths: what they did well (content, vocabulary, grammar, pronunciation, fluency)
- weaknesses: the main weak points
- advice: a little practical advice to do better next time (2-3 short tips)
Reply ONLY with JSON in this exact shape:
{"answers":[{"index":1,"transcript":""}],"strengths":"","weaknesses":"","advice":""}`;
        }

        function feedbackFromResult(kind, r, questionIndexes = []) {
            const list = Array.isArray(r?.answers) ? r.answers : [];
            return {
                kind,
                strengths: r?.strengths || "",
                weaknesses: r?.weaknesses || "",
                advice: r?.advice || "",
                answers: questionIndexes.map((qIndex, i) => {
                    const a = list.find(x => Number(x.index) === i + 1) || list[i] || {};
                    return { question: qIndex + 1, transcript: a.transcript || "" };
                })
            };
        }

        function feedbackBuildCardHtml(f, res) {
            const isWriting = f.kind === "writing";
            const transcripts = f.answers.filter(a => a.transcript);
            return `
            <div class="delf-card fb-card">
                <div class="delf-head fb-head">
                    <div>
                        <div class="delf-kicker">მასწავლებლის კომენტარი (AI)</div>
                        <div class="fb-title">${isWriting ? "თქვენი ტექსტის შეფასება" : "თქვენი ჩანაწერების შეფასება"}</div>
                    </div>
                </div>
                ${f.strengths ? `<div class="delf-box delf-box-good"><b><i class="fa-solid fa-thumbs-up"></i> ძლიერი მხარეები</b><div>${delfText(f.strengths)}</div></div>` : ""}
                ${f.weaknesses ? `<div class="delf-box fb-box-weak"><b><i class="fa-solid fa-triangle-exclamation"></i> სუსტი მხარეები</b><div>${delfText(f.weaknesses)}</div></div>` : ""}
                ${f.advice ? `<div class="delf-box delf-box-work"><b><i class="fa-solid fa-lightbulb"></i> რჩევა შემდეგი ჯერისთვის</b><div>${delfText(f.advice)}</div></div>` : ""}
                ${transcripts.length ? `<details class="delf-details"><summary>რა თქვით (ტრანსკრიფცია)</summary><div>${transcripts.map(a => `<p><b>კითხვა ${a.question}:</b> <span lang="fr">„${aiEscapeHtml(a.transcript)}“</span></p>`).join("")}</div></details>` : ""}
                ${isWriting && res.errors ? `<details class="delf-details"><summary>შეცდომები და შესწორებები</summary><div>${delfText(res.errors)}</div></details>` : ""}
                ${isWriting && res.correct ? `<details class="delf-details"><summary>შესწორებული ტექსტი</summary><div lang="fr">${delfText(res.correct)}</div></details>` : ""}
                <p class="delf-disclaimer">ეს არის ხელოვნური ინტელექტის კომენტარი. მასწავლებელიც ნახავს თქვენს ნამუშევარს.</p>
            </div>`;
        }

        function feedbackBuildEmailText(f, res) {
            const one = (s) => String(s || "").replace(/\s*\n+\s*/g, " ").trim();
            const lines = [`AI კომენტარი (${f.kind === "writing" ? "წერა" : "ლაპარაკი"}):`];
            if (f.strengths) lines.push(`ძლიერი მხარეები: ${one(f.strengths)}`);
            if (f.weaknesses) lines.push(`სუსტი მხარეები: ${one(f.weaknesses)}`);
            if (f.advice) lines.push(`რჩევა: ${one(f.advice)}`);
            f.answers.filter(a => a.transcript).forEach(a => lines.push(`  კითხვა ${a.question}: „${a.transcript}“`));
            if (f.kind === "writing" && res.errors) lines.push(`შეცდომები:\n${res.errors}`);
            if (f.kind === "writing" && res.correct) lines.push(`შესწორებული ტექსტი:\n${res.correct}`);
            return lines.join("\n");
        }
