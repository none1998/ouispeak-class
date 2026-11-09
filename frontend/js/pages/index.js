        // --- PASSWORD RESET FIX: read the reset link info from the URL before Supabase clears it ---
        const resetHashParams = new URLSearchParams(window.location.hash.replace(/^#+/, ''));
        const resetQueryParams = new URLSearchParams(window.location.search);
        const cameFromResetLink = resetHashParams.get('type') === 'recovery' || resetQueryParams.get('type') === 'recovery';
        const resetLinkError = resetHashParams.get('error_description') || resetQueryParams.get('error_description');
        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let isSignUpMode = false;
        let isRecoveryMode = false;
        let isForgotPasswordMode = false;
        if (cameFromResetLink) {
            isRecoveryMode = true;
        }
        let currentCourseTitle = "Syllabus";
        let studentCurrentCourse = null;

                function showError(msg) {
            const errBox = document.getElementById('authError');
            errBox.innerText = msg.message || msg || "დაფიქსირდა შეცდომა";
            errBox.style.display = "block";
        }

        function clearAuthForm() {
            const fields = ['emailInput', 'passwordInput', 'firstNameInput', 'lastNameInput', 'studentIdInput', 'birthdayInput', 'courseInput'];
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        function toggleForgotPasswordMode(forgotMode) {
            isForgotPasswordMode = forgotMode;
            document.getElementById('authError').style.display = "none";
            
            const studentIdGroup = document.getElementById('studentIdGroup');
            const studentIdInput = document.getElementById('studentIdInput');
            const passwordGroup = document.getElementById('passwordGroup');
            const passwordInput = document.getElementById('passwordInput');
            const forgotLink = document.getElementById('forgotPasswordLink');
            
            if (forgotMode) {
                document.getElementById('authTitle').innerText = "პაროლის აღდგენა";
                studentIdGroup.style.display = 'none';
                studentIdInput.removeAttribute('required');
                passwordGroup.style.display = 'none';
                passwordInput.removeAttribute('required');
                
                document.getElementById('authSubmitBtn').innerText = "ბმულის გაგზავნა";
                document.getElementById('authSwitchContainer').innerHTML = `გახსოვთ პაროლი? <span onclick="toggleForgotPasswordMode(false)">შესვლა</span>`;
                forgotLink.style.display = 'none';
            } else {
                document.getElementById('authTitle').innerText = "შესვლა სისტემაში";
                studentIdGroup.style.display = 'block';
                studentIdInput.setAttribute('required', '');
                passwordGroup.style.display = 'block';
                passwordInput.setAttribute('required', '');
                
                document.getElementById('authSubmitBtn').innerText = "შესვლა";
                document.getElementById('authSwitchContainer').innerHTML = `არ გაქვთ ანგარიში? <span onclick="toggleAuthMode(true)">რეგისტრაცია</span>`;
                forgotLink.style.display = 'block';
            }
        }

        function toggleAuthMode(signUpMode) {
            clearAuthForm();
            isSignUpMode = signUpMode;
            isForgotPasswordMode = false;
            document.getElementById('authError').style.display = "none";
            
            document.getElementById('firstNameGroup').style.display = signUpMode ? 'block' : 'none';
            document.getElementById('lastNameGroup').style.display = signUpMode ? 'block' : 'none';
            document.getElementById('birthdayGroup').style.display = signUpMode ? 'block' : 'none';
            document.getElementById('courseGroup').style.display = signUpMode ? 'block' : 'none';
            document.getElementById('forgotPasswordLink').style.display = signUpMode ? 'none' : 'block';
            
            const studentIdGroup = document.getElementById('studentIdGroup');
            const studentIdInput = document.getElementById('studentIdInput');
            const passwordGroup = document.getElementById('passwordGroup');
            const passwordInput = document.getElementById('passwordInput');
            const courseInput = document.getElementById('courseInput');
            
            passwordGroup.style.display = 'block';
            passwordInput.setAttribute('required', '');

            if (signUpMode) {
                studentIdGroup.style.display = 'none';
                studentIdInput.removeAttribute('required');
                courseInput.setAttribute('required', '');
            } else {
                studentIdGroup.style.display = 'block';
                studentIdInput.setAttribute('required', '');
                courseInput.removeAttribute('required');
            }
            
            document.getElementById('authTitle').innerText = signUpMode ? "ახალი რეგისტრაცია" : "შესვლა სისტემაში";
            document.getElementById('authSubmitBtn').innerText = signUpMode ? "რეგისტრაცია" : "შესვლა";
            document.getElementById('authSwitchContainer').innerHTML = signUpMode ? 
                `უკვე გაქვთ ანგარიში? <span onclick="toggleAuthMode(false)">შესვლა</span>` : 
                `არ გაქვთ ანგარიში? <span onclick="toggleAuthMode(true)">რეგისტრაცია</span>`;
        }

        function generateRandomId() {
            return Math.floor(1000000000 + Math.random() * 9000000000);
        }

        async function handleAuthSubmit(e) {
            e.preventDefault();
            document.getElementById('authError').style.display = "none";
            
            const email = document.getElementById('emailInput').value;

            if (isForgotPasswordMode) {
                const { error } = await _supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + window.location.pathname,
                });
                if (error) return showError(error);
                alert("პაროლის აღდგენის ბმული გაიგზავნა თქვენს ელ-ფოსტაზე!");
                toggleForgotPasswordMode(false);
                return;
            }

            const password = document.getElementById('passwordInput').value;

            if (isSignUpMode) {
                const firstName = document.getElementById('firstNameInput').value;
                const lastName = document.getElementById('lastNameInput').value;
                const birthday = document.getElementById('birthdayInput').value;
                const course = document.getElementById('courseInput').value;
                const randomId = generateRandomId();
                
                if(!course) {
                    return showError("გთხოვთ აირჩიოთ კურსი.");
                }

                const { data, error } = await _supabase.auth.signUp({ email, password });
                if (error) return showError(error);

                if (data.user) {
                    const { error: dbError } = await _supabase
                        .from('Students')
                        .insert([
                            { 
                                id: randomId, 
                                auth_id: data.user.id, 
                                firstName: firstName, 
                                lastName: lastName, 
                                email: email,
                                birthday: birthday || null,
                                course: course
                            }
                        ]);

                    if (dbError) {
                        return showError("ვერ მოხერხდა მონაცემების შენახვა.");
                    }

                    await _supabase.auth.signOut();
                    window.location.href = "welcome.html"; 
                }
            } else {
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

                handleCourseAccess(studentData.course);
            }
        }

        async function handleUpdatePassword(e) {
            e.preventDefault();
            document.getElementById('authError').style.display = "none";
            
            const newPassword = document.getElementById('newPasswordInput').value;
            const { error } = await _supabase.auth.updateUser({ password: newPassword });

            if (error) {
                return showError(error);
            }

            alert("პაროლი წარმატებით განახლდა!");
            isRecoveryMode = false;
            await _supabase.auth.signOut();
        }

        function handleCourseAccess(courseName) {
            studentCurrentCourse = courseName;
            const allCourseCards = [
                'card_A1_-_სასაუბრო_კურსი',
                'card_A2_-_სასაუბრო_კურსი',
                'card_B1_-_სასაუბრო_კურსი',
                'card_DELF_A2_-_კურსი',
                'card_DELF_B1_-_კურსი'
            ];

            // მომავალში აქ ჩაამატებთ სხვა დასაბლოკ კურსებსაც მძიმით გამოყოფილს
            const lockedCourses = [
                //'card_A1_-_სასაუბრო_კურსი',
                //'card_A2_-_სასაუბრო_კურსი',
                'card_B1_-_სასაუბრო_კურსი',
                //'card_DELF_A2_-_კურსი',
                //'card_DELF_B1_-_კურსი'
            ];

            allCourseCards.forEach(id => {
                const card = document.getElementById(id);
                if (card) {
                    if (lockedCourses.includes(id)) {
                        card.classList.add('blocked-course');
                        const btn = card.querySelector('.btn');
                        if (btn) btn.setAttribute('disabled', 'true');
                    } else {
                        card.classList.remove('blocked-course');
                        const btn = card.querySelector('.btn');
                        if (btn) btn.removeAttribute('disabled');
                    }
                }
            });
        }

        function clearCourseFilters() {
            const allCourseCards = [
                'card_A1_-_სასაუბრო_კურსი',
                'card_A2_-_სასაუბრო_კურსი',
                'card_B1_-_სასაუბრო_კურსი',
                'card_DELF_A2_-_კურსი',
                'card_DELF_B1_-_კურსი'
            ];

            // მომავალში აქაც ჩაამატებთ ზუსტად იგივე კურსებს, რაც ზემოთ ფუნქციაშია
            const lockedCourses = [
                //'card_A1_-_სასაუბრო_კურსი',
                //'card_A2_-_სასაუბრო_კურსი',
                'card_B1_-_სასაუბრო_კურსი',
                //'card_DELF_A2_-_კურსი',
                //'card_DELF_B1_-_კურსი'
            ];

            allCourseCards.forEach(id => {
                const card = document.getElementById(id);
                if (card) {
                    if (lockedCourses.includes(id)) {
                        card.classList.add('blocked-course');
                        const btn = card.querySelector('.btn');
                        if (btn) btn.setAttribute('disabled', 'true');
                    } else {
                        card.classList.remove('blocked-course');
                        const btn = card.querySelector('.btn');
                        if (btn) btn.removeAttribute('disabled');
                    }
                }
            });
        }

        async function handleLogout() {
            await _supabase.auth.signOut();
            clearCourseFilters();
        }

        async function loadExercises() {
            const { data: exercises, error } = await _supabase.from('Exercises').select('*');
            if (error) return;
            const container = document.getElementById('exercisesContainer');
            container.innerHTML = "";
            if (exercises && exercises.length > 0) {
                exercises.forEach(ex => {
                    const exDiv = document.createElement('div');
                    exDiv.className = 'exercise-container';
                    exDiv.innerHTML = `
                        <div class="exercise-q">${ex.question}</div>
                        <div class="exercise-options">
                            <label class="option-label"><input type="radio" name="ex_${ex.id}" value="A"> A) ${ex.option_a}</label>
                            <label class="option-label"><input type="radio" name="ex_${ex.id}" value="B"> B) ${ex.option_b}</label>
                            <label class="option-label"><input type="radio" name="ex_${ex.id}" value="C"> C) ${ex.option_c}</label>
                        </div>`;
                    container.appendChild(exDiv);
                });
            } else {
                container.innerHTML = "<p>ამჟამად სავარჯიშოები არ არის დამატებული.</p>";
            }
        }

        const originalSyllabusHTML = `
            <tr>
                <td class="week-column">1</td>
                <td class="content-column">ტესტისა და მისი სტრუქტურის გაცნობა, მოსასმენი დავალებების ტექნიკები, შესავალი მოსასმენ დავალებებში : გავიგოთ ანონსები და ინსტრუქციები <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ანონსები მაღაზიებში, აეროპორტებსა და მატარებლის სადგურებზე </span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> დრო Présent, ზმნების ჯგუფები და უღლება (პირველი, მეორე და მესამე ჯგუფის ზმნები)</div></td>
            </tr>
            <tr>
                <td class="week-column">2</td>
                <td class="content-column">მოსასმენი დავალებების გაგრძელება : გავიგოთ ანონსები და ინსტრუქციები <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ანონსები მაღაზიებში, აეროპორტებსა და მატარებლის სადგურებზე - ნაწილი 2</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> დრო Passé composé</div></td>
            </tr>
            <tr>
                <td class="week-column">3</td>
                <td class="content-column">შესავალი წაკითხულის გააზრებაში : წავიკითხოთ ინფორმაციული ბანერები <span class="tag-ecrit">Comprehension des écrits</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : სატელევიზიო არხები და გადაცემები, ცეკვის წრეები და სპორტული კლუბები </span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> დრო Imparfait</div></td>
            </tr>
            <tr>
                <td class="week-column">4</td>
                <td class="content-column">შესავალი წერით ნაწილში : განვიხილოთ წერითი ნაწილის სტრუქტურა; დავწეროთ ჩვენი მოგზაურობის ან არდადეგების შესახებ <span class="tag-ecrit">Production écrite</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : მოგზაურობა და არდადეგები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ახლო მომავალი დრო (Futur proche)</div></td>
            </tr>
            <tr>
                <td class="week-column">5</td>
                <td class="content-column">შესავალი სასაუბრო ნაწილში : ვისაუბროთ ჩვენს შესახებ და გავაცნოთ გამსაუბრებელს ჩვენი თავი <span class="tag-oral">Production orale</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : საკუთარი თავის აღწერა; ოჯახის წევრები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ახლო წარსული დრო (Passé recent)</div></td>
            </tr>
            <tr>
                <td class="week-column">6</td>
                <td class="content-column">მოსასმენი დავალებების გაგრძელება : გავიგოთ ანონსები და ინსტრუქციები რასაც გვაძლევენ - ნაწილი 2 <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ანონსები მაღაზიებში, აეროპორტებსა და მატარებლის სადგურებზე</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> სამი ნასწავლი დროის შეჯამება (ახლანდელი, ახლო წარსული და ახლო მომავალი)</div></td>
            </tr>
            <tr>
                <td class="week-column">7</td>
                <td class="content-column">გასული გააზრების დავალებების გაგრძელება : წავიკითხოთ ინფორმაციული ბანერები - ნაწილი 2 <span class="tag-ecrit">Comprehension des écrits</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ინფორმაციული ბანერები, სარეკლამო ბანერები, სარესტორნო სარეკლამო ბანერები</span><div class="grammar-block"><span class="grammar-title">გრამარიკა:</span> ბრძანებითი კილო (Impératif)</div></td>
            </tr>
            <tr>
                <td class="week-column">8</td>
                <td class="content-column">წერითი დავალებების გაგრძელება : დღესასწაულები, რაიმე მნიშვნელოვანის აღნიშვნა და დაგეგმილი ღონისძიებები <span class="tag-ecrit">Production écrite</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : წვეულებები, დაბადების დღეები, ქორწილები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> მარტივი მომავალი დრო (Futur simple)</div></td>
            </tr>
            <tr>
                <td class="week-column">9</td>
                <td class="content-column">სასაუბრო დავალებების გაგრძელება : ვისაუბროთ ჩვენი გასული დღის შესახებ <span class="tag-oral">Production orale</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ნაცვალსახელოვანი ზმნები: se réveiller, se lever, s'habiller, se brosser... </span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ორი ნასწავლი დროის შედარება (ახლო მომავალი და მარტივი მომავალი დროები)</div></td>
            </tr>
            <tr>
                <td class="week-column">10</td>
                <td class="content-column">მოსასმენი დავალებების გაგრძელება : გავიგოთ რადიო გადაცემების სტრუქტურა <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : რადიო გადაცემები და სიახლეები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> წარსული დროების შედარება (Passé composed, Imparfait)</div></td>
            </tr>
            <tr>
                <td class="week-column">11</td>
                <td class="content-column">წასაკითხი დავალებების გაგრძელება : წავიკითხოთ წერილები და ელექტრონული ფოსტა <span class="tag-ecrit">Comprehension des écrits</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : პირადი და ოფიციალური წერილები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> წინადადებების განხილვა ყველა განვლილ დროსა და კილოში</div></td>
            </tr>
            <tr>
                <td class="week-column">12</td>
                <td class="content-column">წერითი დავალებების გაგრძელება : დავწეროთ ჩვენი გამოცდილების შესახებ, თუ რა მოხდა, ან რა გადაგვხდა თავს <span class="tag-ecrit">Production écrite</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : თავგადასავლები და ყოველდღიური ისტორიები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> დროების შეჯამება და პრაქტიკული ანალიზი - ნაწილი 2</div></td>
            </tr>
            <tr>
                <td class="week-column">13</td>
                <td class="content-column">სასაუბრო დავალებების გაგრძელება : ვესაუბროთ გამომცდელს და ვუპასუხოთ მის მიერ დასმულ შეკითხვებს ჩვენს შესახებ <span class="tag-oral">Production orale</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ინტერესები, ჰობი და პროფესიები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> კითხვითი წინადადებების კონსტრუქციები - ნაწილი 3</div></td>
            </tr>
            <tr>
                <td class="week-column">14</td>
                <td class="content-column">მოსასმენი დავალებების გაგრძელება : გავიგოთ რას გვეუნნება ფრანგულად მოსაუბრე ადამიანი <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : დიალოგები ქუჩაში და მაღაზიაში</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> არტიკლები : განსაზღვრული და განუსაზღვრელი</div></td>
            </tr>
            <tr>
                <td class="week-column">15</td>
                <td class="content-column">წასაკითხი დავალებების გაგრძელება : წავიკითხოთ და გავიაზროთ ინსტრუქციები <span class="tag-ecrit">Comprehension des écrits</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : რეცეპტები, ტექნიკური მითითებები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> არტიკლები : ნაწილობრივი (Articles partitifs)</div></td>
            </tr>
            <tr>
                <td class="week-column">16</td>
                <td class="content-column">წერითი დავალებების გაგრძელება : ვუპასუხოთ წერილს, გადავიხადოთ მადლობა, დავპატიჟოთ ან ინფორმაცია მივაწოდოთ <span class="tag-ecrit">Production écrite</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : მადლობისა და მიწვევის ფორმულები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> მიმართებითი ნაცვალსახელები (Qui და Que)</div></td>
            </tr>
            <tr>
                <td class="week-column">17</td>
                <td class="content-column">სასაუბრო დავალებების გაგრძელება : ვისაუბროთ კონკრეტული თემების შესახებ, რომელსაც გამომცდელი მოგვაწვდის <span class="tag-oral">Production orale</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : კულტურა, გარემო და ტრანსპორტი</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> მიმართებითი ნაცვალსახელები (Qui და Que) - ნაწილი 2</div></td>
            </tr>
            <tr>
                <td class="week-column">18</td>
                <td class="content-column">მოსასმენი დავალებების გაგრძელება : გავიგოთ რას საუბრობენ ფრანგები ერთმანეთში <span class="tag-oral">Comprehension de l'oral</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ყოველდღიური ჟარგონები და ფრაზები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> კონსტრუქციები: • « Etre en train de » • « Être sur le point de »</div></td>
            </tr>
            <tr>
                <td class="week-column">19</td>
                <td class="content-column">წასაკითხი დავალებების გაგრძელება : წავიკითხოთ უბრალოდ ინტერესისთვის ან რაიმე კონკრეტული ინფორმაციის მისაღებად <span class="tag-ecrit">Comprehension des écrits</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : მოკლე სტატიები და ახალი ამბები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> კონსტრუქცია « J'aurais dû »</div></td>
            </tr>
            <tr>
                <td class="week-column">20</td>
                <td class="content-column">წერითი დავალებების გაგრძელება : ვუპასუხოთ წერილს, გადავიხადოთ მადლობა - ნაწილი 2 <span class="tag-ecrit">Production écrite</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : ოფიციალური შეწერების სტილი</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> კონსტრუქცია « J'aurais pu » და მისი შედარება კონსტრუქციასთან « J'aurais dû »</div></td>
            </tr>
            <tr>
                <td class="week-column">21</td>
                <td class="content-column">სასაუბრო დავალებების გაგრძელება : ვისაუბროთ კონკრეტულ საკითხზე გამომცდელთან და ვუპასუხოთ შეკითხვებს <span class="tag-oral">Production orale</span></td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა : არგუმენტირებული პასუხები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ადგილმდებარეობის ნაცვალსახელი "Y" (Le pronom Y)</div></td>
            </tr>
            <tr>
                <td class="week-column">22</td>
                <td class="content-column">მთლიანი ტესტის დამუშავება - ნაწილი 1</td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> დროების გამეორება</div></td>
            </tr>
            <tr>
                <td class="week-column">23</td>
                <td class="content-column">მთლიანი ტესტის დამუშავება - ნაწილი 2</td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ზოგადი საკითხები</div></td>
            </tr>
            <tr>
                <td class="week-column">24</td>
                <td class="content-column">მთლიანი ტესტის დამუშავება - ნაწილი 3</td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ზოგადი საკითხები 2</div></td>
            </tr>
            <tr>
                <td class="week-column">25</td>
                <td class="content-column">მთლიანი ტესტის დამუშავება - ნაწილი 4</td>
                <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ზოგადი საკითხები 3</div></td>
            </tr>
            <tr>
                <td class="week-column" style="border-bottom-left-radius: 6px;">26</td>
                <td class="content-column" style="border-bottom: 1px solid #f1f5f9;">გამოცდისთვის მომზადება, ზოგადი საკითხები</td>
                <td class="focus-column" style="padding-left: 16px; border-bottom-right-radius: 6px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ზოგადი საკითხები 4</div></td>
            </tr>
        `;

        const syllabusData = {
            "1": originalSyllabusHTML, 
            "2": `
                <tr>
                    <td class="week-column">1</td>
                    <td class="content-column">B1 დონის სტრუქტურის გაცნობა, არგუმენტირებული ესეს საფუძვლები <span class="tag-ecrit">Production écrite</span></td>
                    <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა: საზოგადოებრივი პრობლემები, ეკოლოგია</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> Subjonctif présent - შესავალი და უღლება</div></td>
                </tr>
                <tr>
                    <td class="week-column">2-26</td>
                    <td class="content-column">ინტენსიური მომზადება DELF B1 გამოცდისთვის (აქ ჩაწერე დანარჩენი კვირები)...</td>
                    <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ შესაბამისი ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> B1 დონის კომპლექსური სტრუქტურები</div></td>
                </tr>
            `,
            "3": `
                <tr>
                    <td class="week-column">1</td>
                    <td class="content-column">ფრანგული ანბანი, კითხვის წესები და მისალმების ფორმები <span class="tag-oral">Production orale</span></td>
                    <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ლექსიკა: მისალმება, დამშვიდობება, თავაზიანი ფრაზები</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> ზმნები Être და Avoir ახლანდელ დროში</div></td>
                </tr>
                <tr>
                    <td class="week-column">2-26</td>
                    <td class="content-column">სასაუბრო პრაქტიკა დამწყებთათვის ყოველდღიურ თემებზე...</td>
                    <td class="focus-column" style="padding-left: 16px;"><span class="vocab-title">▪ ყოველდღიური ლექსიკა</span><div class="grammar-block"><span class="grammar-title">გრამატიკა:</span> მარტივი წინადადებების კონსტრუქციები</div></td>
                </tr>
            `
        };

        const syllabusPdfs = {
            "A1 - სასაუბრო კურსი": "pdfs/speak_a1_syllabus.pdf",
            "A2 - სასაუბრო კურსი": "pdfs/speak_a2_syllabus.pdf",
            "B1 - სასაუბრო კურსი": "pdfs/speak_b1_syllabus.pdf",
            "DELF A2 - კურსი": "pdfs/delf_a2_syllabus.pdf",
            "DELF B1 - კურსი": "pdfs/delf_b1_syllabus.pdf",
            "Delf A2 - კურსი": "pdfs/delf_a2_syllabus.pdf",
            "Delf B1 - კურსი": "pdfs/delf_b1_syllabus.pdf"
        };

        document.querySelectorAll('.syllabus-link').forEach(button => {
            button.addEventListener('click', function() {
                const cardTitle = this.parentElement.querySelector('h2').innerText;
                const pdfPath = syllabusPdfs[cardTitle.trim()];
                if (pdfPath) {
                    window.open(pdfPath, '_blank');
                } else {
                    alert("ფაილი ვერ მოიძებნა.");
                }
            });
        });

        document.getElementById('downloadPdfBtn').addEventListener('click', function() {
            const element = document.getElementById('pdfContainer');
            const opt = {
                margin:       [0.4, 0.4, 0.4, 0.4],
                filename:     `${currentCourseTitle.replace(/\s+/g, '_')}_Syllabus.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { 
                    scale: 2, 
                    useCORS: true, 
                    scrollY: 0, 
                    scrollX: 0, 
                    x: 0,
                    windowWidth: 800,
                    width: element.clientWidth
                },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(element).save();
        });

        function closeModal() { document.getElementById('previewModal').style.display = 'none'; }
        window.onclick = function(e) { if (e.target == document.getElementById('previewModal')) closeModal(); }

        document.getElementById('exercisesNavLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (!studentCurrentCourse) {
                alert("გთხოვთ ჯერ გაიაროთ ავტორიზაცია კურზე წვდომისთვის.");
                return;
            }
            window.location.href = "exercice.html";
        });
        document.getElementById('vocabNavLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (!studentCurrentCourse) {
                alert("გთხოვთ ჯერ გაიაროთ ავტორიზაცია კურზე წვდომისთვის.");
                return;
            }
            window.location.href = "vocab.html";
        });

        /* --- THE FIXED SINGLE AUTHENTICATION FLOW --- */
        async function verifyStudentPermissions(user) {
            try {
                const { data: studentData, error } = await _supabase
                    .from('Students')
                    .select('course, is_active')
                    .eq('auth_id', user.id)
                    .maybeSingle(); 
                
                if (error) {
                    console.error("Database error verifying student:", error);
                    return;
                }

                if (studentData) {
                    if (studentData.is_active === false) {
                        await _supabase.auth.signOut();
                        showError("პლატფორმაზე წვდომა შეგეზღუდათ დავალიანების გამო. გთხოვთ, დაუკავშირდეთ ადმინისტრაციას.");
                        return;
                    }
                    handleCourseAccess(studentData.course);
                }
            } catch (err) {
                console.error("Session verification catch block:", err);
            }
        }

        _supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                isRecoveryMode = true;
                document.getElementById('authSection').style.display = 'block';
                document.getElementById('authTitle').innerText = "პაროლის შეცვლა";
                document.getElementById('authForm').style.display = 'none';
                document.getElementById('authSwitchContainer').style.display = 'none';
                document.getElementById('updatePasswordForm').style.display = 'block';
                
                document.getElementById('protectedContent').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'none';
            } else if (session && isRecoveryMode) {
                document.getElementById('authSection').style.display = 'block';
                document.getElementById('authTitle').innerText = "პაროლის შეცვლა";
                document.getElementById('authForm').style.display = 'none';
                document.getElementById('authSwitchContainer').style.display = 'none';
                document.getElementById('updatePasswordForm').style.display = 'block';
                
                document.getElementById('protectedContent').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'none';
            } else if (session && !isRecoveryMode) {
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('protectedContent').style.display = 'block';
                document.getElementById('logoutBtn').style.display = 'block';
                
                verifyStudentPermissions(session.user);
                loadHeaderScore(session.user.email);   // <-- add this line
                loadExercises();
            } else if (!session) {
                isRecoveryMode = false;
                document.getElementById('authSection').style.display = 'block';
                document.getElementById('authForm').style.display = 'block';
                document.getElementById('authSwitchContainer').style.display = 'block';
                document.getElementById('updatePasswordForm').style.display = 'none';
                
                document.getElementById('protectedContent').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'none';
                studentCurrentCourse = null; 
                clearCourseFilters();
            }
        });

        if (resetLinkError) {
            showError(resetLinkError);
        }
    
