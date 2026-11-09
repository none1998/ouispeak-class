        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let studentCourse = null;
        let authenticatedUserEmail = "";
        let currentActiveBlock = 1;

        const courseColorMap = {
            "A1 - სასაუბრო კურსი": {
                color: "#0072ce",
                gradient: "linear-gradient(135deg, #004280 0%, #0072ce 100%)"
            },
            "A2 - სასაუბრო კურსი": {
                color: "#008751",
                gradient: "linear-gradient(135deg, #004d2e 0%, #008751 100%)"
            },
            "DELF A2 - კურსი": {
                color: "#3b51d8",
                gradient: "linear-gradient(135deg, #1d2570 0%, #3b51d8 100%)"
            },
            "A2 - DELF კურსი": {
                color: "#3b51d8",
                gradient: "linear-gradient(135deg, #1d2570 0%, #3b51d8 100%)"
            },
            "DELF B1 - კურსი": {
                color: "#b01268",
                gradient: "linear-gradient(135deg, #4d0028 0%, #b01268 100%)"
            },
            "B1 - DELF კურსი": {
                color: "#b01268",
                gradient: "linear-gradient(135deg, #4d0028 0%, #b01268 100%)"
            },
            "B1 - სასაუბრო კურსი": {
                color: "#b01268",
                gradient: "linear-gradient(135deg, #4d0028 0%, #b01268 100%)"
            }
        };

                function setCourseTheme(courseName) {
            const theme = courseColorMap[courseName] || {
                color: "#0055a5",
                gradient: "linear-gradient(135deg, #0055a5 0%, #0077e6 100%)"
            };
            document.documentElement.style.setProperty('--course-color', theme.color);
            document.documentElement.style.setProperty('--course-gradient', theme.gradient);
        }

        // Structured vocabulary matching course schemas

        function showError(msg) {
            const errBox = document.getElementById('authError');
            errBox.innerText = msg.message || msg || "დაფიქსირდა შეცდომა";
            errBox.style.display = "block";
        }

        async function handleAuthSubmit(e) {
            e.preventDefault();
            document.getElementById('authError').style.display = "none";
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            const studentId = document.getElementById('studentIdInput').value;

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
                    await loadCourseContent("vocab");
                    setCourseTheme(studentCourse);
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
            const titleElement = document.getElementById('vocabTitle');
            const sidebar = document.getElementById('exerciseSidebar');

            if (!selectedValue) {
                titleElement.innerText = studentCourse ? `${studentCourse} - ლექსიკა` : "ონლაინ ლექსიკა";
                sidebar.style.display = "none";
                document.getElementById('vocabContainer').innerHTML = '<div class="instruction-box">გთხოვთ აირჩიეთ კვირა და შესაბამისი ნაწილი.</div>';
                return;
            }

            sidebar.style.display = "flex"; 
            const selectedText = selectElement.options[selectElement.selectedIndex].text;
            titleElement.innerText = `${studentCourse || ''} - ${selectedText}`;
            loadVocabBlock(1); 
        }

        function loadVocabBlock(blockNumber) {
            currentActiveBlock = blockNumber;
            const items = document.querySelectorAll('.sidebar-item');
            items.forEach((item, index) => {
                if ((index + 1) === blockNumber) item.classList.add('active');
                else item.classList.remove('active');
            });
            renderVocabulary();
        }

        function downloadAsWord() {
            const subject = document.getElementById('subjectSelect').value;
            if (!studentCourse || !vocabDataset[studentCourse] || !vocabDataset[studentCourse][subject]) return;

            const block1 = vocabDataset[studentCourse][subject][1];
            const block2 = vocabDataset[studentCourse][subject][2];

            let docContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head>
                    <meta charset='utf-8'>
                    <title>OuiSpeak Vocabulary</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333333; }
                        h2 { color: #0055a5; border-bottom: 2px solid #0055a5; padding-bottom: 5px; margin-top: 30px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
                        th { background-color: #0055a5; color: white; text-align: left; padding: 10px; font-weight: bold; }
                        td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                        tr:nth-child(even) { background-color: #f8fafc; }
                    </style>
                </head>
                <body>
                    <h1>OuiSpeak - ${studentCourse}</h1>
                    <p><strong>კვირა:</strong> ${document.getElementById('subjectSelect').options[document.getElementById('subjectSelect').selectedIndex].text}</p>
            `;

            if (block1 && block1.vocabulary && block1.vocabulary.length >= 2) {
                docContent += `<h2>საჭირო ფრაზები</h2><table><tr><th>French</th><th>Georgian</th></tr>`;
                block1.vocabulary.slice(0, 2).forEach(item => {
                    docContent += `<tr><td><b>${item.french}</b></td><td>${item.georgian}</td></tr>`;
                });
                docContent += `</table>`;
            }

            if (block2 && block2.vocabulary) {
                docContent += `<h2>უცხო სიტყვები</h2><table><tr><th>French</th><th>Georgian</th></tr>`;
                block2.vocabulary.slice(0, 20).forEach(item => {
                    docContent += `<tr><td><b>${item.french}</b></td><td>${item.georgian}</td></tr>`;
                });
                docContent += `</table>`;
            }

            docContent += `</body></html>`;

            const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OuiSpeak_Vocabulary_${subject}.doc`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function renderVocabulary() {
            const subject = document.getElementById('subjectSelect').value;
            const container = document.getElementById('vocabContainer');

            if (!studentCourse || !vocabDataset[studentCourse] || !vocabDataset[studentCourse][subject] || !vocabDataset[studentCourse][subject][currentActiveBlock]) {
                container.innerHTML = `<div class="instruction-box" style="color: var(--secondary);">ამ კვირის ლექსიკა მიმდინარე კურსისთვის ჯერ არ არის დამატებული.</div>`;
                return;
            }

            const blockData = vocabDataset[studentCourse][subject][currentActiveBlock]; 
            const wordList = blockData.vocabulary;
            const instruction = blockData.instruction;
            
            let htmlContent = `<div class="instruction-box">${instruction}</div>`;

            if (currentActiveBlock === 1) {
                htmlContent += `<div class="flashcard-grid-two-up">`;
                wordList.forEach((item) => {
                    htmlContent += `
                        <div class="premium-flip-card" onclick="this.classList.toggle('flipped')">
                            <div class="premium-flip-inner">
                                <div class="premium-card-front">
                                    <div class="french-text-display">${item.french}</div>
                                    <div class="card-hint">გადაატრიალეთ</div>
                                </div>
                                <div class="premium-card-back">
                                    <div class="georgian-text-display">${item.georgian}</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                htmlContent += `</div>`;
            } else {
                htmlContent += `<div class="words-grid-compact">`;
                wordList.forEach((item) => {
                    htmlContent += `
                        <div class="compact-flip-card" onclick="this.classList.toggle('flipped')">
                            <div class="compact-flip-inner">
                                <div class="compact-card-front">
                                    <div class="french-word-display">${item.french}</div>
                                </div>
                                <div class="compact-card-back">
                                    <div class="georgian-word-display">${item.georgian}</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                htmlContent += `</div>`;
            }

            // Append stylized download button at the end of block 2 (20 words section)
            if (currentActiveBlock === 2) {
                htmlContent += `
                    <div class="download-btn-container">
                        <button class="download-vocab-btn" onclick="downloadAsWord()">
                            <i class="fa-solid fa-file-word"></i> გადმოწერა
                        </button>
                    </div>
                `;
            }

            container.innerHTML = htmlContent;
        }

        // ===== PDF download instead of the Word file =====
        // New code only. The "გადმოწერა" button calls downloadAsWord(), so downloadAsWord now points
        // to downloadVocabPdf (the original Word function above stays in the file, unchanged).
        // The PDF contains ALL phrases and ALL words of the week, and no row is ever split between pages.
        let vocabPdfInProgress = false;

        async function downloadVocabPdf() {
            if (vocabPdfInProgress) return;
            const subjectSelect = document.getElementById('subjectSelect');
            const subject = subjectSelect.value;
            if (!studentCourse || !vocabDataset[studentCourse] || !vocabDataset[studentCourse][subject]) return;
            if (typeof html2pdf === "undefined") {
                alert("PDF-ის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.");
                return;
            }

            const weekText = subjectSelect.options[subjectSelect.selectedIndex].text;
            const block1 = vocabDataset[studentCourse][subject][1];
            const block2 = vocabDataset[studentCourse][subject][2];

            const sectionHtml = (title, list) => {
                if (!list || !list.length) return "";
                const rows = list.map((item, i) => `
                    <div class="vpdf-row" style="page-break-inside:avoid;break-inside:avoid;display:flex;gap:14px;align-items:flex-start;padding:9px 14px;margin:0 0 6px 0;border:1px solid #e2e8f0;border-left:4px solid #0055a5;border-radius:8px;background:${i % 2 ? "#f8fafc" : "#ffffff"};">
                        <div style="flex:0 0 26px;font-size:11px;font-weight:800;color:#0055a5;padding-top:2px;">${i + 1}</div>
                        <div style="flex:1 1 50%;font-size:13.5px;font-weight:700;color:#0f172a;word-wrap:break-word;">${item.french}</div>
                        <div style="flex:1 1 50%;font-size:13px;color:#334155;word-wrap:break-word;">${item.georgian}</div>
                    </div>`).join("");
                return `
                    <div class="vpdf-head" style="page-break-inside:avoid;break-inside:avoid;margin:20px 0 8px 0;padding:10px 14px;background:#eaf2fb;border-left:5px solid #0055a5;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:15px;font-weight:800;color:#082c55;">${title}</div>
                        <div style="font-size:11px;font-weight:700;color:#0055a5;">${list.length}</div>
                    </div>
                    <div style="display:flex;gap:14px;padding:0 14px 6px 54px;font-size:10px;font-weight:700;color:#64748b;">
                        <div style="flex:1 1 50%;">ფრანგული</div>
                        <div style="flex:1 1 50%;">ქართული</div>
                    </div>
                    ${rows}`;
            };

            const element = document.createElement("div");
            element.style.cssText = "width:700px;background:#ffffff;color:#0f172a;font-family:'Inter','Noto Sans Georgian','Segoe UI',sans-serif;line-height:1.5;";
            element.innerHTML = `
                <div style="position:relative;overflow:hidden;background:#082c55;border-radius:14px;padding:22px 24px 20px 32px;color:#ffffff;">
                    <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:linear-gradient(180deg,#0055a5 0 33.33%,#ffffff 33.33% 66.66%,#ef4135 66.66% 100%);"></div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.7);">OuiSpeak</div>
                    <div style="font-size:22px;font-weight:800;margin:2px 0 6px 0;">ლექსიკა</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.85);">${studentCourse} · ${weekText}</div>
                    ${block1 && block1.instruction ? `<div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.7);">${block1.instruction}</div>` : ""}
                </div>
                ${sectionHtml("საჭირო ფრაზები", block1 && block1.vocabulary)}
                ${sectionHtml("უცხო სიტყვები", block2 && block2.vocabulary)}
                <div class="vpdf-row" style="page-break-inside:avoid;break-inside:avoid;margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">© 2026 OuiSpeak</div>
            `;

            vocabPdfInProgress = true;
            try {
                await html2pdf().set({
                    margin: [10, 10, 12, 10],
                    filename: `OuiSpeak_Vocabulary_${subject}.pdf`,
                    image: { type: "jpeg", quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                    pagebreak: { mode: ["css", "legacy"], avoid: [".vpdf-row", ".vpdf-head"] }
                }).from(element).save();
            } catch (e) {
                console.error("PDF download failed:", e);
                alert("PDF-ის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.");
            } finally {
                vocabPdfInProgress = false;
            }
        }

        downloadAsWord = downloadVocabPdf;


        checkUserSession();
        _supabase.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) {
            loadHeaderScore(data.session.user.email);
        }
    });
    
