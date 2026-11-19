// ============================================================
// Bataille de Territoire — vocabulary territory game (vs AI)
// Opened from vocab.html with the "თამაში" button.
// window.VocabGame.open({ words, phrases, weekLabel, storageKey })
// Every tile = one word or one phrase of the week.
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
    const HINTS_PER_GAME = 3;
    const ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "û", "ù", "œ"];

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
    function norm(s) {
        return String(s).toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ")
            .replace(/\s*([?!.,;:])\s*$/g, "").replace(/^[\s¿¡]+|[\s.!?]+$/g, "").trim();
    }
    function noAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe"); }
    function withoutArticle(fr) {
        return fr.replace(/^(le|la|les|un|une|des|du|de la|de l')\s+/i, "").replace(/^l'/i, "").trim();
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
        items.forEach((it, i) => { it.id = i; it.seen = 0; it.right = 0; it.wrong = 0; });

        close();
        root = document.createElement("div");
        root.className = "vg-overlay";
        root.innerHTML = `
            <div class="vg-window" role="dialog" aria-modal="true">
                <div class="vg-head">
                    <div class="vg-title"><i class="fa-solid fa-chess-board"></i> ტერიტორიის ბრძოლა
                        <span class="vg-sub">Bataille de Territoire · ${esc(opts.weekLabel || "")}</span></div>
                    <button class="vg-close" aria-label="დახურვა"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="vg-body"></div>
            </div>`;
        document.body.appendChild(root);
        document.body.classList.add("vg-lock");
        root.querySelector(".vg-close").onclick = () => {
            if (!G || G.over || !G.started || confirm("თამაშიდან გასვლა? პროგრესი არ შეინახება.")) close();
        };
        G = { items, words, phrases, opts, started: false };
        renderStart();
    }

    function close() {
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
        if (root) root.remove();
        root = null;
        if (G) G.over = true;
        G = null;
        document.body.classList.remove("vg-lock");
    }

    function body() { return root.querySelector(".vg-body"); }

    // ---------- start screen ----------
    function renderStart() {
        const best = store("ouispeak-territory-best|" + G.opts.storageKey);
        body().innerHTML = `
            <div class="vg-start">
                <div class="vg-start-icon"><i class="fa-solid fa-chess-rook"></i></div>
                <h2>დაიპყარი დაფა სიტყვებით!</h2>
                <p class="vg-lead">დაფაზე ${G.words.length} სიტყვა და ${G.phrases.length} ფრაზაა. თითოეული უჯრა ერთი სიტყვაა.</p>
                <ul class="vg-rules">
                    <li><i class="fa-solid fa-hand-pointer"></i> <span>აირჩიე თავისუფალი უჯრა <b>შენი ტერიტორიის გვერდით</b> (დასაწყისში — ქვედა რიგიდან) და სწორად უპასუხე.</span></li>
                    <li><i class="fa-solid fa-robot"></i> <span>რობოტი იწყებს ზემოდან და თავის სვლაზე უჯრებს იკავებს.</span></li>
                    <li><i class="fa-solid fa-khanda"></i> <span>რობოტის უჯრაზე დაჭერით იწყება <b>დუელი</b> — უფრო რთული კითხვა. გაიმარჯვე და უჯრა შენია!</span></li>
                    <li><i class="fa-solid fa-shield-halved"></i> <span>თუ რობოტი შენს უჯრას შეუტევს, დაიცავი ის სწორი პასუხით. 3 სწორი პასუხი ზედიზედ = <b>ფარი</b> შემდეგ უჯრაზე.</span></li>
                    <li><i class="fa-solid fa-chess-rook"></i> <span>ფრაზის უჯრა (ციხესიმაგრე) <b>2 ქულა</b> ღირს.</span></li>
                    <li><i class="fa-solid fa-arrow-trend-up"></i> <span>რაც უკვე იცი, ის მეორედ უფრო რთულად მოგეკითხება — ჯერ არჩევა, მერე წერა.</span></li>
                </ul>
                <div class="vg-levels-title">აირჩიე სირთულე</div>
                <div class="vg-levels">
                    ${Object.keys(LEVELS).map(k => `
                        <button class="vg-level" data-level="${k}">
                            <span class="vg-level-name">${LEVELS[k].name}</span>
                            <span class="vg-level-fr">${LEVELS[k].fr}</span>
                            <span class="vg-level-acc">რობოტი სწორად პასუხობს ${Math.round(LEVELS[k].acc * 100)}%-ში</span>
                        </button>`).join("")}
                </div>
                ${best ? `<div class="vg-best"><i class="fa-solid fa-trophy"></i> შენი საუკეთესო შედეგი ამ კვირაში: ${best.score} ქულა (${esc(best.levelName)})</div>` : ""}
            </div>`;
        body().querySelectorAll(".vg-level").forEach(b => b.onclick = () => startGame(b.dataset.level));
    }

    // ---------- game ----------
    function startGame(levelKey) {
        const n = G.items.length;
        const cols = n <= 6 ? 3 : n <= 16 ? 4 : 5;
        const rows = Math.ceil(n / cols);
        // spread phrases ("castles") through the board instead of putting them all at the end
        const order = shuffle(G.items);
        const tiles = [];
        for (let i = 0; i < rows * cols; i++) {
            const it = order[i];
            tiles.push({ idx: i, r: Math.floor(i / cols), c: i % cols, item: it || null, owner: it ? null : "void", shield: false });
        }
        Object.assign(G, {
            level: LEVELS[levelKey], levelKey, cols, rows, tiles,
            turn: "player", started: true, over: false, busy: false,
            hints: HINTS_PER_GAME, streak: 0, shieldReady: false,
            answered: 0, correct: 0, mistakes: new Map(), log: []
        });
        renderBoard();
        setStatus("შენი სვლაა — აირჩიე ქვედა რიგის უჯრა.");
    }

    function neighbors(t) {
        return [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([dr, dc]) => G.tiles.find(x => x.r === t.r + dr && x.c === t.c + dc))
            .filter(Boolean);
    }
    function owned(who) { return G.tiles.filter(t => t.owner === who); }
    function freeTiles() { return G.tiles.filter(t => t.item && t.owner === null); }
    function edgeRow(who) {
        // first row (from the player's side) that still has playable tiles
        const rows = who === "player" ? [...Array(G.rows).keys()].reverse() : [...Array(G.rows).keys()];
        for (const r of rows) {
            const list = G.tiles.filter(t => t.r === r && t.item);
            if (list.length) return list;
        }
        return [];
    }
    function canTarget(who, t) {
        if (!t.item || t.owner === who || t.owner === "void") return false;
        const mine = owned(who);
        if (!mine.length) {
            if (t.owner !== null) return false;
            const edge = edgeRow(who).filter(x => x.owner === null);
            return edge.length ? edge.includes(t) : true;
        }
        if (neighbors(t).some(n => n.owner === who)) return true;
        // nowhere to go next to my land → any free tile ("parachute")
        const reach = G.tiles.some(x => x.item && x.owner !== who && neighbors(x).some(n => n.owner === who));
        return !reach && t.owner === null;
    }
    function points(who) { return owned(who).reduce((s, t) => s + (t.item.phrase ? 2 : 1), 0); }

    function renderBoard() {
        body().innerHTML = `
            <div class="vg-game">
                <div class="vg-score">
                    <div class="vg-side vg-you"><i class="fa-solid fa-user"></i> შენ <b id="vgYou">0</b></div>
                    <div class="vg-mid">
                        <span class="vg-chip" title="მინიშნებები"><i class="fa-solid fa-lightbulb"></i> <b id="vgHints">${G.hints}</b></span>
                        <span class="vg-chip" title="ზედიზედ სწორი"><i class="fa-solid fa-fire"></i> <b id="vgStreak">0</b></span>
                        <span class="vg-chip vg-level-chip">${G.level.name}</span>
                    </div>
                    <div class="vg-side vg-ai"><b id="vgAi">0</b> რობოტი <i class="fa-solid fa-robot"></i></div>
                </div>
                <div class="vg-bar"><div class="vg-bar-you" id="vgBarYou"></div><div class="vg-bar-ai" id="vgBarAi"></div></div>
                <div class="vg-status" id="vgStatus"></div>
                <div class="vg-board" id="vgBoard" style="grid-template-columns: repeat(${G.cols}, 1fr)"></div>
                <div class="vg-legend">
                    <span><i class="vg-dot vg-dot-you"></i> შენი</span>
                    <span><i class="vg-dot vg-dot-ai"></i> რობოტის</span>
                    <span><i class="fa-solid fa-chess-rook"></i> ფრაზა = 2 ქულა</span>
                    <span><i class="fa-solid fa-shield-halved"></i> ფარი</span>
                </div>
            </div>
            <div class="vg-modal" id="vgModal" hidden></div>`;
        drawTiles();
    }

    function drawTiles() {
        const board = document.getElementById("vgBoard");
        if (!board) return;
        board.innerHTML = "";
        G.tiles.forEach(t => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "vg-tile";
            if (!t.item) { el.className += " vg-void"; el.disabled = true; board.appendChild(el); return; }
            if (t.item.phrase) el.className += " vg-castle";
            if (t.owner === "player") el.className += " vg-own-you";
            if (t.owner === "ai") el.className += " vg-own-ai";
            if (t.shield) el.className += " vg-shielded";
            const playable = G.turn === "player" && !G.busy && !G.over && canTarget("player", t);
            if (playable) el.className += t.owner === "ai" ? " vg-can-duel" : " vg-can";
            // free tiles show the Georgian meaning (you must find the French);
            // conquered tiles show the French word (+ Georgian small)
            const main = t.owner ? t.item.fr : t.item.ka;
            const sub = t.owner ? t.item.ka : "";
            el.innerHTML = `
                ${t.item.phrase ? '<i class="fa-solid fa-chess-rook vg-castle-ic"></i>' : ""}
                ${t.shield ? '<i class="fa-solid fa-shield-halved vg-shield-ic"></i>' : ""}
                ${t.owner === "ai" && playable ? '<i class="fa-solid fa-khanda vg-duel-ic"></i>' : ""}
                <span class="vg-tile-main">${esc(main)}</span>
                ${sub ? `<span class="vg-tile-sub">${esc(sub)}</span>` : ""}`;
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

    // ---------- player turn ----------
    async function playerPick(t) {
        if (G.busy || G.turn !== "player" || G.over) return;
        G.busy = true;
        const duel = t.owner === "ai";
        if (duel && t.shield) {
            setStatus("ეს უჯრა ფარითაა დაცული — სხვა აირჩიე.", "bad");
            G.busy = false; drawTiles(); return;
        }
        const ok = await ask(t.item, duel ? "duel" : "capture");
        if (!G || G.over) return;
        if (ok) {
            t.owner = "player";
            if (G.shieldReady) { t.shield = true; G.shieldReady = false; }
            else t.shield = false;
            setStatus(duel ? "დუელი მოგებულია! უჯრა შენია." : "ბრავო! უჯრა დაიკავე.", "good");
        } else {
            setStatus(duel ? "დუელი წაგებულია — უჯრა რობოტთან რჩება." : "არასწორია — უჯრა თავისუფალი რჩება.", "bad");
        }
        G.busy = false;
        drawTiles();
        if (checkEnd()) return;
        G.turn = "ai";
        drawTiles();
        await wait(700);
        aiTurn();
    }

    // ---------- AI turn ----------
    async function aiTurn() {
        if (!G || G.over) return;
        G.busy = true;
        setStatus('<i class="fa-solid fa-robot"></i> რობოტი ფიქრობს…', "ai");
        await wait(900);
        if (!G || G.over) return;

        const targets = G.tiles.filter(t => canTarget("ai", t));
        const free = targets.filter(t => t.owner === null);
        const attackable = targets.filter(t => t.owner === "player" && !t.shield);
        let target = null, attack = false;
        if (attackable.length && (Math.random() < G.level.attack || !free.length)) {
            attack = true;
            target = attackable.sort((a, b) => score(b) - score(a))[0];
        } else if (free.length) {
            target = free.sort((a, b) => score(b) - score(a) + (Math.random() - 0.5) * 2)[0];
        }
        if (!target) { endTurnAI(); return; }

        flash(target);
        if (attack) {
            setStatus(`<i class="fa-solid fa-khanda"></i> რობოტი შენს უჯრას უტევს: <b>${esc(target.item.fr)}</b>. დაიცავი!`, "ai");
            await wait(900);
            const defended = await ask(target.item, "defend");
            if (!G || G.over) return;
            if (defended) setStatus("დაიცავი! უჯრა ისევ შენია.", "good");
            else { target.owner = "ai"; target.shield = false; setStatus("რობოტმა შენი უჯრა წაიღო.", "bad"); }
        } else {
            const ok = Math.random() < G.level.acc;
            if (ok) {
                target.owner = "ai";
                setStatus(`<i class="fa-solid fa-robot"></i> რობოტმა დაიკავა: <b>${esc(target.item.fr)}</b> — ${esc(target.item.ka)}`, "ai");
                speak(target.item.fr);
            } else {
                setStatus('<i class="fa-solid fa-robot"></i> რობოტმა შეცდომა დაუშვა! უჯრა თავისუფალი რჩება.', "good");
            }
        }
        await wait(500);
        endTurnAI();
    }
    function score(t) {
        // AI likes castles, tiles that touch the player's land (blocking), and tiles close to its own
        let s = t.item.phrase ? 3 : 0;
        neighbors(t).forEach(n => { if (n.owner === "player") s += 2; if (n.owner === "ai") s += 1; });
        return s;
    }
    function flash(t) {
        const el = document.querySelectorAll("#vgBoard .vg-tile")[t.idx];
        if (el) { el.classList.add("vg-flash"); }
    }
    function endTurnAI() {
        if (!G || G.over) return;
        G.busy = false;
        if (checkEnd()) { drawTiles(); return; }
        G.turn = "player";
        drawTiles();
        const s = document.getElementById("vgStatus");
        if (s && !/vg-status-(good|bad)/.test(s.className)) setStatus("შენი სვლაა.");
        else setTimeout(() => { if (G && G.turn === "player" && !G.busy) setStatus("შენი სვლაა."); }, 1600);
    }

    function checkEnd() {
        if (freeTiles().length > 0) return false;
        finish();
        return true;
    }

    // ---------- questions ----------
    // mode: capture (normal), duel (harder), defend (robot attacks your tile)
    function pickType(item, mode) {
        if (item.phrase) {
            const tokens = item.fr.split(" ");
            if (mode === "defend") return "fr2ka";
            if ((mode === "duel" || item.right > 0) && tokens.length >= 2 && tokens.length <= 9) return "order";
            return item.seen % 2 === 0 ? "ka2fr" : (tokens.length >= 2 && tokens.length <= 9 ? "order" : "fr2ka");
        }
        if (mode === "defend") return "fr2ka";
        if (mode === "duel" || item.right > 0) return "type";
        const gap = gapPhraseFor(item);
        if (gap && Math.random() < 0.5) return "gap";
        return "ka2fr";
    }

    function gapPhraseFor(item) {
        const forms = [item.fr, withoutArticle(item.fr)].filter(f => f.length >= 2);
        for (const p of G.phrases) {
            const low = p.fr.toLowerCase();
            for (const f of forms) {
                const i = low.indexOf(f.toLowerCase());
                if (i >= 0) return { phrase: p, form: p.fr.substr(i, f.length), start: i };
            }
        }
        return null;
    }

    function distractors(item, field, count) {
        const pool = G.items.filter(x => x !== item && x.phrase === item.phrase && norm(x[field]) !== norm(item[field]));
        const extra = G.items.filter(x => x !== item && x.phrase !== item.phrase && norm(x[field]) !== norm(item[field]));
        return shuffle(pool).concat(shuffle(extra)).slice(0, count).map(x => x[field]);
    }

    function ask(item, mode) {
        return new Promise(resolve => {
            const type = pickType(item, mode);
            item.seen++;
            const modal = document.getElementById("vgModal");
            const title = mode === "duel" ? '<i class="fa-solid fa-khanda"></i> დუელი!'
                : mode === "defend" ? '<i class="fa-solid fa-shield-halved"></i> დაიცავი უჯრა!'
                : mode === "review" ? '<i class="fa-solid fa-rotate"></i> გამეორება'
                : '<i class="fa-solid fa-flag"></i> დაიკავე უჯრა';
            let answer, prompt, html = "";

            if (type === "ka2fr") {
                answer = item.fr;
                prompt = `როგორ იქნება ფრანგულად?<div class="vg-q-big">${esc(item.ka)}</div>`;
                html = optionsHtml(shuffle([item.fr].concat(distractors(item, "fr", 3))));
            } else if (type === "fr2ka") {
                answer = item.ka;
                prompt = `რას ნიშნავს?<div class="vg-q-big vg-fr">${esc(item.fr)} <button class="vg-say" data-say="${esc(item.fr)}" title="მოსმენა"><i class="fa-solid fa-volume-high"></i></button></div>`;
                html = optionsHtml(shuffle([item.ka].concat(distractors(item, "ka", 3))));
            } else if (type === "gap") {
                const g = gapPhraseFor(item);
                answer = g.form;
                const sentence = esc(g.phrase.fr.substr(0, g.start)) + '<span class="vg-gap">_____</span>' + esc(g.phrase.fr.substr(g.start + g.form.length));
                prompt = `ჩასვი სწორი სიტყვა წინადადებაში<div class="vg-q-big vg-fr">${sentence}</div><div class="vg-q-help">${esc(g.phrase.ka)}</div>`;
                const others = shuffle(G.words.filter(w => w !== item)).slice(0, 3).map(w => {
                    const f = g.form.toLowerCase() === item.fr.toLowerCase() ? w.fr : withoutArticle(w.fr);
                    return /^[A-ZÀ-Ý]/.test(g.form) ? f.charAt(0).toUpperCase() + f.slice(1) : f;
                });
                html = optionsHtml(shuffle([g.form].concat(others.filter(o => norm(o) !== norm(g.form)))));
            } else if (type === "type") {
                answer = item.fr;
                prompt = `დაწერე ფრანგულად (ზუსტი მართლწერით)<div class="vg-q-big">${esc(item.ka)}</div>`;
                html = `
                    <input class="vg-input" id="vgInput" autocomplete="off" autocapitalize="off" spellcheck="false" lang="fr" placeholder="ჩაწერე აქ…">
                    <div class="vg-accents">${ACCENTS.map(a => `<button type="button" class="vg-acc">${a}</button>`).join("")}</div>
                    <button class="vg-primary" id="vgCheck"><i class="fa-solid fa-check"></i> შემოწმება</button>`;
            } else if (type === "order") {
                answer = item.fr;
                prompt = `ააწყე ფრაზა სწორი თანმიმდევრობით<div class="vg-q-big">${esc(item.ka)}</div>`;
                html = `
                    <div class="vg-built" id="vgBuilt"></div>
                    <div class="vg-chips" id="vgChips">${shuffle(item.fr.split(" ").map((w, i) => ({ w, i })))
                        .map(o => `<button type="button" class="vg-word" data-i="${o.i}">${esc(o.w)}</button>`).join("")}</div>
                    <button class="vg-primary" id="vgCheck" disabled><i class="fa-solid fa-check"></i> შემოწმება</button>`;
            }

            modal.innerHTML = `
                <div class="vg-card vg-card-${mode}">
                    <div class="vg-card-head"><span>${title}</span>
                        ${item.phrase ? '<span class="vg-tag"><i class="fa-solid fa-chess-rook"></i> ფრაზა · 2 ქულა</span>' : ""}</div>
                    <div class="vg-q">${prompt}</div>
                    <div class="vg-answers">${html}</div>
                    <div class="vg-feedback" id="vgFeedback" hidden></div>
                    <div class="vg-card-foot">
                        <button class="vg-hint" id="vgHint" ${G.hints ? "" : "disabled"}><i class="fa-solid fa-lightbulb"></i> მინიშნება (${G.hints})</button>
                    </div>
                </div>`;
            modal.hidden = false;

            let done = false;
            const finishQ = (ok, given) => {
                if (done) return;
                done = true;
                G.answered++;
                if (ok) {
                    G.correct++; item.right++; G.streak++;
                    if (G.streak > 0 && G.streak % 3 === 0 && mode !== "defend" && mode !== "review") {
                        G.shieldReady = true;
                    }
                } else {
                    item.wrong++; G.streak = 0;
                    G.mistakes.set(item.id, item);
                }
                modal.querySelectorAll("button:not(.vg-say)").forEach(b => b.disabled = true);
                const inp = modal.querySelector("#vgInput"); if (inp) inp.disabled = true;
                const fb = modal.querySelector("#vgFeedback");
                fb.hidden = false;
                fb.className = "vg-feedback " + (ok ? "vg-ok" : "vg-no");
                let extra = "";
                if (!ok && type === "type" && given && noAccents(norm(given)) === noAccents(norm(answer)))
                    extra = '<div class="vg-fb-note">თითქმის! შეამოწმე აქცენტები (é, è, à…).</div>';
                fb.innerHTML = `
                    <div class="vg-fb-title">${ok ? '<i class="fa-solid fa-circle-check"></i> სწორია!' : '<i class="fa-solid fa-circle-xmark"></i> არასწორია'}</div>
                    ${extra}
                    <div class="vg-fb-pair"><span class="vg-fr">${esc(item.fr)}</span>
                        <button class="vg-say" data-say="${esc(item.fr)}" title="მოსმენა"><i class="fa-solid fa-volume-high"></i></button>
                        <span class="vg-fb-eq">=</span> <span>${esc(item.ka)}</span></div>
                    ${G.shieldReady && ok && G.streak % 3 === 0 ? '<div class="vg-fb-note"><i class="fa-solid fa-shield-halved"></i> 3 ზედიზედ! შემდეგი უჯრა ფარით იქნება დაცული.</div>' : ""}
                    <button class="vg-primary" id="vgNext">გაგრძელება <i class="fa-solid fa-arrow-right"></i></button>`;
                fb.querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
                speak(item.fr);
                const next = fb.querySelector("#vgNext");
                next.disabled = false;
                next.focus();
                next.onclick = () => { modal.hidden = true; modal.innerHTML = ""; resolve(ok); };
                drawScoreOnly();
            };

            modal.querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
            if (type === "fr2ka") speak(item.fr);

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
                const check = () => { if (input.value.trim()) finishQ(norm(input.value) === norm(answer), input.value); };
                modal.querySelector("#vgCheck").onclick = check;
                input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(); } });
            }

            // word order
            const chips = modal.querySelector("#vgChips");
            if (chips) {
                const built = modal.querySelector("#vgBuilt");
                const checkBtn = modal.querySelector("#vgCheck");
                const refresh = () => { checkBtn.disabled = chips.children.length > 0; };
                const moveChip = btn => {
                    if (done) return;
                    (btn.parentNode === chips ? built : chips).appendChild(btn);
                    refresh();
                };
                modal.querySelectorAll(".vg-word").forEach(b => b.onclick = () => moveChip(b));
                checkBtn.onclick = () => {
                    const given = [...built.children].map(b => b.textContent).join(" ");
                    finishQ(norm(given) === norm(answer), given);
                };
            }

            // hint
            const hintBtn = modal.querySelector("#vgHint");
            hintBtn.onclick = () => {
                if (!G.hints || done) return;
                G.hints--;
                hintBtn.innerHTML = `<i class="fa-solid fa-lightbulb"></i> მინიშნება (${G.hints})`;
                hintBtn.disabled = true;
                if (type === "type") {
                    const keep = Math.max(1, Math.ceil(answer.length / 3));
                    input.value = answer.slice(0, keep);
                    input.focus();
                } else if (chips) {
                    const built = modal.querySelector("#vgBuilt");
                    [...built.children].forEach(b => chips.appendChild(b));
                    const first = [...chips.children].find(b => b.dataset.i === "0");
                    if (first) { built.appendChild(first); first.classList.add("vg-word-hint"); }
                } else {
                    const wrong = shuffle([...modal.querySelectorAll(".vg-opt")].filter(o => norm(o.dataset.v) !== norm(answer)));
                    wrong.slice(0, 2).forEach(o => { o.disabled = true; o.classList.add("vg-opt-gone"); });
                }
                drawScoreOnly();
            };
        });
    }

    function optionsHtml(list) {
        return `<div class="vg-opts">${list.map(v => `<button type="button" class="vg-opt" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div>`;
    }
    function drawScoreOnly() {
        const h = document.getElementById("vgHints"); if (h) h.textContent = G.hints;
        const s = document.getElementById("vgStreak"); if (s) s.textContent = G.streak;
    }

    // ---------- end + review ----------
    function finish() {
        G.over = true;
        const y = points("player"), a = points("ai");
        const acc = G.answered ? Math.round(G.correct / G.answered * 100) : 0;
        const key = "ouispeak-territory-best|" + G.opts.storageKey;
        const best = store(key);
        const isBest = !best || y > best.score;
        if (isBest) store(key, { score: y, levelName: G.level.name });
        const mistakes = [...G.mistakes.values()];
        const result = y > a ? "win" : y < a ? "lose" : "draw";
        const head = { win: "გაიმარჯვე! 🎉", lose: "ამჯერად რობოტმა მოიგო", draw: "ფრე!" }[result];
        body().innerHTML = `
            <div class="vg-end vg-end-${result}">
                <div class="vg-end-icon"><i class="fa-solid ${result === "win" ? "fa-trophy" : result === "lose" ? "fa-robot" : "fa-handshake"}"></i></div>
                <h2>${head}</h2>
                <div class="vg-end-score"><span class="vg-you-c">${y}</span> : <span class="vg-ai-c">${a}</span></div>
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
        body().querySelectorAll(".vg-say").forEach(b => b.onclick = () => speak(b.dataset.say));
        const again = () => { G.items.forEach(it => { it.seen = 0; it.right = 0; it.wrong = 0; }); renderStart(); };
        body().querySelector("#vgAgain").onclick = again;
        body().querySelector("#vgExit").onclick = close;
        const rv = body().querySelector("#vgReview");
        if (rv) rv.onclick = () => review(mistakes);
    }

    // Review: ask each missed word until it is answered correctly (wrong ones come back at the end)
    async function review(list) {
        G.over = false;
        const queue = shuffle(list);
        body().innerHTML = `
            <div class="vg-review-screen">
                <h2><i class="fa-solid fa-rotate"></i> შეცდომების გამეორება</h2>
                <div class="vg-status" id="vgStatus"></div>
                <div class="vg-score" style="display:none"><b id="vgHints"></b><b id="vgStreak"></b></div>
            </div>
            <div class="vg-modal vg-modal-static" id="vgModal" hidden></div>`;
        G.hints = Math.max(G.hints, 2);
        let rounds = 0;
        while (queue.length && G && rounds < 60) {
            rounds++;
            setStatus(`დარჩა: <b>${queue.length}</b>`);
            const item = queue.shift();
            item.right = 0; // review starts from multiple choice again
            const ok = await ask(item, "review");
            if (!G) return;
            if (!ok) queue.push(item);
        }
        if (!G) return;
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
        body().querySelector("#vgAgain").onclick = () => { G.items.forEach(it => { it.seen = 0; it.right = 0; }); renderStart(); };
        body().querySelector("#vgExit").onclick = close;
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && root && (!G || !G.started || G.over)) close();
    });

    window.VocabGame = { open, close };
})();
