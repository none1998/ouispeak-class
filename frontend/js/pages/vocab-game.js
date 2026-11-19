// ============================================================
// Bataille de Territoire — vocabulary territory game (vs robot "Robo")
// Opened from vocab.html with the "თამაში" button.
// window.VocabGame.open({ words, phrases, weekLabel, storageKey, course })
//
// Every tile = one word or one phrase of the week. Each tile has a FACE:
//   "fr"   → shows the French word,  student answers in Georgian
//   "ka"   → shows the Georgian word, student answers in French
//   "fill" → card "შეავსე წინადადება": a sentence with a missing word
//            (week phrases + NEW sentences for words, written by the AI each game;
//             built-in sentences are used if the AI does not answer)
// At least 8 fill cards. Only 8 tiles are multiple choice; all others are typed.
// "a / b" answers accept any one of them.
// Timers: 15 s to choose a tile, 10 s to answer.
// ============================================================
(function () {
    "use strict";

    const LEVELS = {
        easy:   { name: "დამწყები",  fr: "Débutant",      acc: 0.60, attack: 0.20 },
        medium: { name: "საშუალო",  fr: "Intermédiaire", acc: 0.75, attack: 0.30 },
        hard:   { name: "ექსპერტი", fr: "Expert",        acc: 0.90, attack: 0.40 }
    };
    const MAX_WORDS = 24;
    const MAX_PHRASES = 10;
    const MC_TILES = 8;
    const MIN_FILL = 8;
    const PICK_SECONDS = 20;
    const ANSWER_SECONDS = 20;
    const HINTS_PER_GAME = 3;
    const ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "û", "ù", "œ"];
    const AI_ENDPOINT = (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "") + "/functions/v1/openai-chat";
    const AI_MODEL = "gpt-6-luna";

    let G = null;          // current game state
    let root = null;       // overlay element

    // ---------- helpers ----------
    function strip(html) {
        const d = document.createElement("div");
        d.innerHTML = String(html == null ? "" : html).replace(/<br\s*\/?>/gi, " ");
        return (d.textContent || "").replace(/\s+/g, " ").trim();
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function shuffle(a) {
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    const pick = a => a[Math.floor(Math.random() * a.length)];
    // compare answers: lower case, same apostrophes, no punctuation, single spaces
    function norm(s) {
        return String(s).toLowerCase().replace(/[’‘`´]/g, "'")
            .replace(/[.,!?;:¿¡«»"()…]/g, " ").replace(/\s+/g, " ").trim();
    }
    function noAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe"); }
    function withoutArticle(fr) {
        return fr.replace(/^(le|la|les|un|une|des|du|de la|de l')\s+/i, "").replace(/^l'/i, "").trim();
    }
    // "maison / foyer" → ["maison / foyer", "maison", "foyer"]; also accepts the text without (…)
    function variants(text) {
        const out = new Set();
        const add = v => { v = norm(v); if (v) out.add(v); };
        add(text);
        add(String(text).replace(/\([^)]*\)/g, ""));
        String(text).split("/").forEach(p => { add(p); add(p.replace(/\([^)]*\)/g, "")); });
        return [...out];
    }
    function isCorrect(given, answer) { return variants(answer).includes(norm(given)); }
    // right letters but wrong / missing accents (é ↔ e ↔ è …) → returns the correct spelling, else null
    function accentSlip(given, answer) {
        if (!String(given).trim() || isCorrect(given, answer)) return null;
        const g = noAccents(norm(given));
        const parts = [answer].concat(String(answer).split("/")).map(x => x.trim()).filter(Boolean);
        for (const part of parts) {
            for (const v of [part, part.replace(/\([^)]*\)/g, "").trim()])
                if (v && noAccents(norm(v)) === g) return v;
        }
        return null;
    }
    function highlightAccents(text) {
        return esc(text).replace(/([àâäçéèêëîïôöûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙŒ])/g, '<span class="vg-acc-mark">$1</span>');
    }

    // big flashcard: "correct, but watch the accents" — flips in, then flips away and the game goes on
    function accentFlashcard(correctText, item, sentence) {
        return new Promise(done => {
            const win = root && root.querySelector(".vg-window");
            if (!win) return done();
            const card = document.createElement("div");
            card.className = "vg-flashcard";
            card.innerHTML = `
                <div class="vg-flashcard-inner">
                    <div class="vg-flashcard-ok"><i class="fa-solid fa-circle-check"></i> სწორია!</div>
                    <div class="vg-flashcard-word vg-fr">${highlightAccents(correctText)}</div>
                    ${sentence ? `<div class="vg-flashcard-sentence vg-fr">${highlightAccents(sentence)}</div>` : ""}
                    <div class="vg-flashcard-ka">${esc(item.ka)}</div>
                    <div class="vg-flashcard-note"><i class="fa-solid fa-triangle-exclamation"></i> მაგრამ ყურადღება მიაქციე აქცენტებს ფრანგულში!</div>
                </div>`;
            win.appendChild(card);
            speak(correctText);
            requestAnimationFrame(() => card.classList.add("vg-flashcard-in"));
            let closed = false;
            const close = () => {
                if (closed) return; closed = true;
                card.classList.remove("vg-flashcard-in");
                card.classList.add("vg-flashcard-out");
                setTimeout(() => { card.remove(); done(); }, 650);
            };
            card.onclick = close;                 // tap to continue sooner
            setTimeout(close, 3200);
        });
    }
    function speak(text) {
        try {
            if (!window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "fr-FR"; u.rate = 0.9;
            const v = window.speechSynthesis.getVoices().find(x => /^fr/i.test(x.lang));
            if (v) u.voice = v;
            window.speechSynthesis.speak(u);
        } catch (e) { /* no voice on this device */ }
    }
    function store(key, val) {
        try {
            if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) { return null; }
    }
    const wait = ms => new Promise(r => setTimeout(r, ms));

    // ---------- the robot character (SVG) ----------
    const ROBO_SVG = `
        <svg viewBox="0 0 120 130" class="vg-robo-svg" aria-hidden="true">
            <line x1="60" y1="8" x2="60" y2="24" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <circle class="vg-robo-bulb" cx="60" cy="8" r="7" fill="#ef4135"/>
            <rect x="18" y="24" width="84" height="64" rx="22" fill="#fff" stroke="#e2e8f0" stroke-width="3"/>
            <rect x="28" y="36" width="64" height="36" rx="14" fill="#0f172a"/>
            <g class="vg-robo-eyes"><circle cx="46" cy="52" r="7" fill="#5eead4"/><circle cx="74" cy="52" r="7" fill="#5eead4"/></g>
            <rect class="vg-robo-mouth" x="52" y="63" width="16" height="4" rx="2" fill="#5eead4"/>
            <rect x="8" y="46" width="10" height="20" rx="5" fill="#ef4135"/>
            <rect x="102" y="46" width="10" height="20" rx="5" fill="#ef4135"/>
            <rect x="32" y="92" width="56" height="34" rx="14" fill="#ef4135"/>
            <circle cx="60" cy="109" r="7" fill="#fff" opacity=".9"/>
        </svg>`;

    // big robot used in the middle of the screen: same robot + an arm that points at the chosen tile
    const ROBO_BIG = `
        <svg viewBox="-50 -10 220 160" class="vg-robo-big" aria-hidden="true">
            <ellipse cx="60" cy="142" rx="40" ry="6" fill="rgba(15,23,42,.18)"/>
            <line x1="60" y1="8" x2="60" y2="24" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <circle class="vg-robo-bulb" cx="60" cy="8" r="7" fill="#ef4135"/>
            <rect x="8" y="46" width="10" height="20" rx="5" fill="#ef4135"/>
            <rect x="18" y="24" width="84" height="64" rx="22" fill="#fff" stroke="#e2e8f0" stroke-width="3"/>
            <rect x="28" y="36" width="64" height="36" rx="14" fill="#0f172a"/>
            <g class="vg-robo-eyes"><circle cx="46" cy="52" r="7" fill="#5eead4"/><circle cx="74" cy="52" r="7" fill="#5eead4"/></g>
            <rect class="vg-robo-mouth" x="52" y="63" width="16" height="4" rx="2" fill="#5eead4"/>
            <rect x="32" y="92" width="56" height="34" rx="14" fill="#ef4135"/>
            <circle cx="60" cy="109" r="7" fill="#fff" opacity=".9"/>
            <g class="vg-robo-arm" transform="rotate(0 104 56)">
                <rect x="100" y="51" width="40" height="10" rx="5" fill="#ef4135"/>
                <circle cx="144" cy="56" r="8" fill="#fff" stroke="#ef4135" stroke-width="3"/>
                <rect x="148" y="53" width="12" height="6" rx="3" fill="#fff" stroke="#ef4135" stroke-width="2"/>
            </g>
        </svg>`;

    // ONE simple sentence per robot turn (spoken out loud in French)
    const LINES = {
        word: ["Alors, cette fois-ci, je choisis cette case !", "Hmm… je prends cette case-là !", "À mon tour ! Je choisis celle-ci.",
               "Allez, cette case est pour moi !", "Voyons voir… je choisis celle-là !", "Je vais essayer cette case !", "Cette fois, je prends ce mot !"],
        fill: ["Cette fois-ci, je choisis une phrase à compléter !", "Je prends cette phrase à compléter !", "Allez, je complète cette phrase !"],
        attack: ["Attention, j'attaque cette case !", "Cette case est à toi ? Plus pour longtemps !", "Défends bien cette case !"],
        timeout: ["Trop lent ! Alors je choisis cette case !", "Le temps est fini ! Je prends celle-ci !"],
        pass: ["Je passe mon tour !"]
    };
    function line(kind, vars) {
        const list = LINES[kind];
        G.lastLines = G.lastLines || {};
        let l, tries = 0;
        do { l = pick(list); tries++; } while (list.length > 1 && l === G.lastLines[kind] && tries < 6);
        G.lastLines[kind] = l;
        return l.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k]) || "");
    }

    // ---------- open / build ----------
    function open(opts) {
        const words = (opts.words || []).map(w => ({ fr: strip(w.french), ka: strip(w.georgian), phrase: false }))
            .filter(w => w.fr && w.ka).slice(0, MAX_WORDS);
        const phrases = (opts.phrases || []).map(w => ({ fr: strip(w.french), ka: strip(w.georgian), phrase: true }))
            .filter(w => w.fr && w.ka).slice(0, MAX_PHRASES);
        const items = words.concat(phrases);
        if (items.length < 4) {
            alert("ამ კვირაში თამაშისთვის საკმარისი სიტყვები არ არის.");
            return;
        }
        items.forEach((it, i) => { it.id = i; });

        close();
        root = document.createElement("div");
        root.className = "vg-overlay";
        root.innerHTML = `
            <div class="vg-window" role="dialog" aria-modal="true">
                <div class="vg-head">
                    <div class="vg-title"><span class="vg-title-ic"><i class="fa-solid fa-chess-board"></i></span>
                        <span>ტერიტორიის ბრძოლა<span class="vg-sub">Bataille de Territoire · ${esc(opts.weekLabel || "")}</span></span></div>
                    <button class="vg-close" aria-label="დახურვა"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="vg-body"></div>
                <svg class="vg-pointer" id="vgPointer" aria-hidden="true"></svg>
                <div class="vg-robo" id="vgRobo" aria-live="polite">
                    <div class="vg-robo-bubble"><div class="vg-robo-name">რობო</div><div class="vg-robo-text" id="vgRoboText"></div></div>
                    ${ROBO_BIG}
                </div>
            </div>`;
        document.body.appendChild(root);
        document.body.classList.add("vg-lock");
        root.querySelector(".vg-close").onclick = () => {
            if (!G || G.over || !G.started || confirm("თამაშიდან გასვლა? პროგრესი არ შეინახება.")) close();
        };
        G = { items, words, phrases, opts, started: false, aiSentences: null };
        G.sentencesPromise = fetchSentences(words, opts.course).then(r => { if (G) G.aiSentences = r; return r; });
        G.expertEarned = null;   // null = unknown, true/false after asking the server
        loadExpertState();
        renderStart();
    }

    function close() {
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
        stopTimer();
        if (root) root.remove();
        root = null;
        if (G) G.over = true;
        G = null;
        document.body.classList.remove("vg-lock");
    }

    function body() { return root.querySelector(".vg-body"); }

    // ---------- new sentences from the AI (same Supabase function as OuiBot) ----------
    async function fetchSentences(words, course) {
        if (!words.length || typeof fetch === "undefined" || !AI_ENDPOINT.startsWith("http")) return [];
        try {
            let token = typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : "";
            try {
                if (typeof _supabase !== "undefined") {
                    const { data } = await _supabase.auth.getSession();
                    if (data && data.session) token = data.session.access_token;
                }
            } catch (e) {}
            const level = (String(course || "").match(/\b(A1|A2|B1|B2)\b/) || [, "A1"])[1];
            const themes = shuffle(["la famille", "l'école", "le café", "les vacances", "la ville", "le sport", "la cuisine", "les amis", "le week-end", "les animaux", "le travail", "la météo", "les courses", "la musique"]).slice(0, 4).join(", ");
            const list = words.map((w, i) => `${i}. ${w.fr} = ${w.ka}`).join("\n");
            const system = "You write short, natural French example sentences for Georgian learners of French. Reply ONLY with JSON.";
            const prompt = `Level ${level}. For EACH word below write ONE new, simple French sentence (max 10 words) that uses the word naturally.
Use different everyday situations (ideas: ${themes}). Make every sentence different from usual textbook sentences. Random seed: ${Math.random().toString(36).slice(2, 8)}.
"answer" = the exact text of the word as it appears in your sentence (it may be conjugated or agreed; without the article when the article stays in the sentence).
"ka" = Georgian translation of the whole sentence.
Words:
${list}
Reply ONLY with: {"items":[{"i":0,"sentence":"…","answer":"…","ka":"…"}]}`;
            const opts = {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : "", "Authorization": "Bearer " + token },
                body: JSON.stringify({ model: AI_MODEL, thinkingOff: true, system, messages: [{ role: "user", content: prompt }], prompt: system + "\n\n" + prompt })
            };
            if (window.AbortSignal && AbortSignal.timeout) opts.signal = AbortSignal.timeout(20000);
            const r = await fetch(AI_ENDPOINT, opts);
            if (!r.ok) return [];
            const data = await r.json();
            const raw = String(data.text || "").replace(/```json|```/g, "");
            const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
            const parsed = JSON.parse(raw.slice(s, e + 1));
            const out = [];
            (parsed.items || []).forEach(x => {
                const w = words[x.i];
                const sentence = String(x.sentence || "").trim(), answer = String(x.answer || "").trim();
                if (!w || !sentence || answer.length < 2 || sentence.length > 140) return;
                const start = sentence.toLowerCase().indexOf(answer.toLowerCase());
                if (start < 0) return;
                out.push({ item: w, text: sentence, start, form: sentence.substr(start, answer.length), help: String(x.ka || "").trim() || ("სიტყვა: " + w.ka) });
            });
            return out;
        } catch (e) {
            console.warn("Vocab game: AI sentences not available, using built-in sentences.", e);
            return [];
        }
    }

    // built-in sentences (used when the AI did not answer)
    function templateGap(item) {
        const raw = item.fr.split("/")[0].trim();
        const m = raw.match(/^(le|la|les|un|une|des|du|l')\s*(.+)$/i);
        let text;
        if (m && m[2].trim().split(/\s+/).length <= 2) {
            const art = m[1], noun = m[2].trim();
            const lead = art.toLowerCase() === "l'" ? "l'" : art + " ";
            const isDef = /^(le|la|les|l')$/i.test(art);
            const T = isDef
                ? ["Regarde, c'est {X} !", "Où est {X} ?", "J'aime beaucoup {X}.", "Tu vois {X} là-bas ?", "Je cherche {X}.", "Voilà {X} !"]
                : ["J'ai {X}.", "Il y a {X} ici.", "C'est {X} !", "Je voudrais {X}, s'il te plaît."];
            const tpl = pick(T);
            const full = lead + noun;
            text = tpl.replace("{X}", full);
            const start = tpl.indexOf("{X}") + lead.length;
            return { item, text, start, form: noun, help: "სიტყვა: " + item.ka };
        }
        if (/^[a-zàâçéèêëîïôûùœ]+(er|ir|re|oir)$/i.test(raw)) {
            const tpl = pick(["Demain, je vais {X}.", "J'aime {X} le week-end.", "Tu veux {X} avec moi ?", "Je n'aime pas {X} le matin.", "On peut {X} ensemble ?"]);
            return { item, text: tpl.replace("{X}", raw), start: tpl.indexOf("{X}"), form: raw, help: "სიტყვა: " + item.ka };
        }
        const tpl = pick(["En français, on dit « {X} ».", "Le mot du jour : « {X} » !", "Écoute bien : « {X} »."]);
        return { item, text: tpl.replace("{X}", raw), start: tpl.indexOf("{X}"), form: raw, help: "სიტყვა: " + item.ka };
    }

    // ---------- expert reward: +0.5 point in Scores.vocab2, once per week ----------
    const EXPERT_POINTS = "0,5";
    function canUseApi() { return typeof api === "function" && G && G.opts.week > 0; }
    async function loadExpertState() {
        if (!canUseApi()) return;
        try {
            const res = await api("/api/vocab-game/expert-wins");
            if (!G) return;
            G.expertEarned = (res && res.weeks || []).map(Number).includes(G.opts.week);
            const badge = root && root.querySelector(".vg-expert-badge");
            if (badge) badge.outerHTML = expertBadge();
        } catch (e) { console.warn("Vocab game: expert state not loaded", e); }
    }
    function expertBadge() {
        if (!canUseApi()) return "";
        return G.expertEarned
            ? '<span class="vg-expert-badge vg-expert-done"><i class="fa-solid fa-circle-check"></i> ' + EXPERT_POINTS + ' ქულა მიღებულია</span>'
            : '<span class="vg-expert-badge"><i class="fa-solid fa-gift"></i> მოგება = +' + EXPERT_POINTS + ' ქულა</span>';
    }
    async function sendExpertWin() {
        const box = root && root.querySelector("#vgReward");
        if (!canUseApi() || !box) return;
        box.hidden = false;
        box.innerHTML = '<div class="vg-spinner vg-spinner-sm"></div> ქულის შენახვა…';
        try {
            const res = await api("/api/vocab-game/expert-win", { method: "POST", body: JSON.stringify({ week: G.opts.week }) });
            if (!G) return;
            G.expertEarned = true;
            box.className = "vg-reward" + (res && res.added ? " vg-reward-new" : "");
            box.innerHTML = res && res.added
                ? '<i class="fa-solid fa-gift"></i> +' + EXPERT_POINTS + ' ქულა „ლექსიკა 2“-ში! ნახე შეფასებების გვერდზე.'
                : '<i class="fa-solid fa-circle-check"></i> ამ კვირის ექსპერტის ' + EXPERT_POINTS + ' ქულა უკვე მიღებული გაქვს.';
        } catch (e) {
            box.className = "vg-reward vg-reward-err";
            box.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ქულა ვერ შეინახა. სცადე თავიდან მოგვიანებით.';
        }
    }

    // ---------- start screen ----------
    function renderStart() {
        const best = store("ouispeak-territory-best|" + G.opts.storageKey);
        body().innerHTML = `
            <div class="vg-start">
                <div class="vg-start-hero">
                    <div class="vg-start-icon"><i class="fa-solid fa-chess-board"></i></div>
                    <h2>დაიპყარი დაფა სიტყვებით!</h2>
                    <p class="vg-lead">${G.words.length} სიტყვა · ${G.phrases.length} ფრაზა · შენ რობოს წინააღმდეგ</p>
                </div>
                <ul class="vg-rules">
                    <li>შენი მხარე <b class="vg-c-you">ლურჯია</b> (ქვემოთ), რობოსი — <b class="vg-c-ai">წითელი</b> (ზემოთ). გახსნა შეგიძლია მხოლოდ შენი ტერიტორიის გვერდით მდებარე უჯრების.</li>
                    <li><b>ფრანგული</b> სიტყვა — აირჩიე ქართული მნიშვნელობა. <b>ქართული</b> სიტყვა და <b>„შეავსე წინადადება“</b> — დაწერე ფრანგულად.</li>
                    <li>უჯრის ასარჩევად და პასუხისთვის გაქვს <b>${ANSWER_SECONDS} წამი</b>. ფრაზა = 2 ქულა. რობოს უჯრაზე დაჭერა = დუელი.</li>
                    <li>მოიგე <b>ექსპერტის</b> დონეზე — <b>+${EXPERT_POINTS} ქულა</b> „ლექსიკა 2“-ში (კვირაში ერთხელ).</li>
                </ul>
                <div class="vg-levels-title">აირჩიე სირთულე</div>
                <div class="vg-levels">
                    ${Object.keys(LEVELS).map((k, i) => `
                        <button class="vg-level vg-level-${k}" data-level="${k}">
                            <span class="vg-level-name">${LEVELS[k].name}</span>
                            <span class="vg-level-fr">${LEVELS[k].fr}</span>
                            <span class="vg-level-acc">რობო სწორად პასუხობს ${Math.round(LEVELS[k].acc * 100)}%-ში</span>
                            ${k === "hard" ? expertBadge() : ""}
                        </button>`).join("")}
                </div>
                ${best ? `<div class="vg-best"><i class="fa-solid fa-trophy"></i> შენი საუკეთესო შედეგი ამ კვირაში: ${best.score} ქულა (${esc(best.levelName)})</div>` : ""}
            </div>`;
        body().querySelectorAll(".vg-level").forEach(b => b.onclick = () => startGame(b.dataset.level));
    }

    // ---------- sentence gaps from the week phrases ----------
    function tokens(fr) {
        const out = [];
        const re = /[A-Za-zÀ-ÖØ-öø-ÿœŒ-]+/g;
        let m;
        while ((m = re.exec(fr))) if (m[0].replace(/-/g, "").length >= 3) out.push({ form: m[0], start: m.index });
        return out;
    }
    function wordGapInPhrase(item, usedPhrases) {
        const forms = [item.fr, withoutArticle(item.fr)].concat(item.fr.split("/")).map(f => f.trim()).filter(f => f.length >= 2);
        for (const p of shuffle(G.phrases)) {
            if (usedPhrases.has(p)) continue;
            const low = p.fr.toLowerCase();
            for (const f of forms) {
                const i = low.indexOf(f.toLowerCase());
                if (i >= 0) return { item, phrase: p, text: p.fr, start: i, form: p.fr.substr(i, f.length), help: p.ka };
            }
        }
        return null;
    }
    function phraseGap(p, avoidForm) {
        const list = tokens(p.fr).filter(t => norm(t.form) !== avoidForm);
        if (!list.length) return null;
        const weekForms = new Set(G.words.flatMap(w => variants(withoutArticle(w.fr))));
        const fromWeek = list.filter(t => weekForms.has(norm(t.form)));
        const pool = fromWeek.length ? fromWeek : list.sort((a, b) => b.form.length - a.form.length).slice(0, 3);
        const t = pick(pool);
        return { item: p, text: p.fr, start: t.start, form: t.form, help: p.ka };
    }

    // ---------- game ----------
    async function startGame(levelKey) {
        // wait a little for the AI sentences (they were requested when the game opened)
        if (G.aiSentences === null) {
            body().innerHTML = `<div class="vg-loading"><div class="vg-spinner"></div>რობო ახალ წინადადებებს წერს…</div>`;
            await Promise.race([G.sentencesPromise, wait(7000)]);
            if (!G) return;
        }
        const ai = shuffle(G.aiSentences || []);
        G.aiSentences = G.aiSentences || [];
        // ask for fresh sentences for the next game
        G.sentencesPromise = fetchSentences(G.words, G.opts.course).then(r => { if (G) G.aiSentences = r; return r; });

        const n = G.items.length;
        const cols = n <= 6 ? 3 : n <= 16 ? 4 : 5;
        const rows = Math.ceil(n / cols);
        const order = shuffle(G.items);
        const tiles = [];
        for (let i = 0; i < rows * cols; i++) {
            const it = order[i];
            tiles.push({ idx: i, r: Math.floor(i / cols), c: i % cols, item: it || null, owner: it ? null : "void", shield: false });
        }
        G.tiles = tiles; G.cols = cols; G.rows = rows;

        // fill cards: every phrase + words until at least MIN_FILL (and ~1/3 of the words)
        const real = tiles.filter(t => t.item);
        const phraseTiles = real.filter(t => t.item.phrase);
        const wordTiles = shuffle(real.filter(t => !t.item.phrase));
        const wantWordFills = Math.min(wordTiles.length, Math.max(MIN_FILL - phraseTiles.length, Math.round(wordTiles.length / 3)));
        const usedPhrases = new Map();
        // words with an AI sentence first, then words found inside a week phrase, then built-in sentences
        const aiFor = new Map(ai.map(g => [g.item, g]));
        const rank = t => aiFor.has(t.item) ? 0 : 1;
        wordTiles.sort((a, b) => rank(a) - rank(b));
        let count = 0;
        for (const t of wordTiles) {
            if (count >= wantWordFills) break;
            let g = aiFor.get(t.item);
            if (!g) {
                g = wordGapInPhrase(t.item, new Set(usedPhrases.keys()));
                if (g) usedPhrases.set(g.phrase, norm(g.form));
            }
            if (!g) g = templateGap(t.item);
            t.face = "fill"; t.gap = g; count++;
        }
        // French word cards → choose the Georgian meaning (MC_TILES of them); Georgian word cards → type the French
        shuffle(wordTiles.filter(t => !t.face)).forEach((t, i) => { t.face = i < MC_TILES ? "fr" : "ka"; });
        phraseTiles.forEach(t => {
            const g = phraseGap(t.item, usedPhrases.get(t.item));
            if (g) { t.face = "fill"; t.gap = g; } else t.face = "ka";
        });
        // only French cards are multiple choice; everything else is typed IN FRENCH (no Georgian keyboard needed)
        real.forEach(t => { t.mc = t.face === "fr"; t.item.tile = t; });

        Object.assign(G, {
            level: LEVELS[levelKey], levelKey,
            turn: "player", started: true, over: false, busy: false,
            hints: HINTS_PER_GAME, streak: 0, shieldReady: false, lastAttack: null,
            answered: 0, correct: 0, mistakes: new Map()
        });
        renderBoard();
        playerTurn(true);
    }

    function neighbors(t) {
        return [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([dr, dc]) => G.tiles.find(x => x.r === t.r + dr && x.c === t.c + dc))
            .filter(Boolean);
    }
    function owned(who) { return G.tiles.filter(t => t.owner === who); }
    function freeTiles() { return G.tiles.filter(t => t.item && t.owner === null); }
    function other(who) { return who === "player" ? "ai" : "player"; }
    function edgeRow(who) {
        const rows = who === "player" ? [...Array(G.rows).keys()].reverse() : [...Array(G.rows).keys()];
        for (const r of rows) {
            const list = G.tiles.filter(t => t.r === r && t.item && t.owner === null);
            if (list.length) return list;
        }
        return [];
    }
    function touches(t, who) { return neighbors(t).some(n => n.owner === who); }
    function canTarget(who, t) {
        if (!t.item || t.owner === "void" || t.owner === who) return false;
        const mine = owned(who);
        if (t.owner === other(who)) return mine.length > 0 && touches(t, who) && !t.shield;
        if (!mine.length) return edgeRow(who).includes(t);
        if (touches(t, who)) return true;
        return !freeTiles().some(x => touches(x, who));   // nothing free next to me → jump anywhere
    }
    function points(who) { return owned(who).reduce((s, t) => s + (t.item.phrase ? 2 : 1), 0); }
    function zone(t) {
        const half = G.rows / 2;
        if (t.r < Math.floor(half)) return "ai";
        if (t.r >= Math.ceil(half)) return "you";
        return "mid";
    }

    function renderBoard() {
        body().innerHTML = `
            <div class="vg-game">
                <div class="vg-score">
                    <div class="vg-player vg-player-you"><span class="vg-av"><i class="fa-solid fa-user"></i></span>
                        <span><span class="vg-player-name">შენ</span><b id="vgYou">0</b></span></div>
                    <div class="vg-mid">
                        <span class="vg-chip" title="მინიშნებები"><i class="fa-solid fa-lightbulb"></i> <b id="vgHints">${G.hints}</b></span>
                        <span class="vg-chip" title="ზედიზედ სწორი"><i class="fa-solid fa-fire"></i> <b id="vgStreak">0</b></span>
                    </div>
                    <div class="vg-player vg-player-ai"><span><span class="vg-player-name">რობო</span><b id="vgAi">0</b></span>
                        <span class="vg-av vg-av-robo">${ROBO_SVG}</span></div>
                </div>
                <div class="vg-bar"><div class="vg-bar-you" id="vgBarYou"></div><div class="vg-bar-ai" id="vgBarAi"></div></div>
                <div class="vg-turnbar" id="vgTurnbar">
                    <div class="vg-status" id="vgStatus"></div>
                    <div class="vg-timer" id="vgPickTimer" hidden><div class="vg-timer-fill"></div><span class="vg-timer-num"></span></div>
                </div>
                <div class="vg-arena">
                    <div class="vg-zone-label vg-zone-label-ai"><i class="fa-solid fa-robot"></i> რობოს მხარე</div>
                    <div class="vg-board" id="vgBoard" style="grid-template-columns: repeat(${G.cols}, 1fr)"></div>
                    <div class="vg-zone-label vg-zone-label-you"><i class="fa-solid fa-user"></i> შენი მხარე</div>
                </div>
                <div class="vg-legend">
                    <span><i class="fa-solid fa-list-ul"></i> არჩევა</span>
                    <span><i class="fa-solid fa-keyboard"></i> წერა</span>
                    <span><i class="fa-solid fa-pen-to-square"></i> შეავსე</span>
                    <span><i class="fa-solid fa-chess-rook"></i> ფრაზა = 2</span>
                    <span><i class="fa-solid fa-shield-halved"></i> ფარი</span>
                </div>
            </div>
            <div class="vg-modal" id="vgModal" hidden></div>`;
        drawTiles();
    }

    function faceHtml(t) {
        if (t.face === "fill") return `<i class="fa-solid fa-pen-to-square vg-fill-ic"></i><span class="vg-tile-main vg-fill-txt">შეავსე წინადადება</span>`;
        if (t.face === "fr") return `<span class="vg-lang">FR</span><span class="vg-tile-main">${esc(t.item.fr)}</span>`;
        return `<span class="vg-lang">KA</span><span class="vg-tile-main">${esc(t.item.ka)}</span>`;
    }

    function drawTiles() {
        const board = document.getElementById("vgBoard");
        if (!board) return;
        board.innerHTML = "";
        const myTurn = G.turn === "player" && !G.busy && !G.over;
        board.classList.toggle("vg-board-active", myTurn);
        G.tiles.forEach(t => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "vg-tile";
            if (!t.item) { el.className += " vg-void"; el.disabled = true; board.appendChild(el); return; }
            if (t.owner === null) el.className += " vg-free vg-zone-" + zone(t);
            if (t.face === "fill" && t.owner !== "player") el.className += " vg-fill";
            if (t.item.phrase) el.className += " vg-castle";
            if (t.owner === "player") el.className += " vg-own-you";
            if (t.owner === "ai") el.className += " vg-own-ai";
            if (t.shield) el.className += " vg-shielded";
            const playable = myTurn && canTarget("player", t);
            if (playable) el.className += t.owner === "ai" ? " vg-can-duel" : " vg-can";
            else if (myTurn && t.owner !== "player") el.className += " vg-locked";
            const content = t.owner === "player"
                ? `<span class="vg-tile-main">${esc(t.item.fr)}</span><span class="vg-tile-sub">${esc(t.item.ka)}</span>`
                : faceHtml(t);
            el.innerHTML = `
                ${t.item.phrase ? '<i class="fa-solid fa-chess-rook vg-castle-ic"></i>' : ""}
                ${t.shield ? '<i class="fa-solid fa-shield-halved vg-shield-ic"></i>'
                    : t.owner !== "player" ? `<i class="fa-solid ${t.mc ? "fa-list-ul" : "fa-keyboard"} vg-mode-ic"></i>` : ""}
                ${playable ? `<span class="vg-open-badge">${t.owner === "ai" ? '<i class="fa-solid fa-khanda"></i> დუელი' : '<i class="fa-solid fa-lock-open"></i> გახსენი'}</span>` : ""}
                ${myTurn && !playable && t.owner !== "player" ? '<i class="fa-solid fa-lock vg-lock-ic"></i>' : ""}
                ${content}`;
            el.disabled = !playable;
            el.onclick = () => playerPick(t);
            board.appendChild(el);
        });
        const y = points("player"), a = points("ai");
        const total = G.tiles.reduce((s, t) => s + (t.item ? (t.item.phrase ? 2 : 1) : 0), 0);
        document.getElementById("vgYou").textContent = y;
        document.getElementById("vgAi").textContent = a;
        document.getElementById("vgHints").textContent = G.hints;
        document.getElementById("vgStreak").textContent = G.streak;
        document.getElementById("vgBarYou").style.width = (y / total * 100) + "%";
        document.getElementById("vgBarAi").style.width = (a / total * 100) + "%";
    }

    function setStatus(text, kind) {
        const s = document.getElementById("vgStatus");
        if (!s) return;
        s.className = "vg-status" + (kind ? " vg-status-" + kind : "");
        s.innerHTML = text;
    }

    // ---------- timers ----------
    let timerState = null;
    function startTimer(el, seconds, onEnd) {
        stopTimer();
        if (!el) return;
        const token = {};
        const endAt = Date.now() + seconds * 1000;
        el.hidden = false;
        const fill = el.querySelector(".vg-timer-fill"), num = el.querySelector(".vg-timer-num");
        const tick = () => {
            if (timerState !== token) return;
            const left = Math.max(0, endAt - Date.now());
            const sec = Math.ceil(left / 1000);
            if (fill) fill.style.width = (left / (seconds * 1000) * 100) + "%";
            if (num) num.textContent = sec + " წმ";
            el.classList.toggle("vg-timer-low", sec <= 3);
            if (left <= 0) { timerState = null; onEnd(); return; }
            token.raf = setTimeout(tick, 100);
        };
        timerState = token;
        tick();
    }
    function stopTimer() {
        if (timerState) clearTimeout(timerState.raf);
        timerState = null;
        const t = document.getElementById("vgPickTimer");
        if (t) t.hidden = true;
    }

    // ---------- robot host: comes to the middle, points at the tile and says one sentence ----------
    let roboToken = 0;
    async function roboPoint(tile, text, mood) {
        const r = document.getElementById("vgRobo");
        const win = root && root.querySelector(".vg-window");
        const cell = tile && document.querySelectorAll("#vgBoard .vg-tile")[tile.idx];
        if (!r || !win) return;
        const tk = ++roboToken;
        if (cell) { try { cell.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} await wait(300); }
        if (tk !== roboToken) return;
        const wr = win.getBoundingClientRect();
        const bodyR = body().getBoundingClientRect();
        // robot in the middle (horizontally); vertically in the half away from the tile so it never hides it
        const visTop = Math.max(bodyR.top, wr.top) - wr.top, visBottom = Math.min(bodyR.bottom, wr.bottom) - wr.top;
        let ty = (visTop + visBottom) / 2, below = false;
        if (cell) {
            const cr = cell.getBoundingClientRect();
            const cy = cr.top + cr.height / 2 - wr.top;
            below = cy < (visTop + visBottom) / 2;
            // keep a clear gap between the robot and the tile (robot ≈ 150 px high, bubble ≈ 90 px)
            const half = (r.querySelector(".vg-robo-big") || {}).clientHeight / 2 || 70;
            if (below) ty = Math.min(Math.max(visTop + (visBottom - visTop) * 0.55, cr.bottom - wr.top + 50 + half), visBottom - half - 100);
            else ty = Math.max(Math.min(visTop + (visBottom - visTop) * 0.45, cr.top - wr.top - 50 - half), visTop + half + 100);
        }
        r.style.left = (wr.width / 2) + "px";
        r.style.top = ty + "px";
        r.className = "vg-robo vg-robo-in vg-robo-talk" + (below ? " vg-robo-below" : "") + (mood ? " vg-robo-" + mood : "");
        await wait(450);                       // pop-in animation
        if (tk !== roboToken) return;
        // aim the arm and draw the dotted arrow to the tile
        const arm = r.querySelector(".vg-robo-arm"), svg = r.querySelector(".vg-robo-big");
        const ptr = document.getElementById("vgPointer");
        if (cell && arm && svg && ptr) {
            const sr = svg.getBoundingClientRect(), cr = cell.getBoundingClientRect();
            const k = sr.width / 220;                                   // svg units → pixels
            const sx = sr.left + (104 + 50) * k, sy = sr.top + (56 + 10) * k;   // shoulder on screen
            const tx = cr.left + cr.width / 2, tyy = cr.top + cr.height / 2;
            const ang = Math.atan2(tyy - sy, tx - sx) * 180 / Math.PI;
            arm.setAttribute("transform", `rotate(${ang.toFixed(1)} 104 56)`);
            const hx = sx + Math.cos(ang * Math.PI / 180) * 60 * k, hy = sy + Math.sin(ang * Math.PI / 180) * 60 * k;
            const dist = Math.hypot(tx - hx, tyy - hy), stop = Math.max(0, dist - Math.min(cr.width, cr.height) * 0.55);
            const ex = hx + (tx - hx) * (stop / (dist || 1)), ey = hy + (tyy - hy) * (stop / (dist || 1));
            ptr.innerHTML = `<defs><marker id="vgArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ef4135"/></marker></defs>
                <line x1="${hx - wr.left}" y1="${hy - wr.top}" x2="${ex - wr.left}" y2="${ey - wr.top}" stroke="#ef4135" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9" marker-end="url(#vgArrow)" class="vg-pointer-line"/>`;
            ptr.classList.add("vg-pointer-on");
            cell.classList.add("vg-target");
        }
        speak(text);
        const box = document.getElementById("vgRoboText");
        box.textContent = "";
        for (let i = 1; i <= text.length; i++) {
            if (tk !== roboToken) return;
            box.textContent = text.slice(0, i);
            await wait(30);
        }
        r.classList.remove("vg-robo-talk");
        await wait(1100);
    }
    function roboMood(mood) {
        const r = document.getElementById("vgRobo");
        if (!r || !r.classList.contains("vg-robo-in")) return;
        r.classList.remove("vg-robo-happy", "vg-robo-sad", "vg-robo-angry", "vg-robo-talk");
        r.classList.add("vg-robo-" + mood);
    }
    function roboHide() {
        roboToken++;
        const r = document.getElementById("vgRobo");
        if (r) r.className = "vg-robo";
        const ptr = document.getElementById("vgPointer");
        if (ptr) { ptr.classList.remove("vg-pointer-on"); ptr.innerHTML = ""; }
        document.querySelectorAll(".vg-target").forEach(e => e.classList.remove("vg-target"));
    }

    // ---------- player turn ----------
    function playerTurn(first) {
        if (!G || G.over) return;
        G.turn = "player";
        G.busy = false;
        drawTiles();
        setStatus(first ? '<i class="fa-solid fa-hand-pointer"></i> შენი სვლაა — აირჩიე <b>ლურჯად მონიშნული</b> უჯრა ქვედა რიგიდან'
            : '<i class="fa-solid fa-hand-pointer"></i> შენი სვლაა — აირჩიე <b>ლურჯად მონიშნული</b> უჯრა', "you");
        startTimer(document.getElementById("vgPickTimer"), PICK_SECONDS, async () => {
            if (!G || G.over || G.turn !== "player" || G.busy) return;
            setStatus('<i class="fa-solid fa-hourglass-end"></i> დრო ამოიწურა! სვლა რობოს გადაეცა.', "bad");
            G.turn = "ai";
            drawTiles();
            await wait(700);
            aiTurn("timeout");
        });
    }

    async function playerPick(t) {
        if (G.busy || G.turn !== "player" || G.over) return;
        stopTimer();
        G.busy = true;
        const duel = t.owner === "ai";
        drawTiles();
        const ok = await ask(t, duel ? "duel" : "capture");
        if (!G || G.over) return;
        if (ok) {
            t.owner = "player";
            t.shield = false;
            if (G.shieldReady) { t.shield = true; G.shieldReady = false; }
            setStatus(duel ? '<i class="fa-solid fa-trophy"></i> დუელი მოგებულია! უჯრა შენია.' : '<i class="fa-solid fa-circle-check"></i> ბრავო! უჯრა დაიკავე.', "good");
        } else {
            setStatus(duel ? "დუელი წაგებულია — უჯრა რობოსთან რჩება." : "არასწორია — უჯრა თავისუფალი რჩება.", "bad");
        }
        G.turn = "ai";
        drawTiles();
        const cell = document.querySelectorAll("#vgBoard .vg-tile")[t.idx];
        if (ok && cell) cell.classList.add("vg-pop");
        if (checkEnd()) return;
        await wait(900);
        aiTurn();
    }

    // ---------- AI turn ----------
    async function aiTurn(reason) {
        if (!G || G.over) return;
        G.busy = true;
        G.turn = "ai";
        drawTiles();
        setStatus('<i class="fa-solid fa-robot"></i> რობოს სვლაა…', "ai");
        await wait(500);
        if (!G || G.over) return;

        const targets = G.tiles.filter(t => canTarget("ai", t));
        const free = targets.filter(t => t.owner === null);
        const attackable = targets.filter(t => t.owner === "player" && t !== G.lastAttack);
        let target = null, attack = false;
        if (attackable.length && (!free.length || Math.random() < G.level.attack)) {
            attack = true;
            const sorted = attackable.sort((a, b) => score(b) - score(a));
            target = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
        } else if (free.length) {
            target = free.sort((a, b) => score(b) - score(a) + (Math.random() - 0.5) * 2)[0];
        }
        G.lastAttack = attack ? target : null;
        if (!target) { await roboPoint(null, line("pass")); roboHide(); playerTurn(); return; }

        const kind = attack ? "attack" : reason === "timeout" ? "timeout" : target.face === "fill" ? "fill" : "word";
        await roboPoint(target, line(kind), attack ? "angry" : "");
        if (!G || G.over) return;

        if (attack) {
            roboHide();
            setStatus('<i class="fa-solid fa-khanda"></i> რობო შენს უჯრას უტევს — დაიცავი!', "ai");
            const defended = await ask(target, "defend");
            if (!G || G.over) return;
            if (defended) {
                target.shield = true;
                setStatus('<i class="fa-solid fa-shield-halved"></i> დაიცავი! ეს უჯრა ახლა ფარითაა დაცული.', "good");
            } else {
                target.owner = "ai"; target.shield = false;
                setStatus("რობომ შენი უჯრა წაიღო.", "bad");
            }
            drawTiles();
            await wait(1200);
        } else {
            const ok = Math.random() < G.level.acc;
            if (ok) {
                target.owner = "ai";
                roboMood("happy");
                setStatus(`<i class="fa-solid fa-robot"></i> რობომ უჯრა დაიკავა: <b>${esc(target.item.fr)}</b> = ${esc(target.item.ka)}`, "ai");
            } else {
                roboMood("sad");
                setStatus('<i class="fa-solid fa-robot"></i> რობომ შეცდომა დაუშვა! უჯრა თავისუფალი რჩება.', "good");
            }
            drawTiles();
            const cell = document.querySelectorAll("#vgBoard .vg-tile")[target.idx];
            if (cell) cell.classList.add(ok ? "vg-pop" : "vg-shake");
            await wait(1500);
        }
        if (!G || G.over) return;
        roboHide();
        if (checkEnd()) return;
        playerTurn();
    }
    function score(t) {
        let s = t.item.phrase ? 3 : 0;
        neighbors(t).forEach(n => { if (n.owner === "player") s += 2; if (n.owner === "ai") s += 1; });
        return s;
    }
    function flash(t) {
        const el = document.querySelectorAll("#vgBoard .vg-tile")[t.idx];
        if (el) el.classList.add("vg-flash");
    }

    function checkEnd() {
        if (freeTiles().length > 0) return false;
        finish();
        return true;
    }

    // ---------- questions ----------
    function pickOthers(item, getter, answer, count) {
        const seen = new Set(variants(answer));
        const out = [];
        const pool = shuffle(G.items.filter(x => x !== item && x.phrase === item.phrase))
            .concat(shuffle(G.items.filter(x => x !== item && x.phrase !== item.phrase)));
        for (const x of pool) {
            const v = getter(x);
            if (!v || seen.has(norm(v))) continue;
            seen.add(norm(v)); out.push(v);
            if (out.length >= count) break;
        }
        return out;
    }
    function capitalLike(model, v) {
        return /^[A-ZÀ-Ý]/.test(model) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    }

    // tile: the tile asked about; mode: capture | duel | defend | review
    function ask(tile, mode) {
        return new Promise(resolve => {
            const item = tile.item;
            const modal = document.getElementById("vgModal");
            const title = mode === "duel" ? '<i class="fa-solid fa-khanda"></i> დუელი!'
                : mode === "defend" ? '<i class="fa-solid fa-shield-halved"></i> დაიცავი უჯრა!'
                : mode === "review" ? '<i class="fa-solid fa-rotate"></i> გამეორება'
                : '<i class="fa-solid fa-flag"></i> დაიკავე უჯრა';
            let answer, prompt, options = null, frenchAnswer = true;

            if (tile.face === "fr") {
                answer = item.ka; frenchAnswer = false;
                prompt = `<div class="vg-q-label">რას ნიშნავს ქართულად?</div><div class="vg-q-big vg-fr">${esc(item.fr)} <button class="vg-say" data-say="${esc(item.fr)}" title="მოსმენა"><i class="fa-solid fa-volume-high"></i></button></div>`;
                if (tile.mc) options = [item.ka].concat(pickOthers(item, x => x.ka, item.ka, 3));
            } else if (tile.face === "fill") {
                const g = tile.gap;
                answer = g.form;
                const sentence = esc(g.text.substr(0, g.start)) + '<span class="vg-gap">?</span>' + esc(g.text.substr(g.start + g.form.length));
                prompt = `<div class="vg-q-label"><i class="fa-solid fa-pen-to-square"></i> შეავსე წინადადება</div><div class="vg-q-big vg-fr vg-q-sentence">${sentence}</div><div class="vg-q-help">${esc(g.help)}</div>`;
                if (tile.mc) {
                    const others = pickOthers(item, x => {
                        if (x.phrase) { const tk = tokens(x.fr); return tk.length ? pick(tk).form : ""; }
                        return withoutArticle(x.fr.split("/")[0].trim());
                    }, g.form, 3).map(v => capitalLike(g.form, v));
                    options = [g.form].concat(others);
                }
            } else {
                answer = item.fr;
                prompt = `<div class="vg-q-label">როგორ იქნება ფრანგულად?</div><div class="vg-q-big">${esc(item.ka)}</div>`;
                if (tile.mc) options = [item.fr].concat(pickOthers(item, x => x.fr, item.fr, 3));
            }

            let html;
            if (options) {
                html = `<div class="vg-opts">${shuffle(options).map((v, i) => `<button type="button" class="vg-opt" data-v="${esc(v)}"><span class="vg-opt-k">${"ABCD"[i]}</span>${esc(v)}</button>`).join("")}</div>`;
            } else {
                html = `
                    <input class="vg-input" id="vgInput" autocomplete="off" autocapitalize="off" spellcheck="false"
                        lang="${frenchAnswer ? "fr" : "ka"}" placeholder="${frenchAnswer ? "დაწერე ფრანგულად…" : "დაწერე ქართულად…"}">
                    ${frenchAnswer ? `<div class="vg-accents">${ACCENTS.map(a => `<button type="button" class="vg-acc">${a}</button>`).join("")}</div>` : '<div class="vg-accents-gap"></div>'}
                    <button class="vg-primary" id="vgCheck"><i class="fa-solid fa-check"></i> შემოწმება</button>`;
            }
            const timed = mode !== "review";

            modal.innerHTML = `
                <div class="vg-card vg-card-${mode}">
                    <div class="vg-card-head"><span class="vg-card-title">${title}</span>
                        ${item.phrase ? '<span class="vg-tag"><i class="fa-solid fa-chess-rook"></i> 2 ქულა</span>' : ""}</div>
                    ${timed ? '<div class="vg-timer vg-timer-q" id="vgAnsTimer"><div class="vg-timer-fill"></div><span class="vg-timer-num"></span></div>' : ""}
                    <div class="vg-q">${prompt}</div>
                    <div class="vg-answers">${html}</div>
                    <div class="vg-feedback" id="vgFeedback" hidden></div>
                    <div class="vg-card-foot">
                        <button class="vg-hint" id="vgHint" ${G.hints ? "" : "disabled"}><i class="fa-solid fa-lightbulb"></i> მინიშნება (${G.hints})</button>
                    </div>
                </div>`;
            modal.hidden = false;

            let done = false;
            const finishQ = (ok, given, timedOut) => {
                if (done) return;
                // accents wrong or missing (é → e, è → é …) still counts as correct
                const slip = !ok && frenchAnswer && !options ? accentSlip(given || "", answer) : null;
                if (slip) ok = true;
                done = true;
                stopTimer();
                const at = modal.querySelector("#vgAnsTimer"); if (at) at.classList.add("vg-timer-done");
                G.answered++;
                if (ok) {
                    G.correct++; G.streak++;
                    if (G.streak % 3 === 0 && mode !== "defend" && mode !== "review") G.shieldReady = true;
                } else {
                    G.streak = 0;
                    G.mistakes.set(item.id, item);
                }
                modal.querySelectorAll("button:not(.vg-say)").forEach(b => b.disabled = true);
                const inp = modal.querySelector("#vgInput"); if (inp) inp.disabled = true;
                if (slip) {
                    drawScoreOnly();
                    modal.hidden = true; modal.innerHTML = "";
                    const sentence = tile.face === "fill" && !item.phrase ? tile.gap.text : (item.phrase ? item.fr : "");
                    accentFlashcard(slip, item, sentence).then(() => resolve(true));
                    return;
                }
                if (timedOut && options) modal.querySelectorAll(".vg-opt").forEach(o => { if (norm(o.dataset.v) === norm(answer)) o.classList.add("vg-opt-ok"); });
                const fb = modal.querySelector("#vgFeedback");
                fb.hidden = false;
                fb.className = "vg-feedback " + (ok ? "vg-ok" : "vg-no");
                let extra = "";
                if (timedOut) extra += '<div class="vg-fb-note"><i class="fa-solid fa-hourglass-end"></i> დრო ამოიწურა!</div>';
                if (!ok && frenchAnswer && given && answer.split("/").some(v => norm(withoutArticle(v.trim())) === norm(given) && norm(withoutArticle(v.trim())) !== norm(v)))
                    extra += '<div class="vg-fb-note">თითქმის! არ დაგავიწყდეს არტიკლი (le, la, l\', les…).</div>';
                if (!ok && tile.face === "fill") extra += `<div class="vg-fb-note">სწორი სიტყვა: <b>${esc(answer)}</b></div>`;
                const sentenceLine = tile.face === "fill" && !item.phrase
                    ? `<div class="vg-fb-sentence vg-fr">${esc(tile.gap.text)}</div>` : "";
                fb.innerHTML = `
                    <div class="vg-fb-title">${ok ? '<i class="fa-solid fa-circle-check"></i> სწორია!' : '<i class="fa-solid fa-circle-xmark"></i> არასწორია'}</div>
                    ${extra}
                    <div class="vg-fb-pair"><span class="vg-fr">${esc(item.fr)}</span>
                        <button class="vg-say" data-say="${esc(item.fr)}" title="მოსმენა"><i class="fa-solid fa-volume-high"></i></button>
                        <span class="vg-fb-eq">=</span> <span>${esc(item.ka)}</span></div>
                    ${sentenceLine}
                    ${ok && G.shieldReady && G.streak % 3 === 0 && mode !== "defend" && mode !== "review" ? '<div class="vg-fb-note"><i class="fa-solid fa-shield-halved"></i> 3 ზედიზედ! შემდეგი უჯრა ფარით იქნება დაცული.</div>' : ""}
                    <button class="vg-primary" id="vgNext">გაგრძელება <i class="fa-solid fa-arrow-right"></i></button>`;
                fb.querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
                speak(tile.face === "fill" && !item.phrase ? tile.gap.text : item.fr);
                const next = fb.querySelector("#vgNext");
                next.disabled = false;
                next.focus();
                next.onclick = () => { modal.hidden = true; modal.innerHTML = ""; resolve(ok); };
                drawScoreOnly();
            };

            modal.querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
            if (tile.face === "fr") speak(item.fr);
            if (timed) startTimer(modal.querySelector("#vgAnsTimer"), ANSWER_SECONDS, () => {
                const inp = modal.querySelector("#vgInput");
                finishQ(inp && inp.value.trim() !== "" ? isCorrect(inp.value, answer) : false, inp ? inp.value : "", true);
            });

            // multiple choice
            modal.querySelectorAll(".vg-opt").forEach(b => b.onclick = () => {
                const ok = norm(b.dataset.v) === norm(answer);
                b.classList.add(ok ? "vg-opt-ok" : "vg-opt-no");
                if (!ok) modal.querySelectorAll(".vg-opt").forEach(o => { if (norm(o.dataset.v) === norm(answer)) o.classList.add("vg-opt-ok"); });
                finishQ(ok);
            });

            // typing
            const input = modal.querySelector("#vgInput");
            if (input) {
                setTimeout(() => input.focus(), 50);
                modal.querySelectorAll(".vg-acc").forEach(a => a.onclick = () => {
                    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
                    input.value = input.value.slice(0, s) + a.textContent + input.value.slice(e);
                    input.focus(); input.setSelectionRange(s + 1, s + 1);
                });
                const check = () => { if (input.value.trim()) finishQ(isCorrect(input.value, answer), input.value); };
                modal.querySelector("#vgCheck").onclick = check;
                input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(); } });
            }

            // hint
            const hintBtn = modal.querySelector("#vgHint");
            hintBtn.onclick = () => {
                if (!G.hints || done) return;
                G.hints--;
                hintBtn.innerHTML = `<i class="fa-solid fa-lightbulb"></i> მინიშნება (${G.hints})`;
                hintBtn.disabled = true;
                if (input) {
                    const first = answer.split("/")[0].trim();
                    input.value = first.slice(0, Math.max(1, Math.ceil(first.length / 3)));
                    input.focus();
                } else {
                    const wrong = shuffle([...modal.querySelectorAll(".vg-opt")].filter(o => norm(o.dataset.v) !== norm(answer)));
                    wrong.slice(0, 2).forEach(o => { o.disabled = true; o.classList.add("vg-opt-gone"); });
                }
                drawScoreOnly();
            };
        });
    }

    function drawScoreOnly() {
        const h = document.getElementById("vgHints"); if (h) h.textContent = G.hints;
        const s = document.getElementById("vgStreak"); if (s) s.textContent = G.streak;
    }

    // ---------- end + review ----------
    function finish() {
        G.over = true;
        stopTimer();
        const y = points("player"), a = points("ai");
        const acc = G.answered ? Math.round(G.correct / G.answered * 100) : 0;
        const key = "ouispeak-territory-best|" + G.opts.storageKey;
        const best = store(key);
        const isBest = !best || y > best.score;
        if (isBest) store(key, { score: y, levelName: G.level.name });
        const mistakes = [...G.mistakes.values()];
        const result = y > a ? "win" : y < a ? "lose" : "draw";
        const head = { win: "გაიმარჯვე! 🎉", lose: "ამჯერად რობომ მოიგო", draw: "ფრე!" }[result];
        roboHide();
        body().innerHTML = `
            <div class="vg-end vg-end-${result}">
                <div class="vg-end-icon"><i class="fa-solid ${result === "win" ? "fa-trophy" : result === "lose" ? "fa-robot" : "fa-handshake"}"></i></div>
                <h2>${head}</h2>
                <div class="vg-end-score"><span class="vg-you-c">${y}</span> : <span class="vg-ai-c">${a}</span></div>
                <div class="vg-reward" id="vgReward" hidden></div>
                <div class="vg-end-stats">
                    <div><b>${G.correct}/${G.answered}</b><span>სწორი პასუხი</span></div>
                    <div><b>${acc}%</b><span>სიზუსტე</span></div>
                    <div><b>${isBest ? '<i class="fa-solid fa-star"></i> ახალი' : best.score}</b><span>საუკეთესო შედეგი</span></div>
                </div>
                ${mistakes.length ? `
                    <div class="vg-review-title">გაიმეორე ეს სიტყვები (${mistakes.length})</div>
                    <div class="vg-review-list">${mistakes.map(m => `
                        <div class="vg-review-row"><button class="vg-say" data-say="${esc(m.fr)}"><i class="fa-solid fa-volume-high"></i></button>
                        <span class="vg-fr">${esc(m.fr)}</span><span class="vg-review-ka">${esc(m.ka)}</span></div>`).join("")}</div>`
                    : '<div class="vg-perfect"><i class="fa-solid fa-circle-check"></i> შეცდომა არ დაგიშვია — შესანიშნავია!</div>'}
                <div class="vg-end-btns">
                    ${mistakes.length ? '<button class="vg-primary" id="vgReview"><i class="fa-solid fa-rotate"></i> შეცდომების გამეორება</button>' : ""}
                    <button class="vg-secondary" id="vgAgain"><i class="fa-solid fa-play"></i> ხელახლა თამაში</button>
                    <button class="vg-secondary" id="vgExit">დახურვა</button>
                </div>
            </div>
            <div class="vg-modal" id="vgModal" hidden></div>`;
        if (result === "win" && G.levelKey === "hard") sendExpertWin();
        body().querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
        body().querySelector("#vgAgain").onclick = () => { roboHide(); renderStart(); };
        body().querySelector("#vgExit").onclick = close;
        const rv = body().querySelector("#vgReview");
        if (rv) rv.onclick = () => { roboHide(); review(mistakes); };
    }

    // Review (no timer): ask each missed word (same card) until it is answered correctly
    async function review(list) {
        G.over = false;
        const queue = shuffle(list);
        body().innerHTML = `
            <div class="vg-review-screen">
                <h2><i class="fa-solid fa-rotate"></i> შეცდომების გამეორება</h2>
                <div class="vg-status" id="vgStatus"></div>
            </div>
            <div class="vg-modal vg-modal-static" id="vgModal" hidden></div>`;
        G.hints = Math.max(G.hints, 2);
        let rounds = 0;
        while (queue.length && G && rounds < 60) {
            rounds++;
            setStatus(`დარჩა: <b>${queue.length}</b>`);
            const item = queue.shift();
            const ok = await ask(item.tile, "review");
            if (!G) return;
            if (!ok) queue.push(item);
        }
        if (!G) return;
        G.over = true;
        G.mistakes = new Map();
        body().innerHTML = `
            <div class="vg-end vg-end-win">
                <div class="vg-end-icon"><i class="fa-solid fa-graduation-cap"></i></div>
                <h2>ყველა სიტყვა გაიმეორე!</h2>
                <div class="vg-end-btns">
                    <button class="vg-primary" id="vgAgain"><i class="fa-solid fa-play"></i> ხელახლა თამაში</button>
                    <button class="vg-secondary" id="vgExit">დახურვა</button>
                </div>
            </div>`;
        body().querySelector("#vgAgain").onclick = renderStart;
        body().querySelector("#vgExit").onclick = close;
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && root && (!G || !G.started || G.over)) close();
    });

    window.VocabGame = { open, close, _isCorrect: isCorrect, _templateGap: templateGap };
})();
