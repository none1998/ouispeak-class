        /* =========================================================
           OUIBOT LOGIC (added block – reads the existing _supabase,
           SUPABASE_URL and SUPABASE_ANON_KEY, changes nothing above)
           - first visit: student builds the robot (look, name, gender) – saved forever
           - then once a day: 5 questions in French, a different "mood" every day
           - X button closes the window (it comes back the next day)
           - the chat never ends by itself: it goes on until the student clicks X
           - permanent memory of what the student told him (never asks the same thing twice)
           - a button in the bottom-right corner calls the robot at any time
           - text only (no voice)
           - Gemini is called through the same Supabase Edge Function as exercice.html
           ========================================================= */
        (function () {
            const $ = (id) => document.getElementById(id);
            const root = document.documentElement;
            const OB_ENDPOINT = `${SUPABASE_URL}/functions/v1/openai-chat`;
            const OB_MODELS = ["gpt-6-luna", "gpt-5.4-mini", "gpt-4.1-mini"];

            /* The 3D robot (js/robot3d.js). Older robots get the closest new look automatically. */
            const R3 = window.Robot3D;
            const OPT = R3 ? R3.OPTIONS : {};
            function migrateProfile(p) {
                if (!p) return p;
                if (p.v === 4) return p;
                const pickKey = (map, k, fallback) => (map && map[k] ? k : fallback);
                const bodyMap = { blanc: 'blanc', argent: 'argent', perle: 'rose', glacier: 'bleu', champagne: 'jaune', graphite: 'noir', noir: 'noir' };
                const accMap = { anthracite: 'noir', noir: 'noir', blanc: 'argent', or: 'or', cyan: 'bleu', rose: 'rose' };
                const eyeMap = { marron: 'jaune', noisette: 'jaune', vert: 'vert', bleu: 'bleu', gris: 'blanc', cyan: 'cyan', violet: 'violet' };
                const topMap = { casque: 'casque', casquette: 'casquette', bonnet: 'casquette', noeud: 'noeud', fleur: 'noeud', bandeau: 'antenne' };
                const chestMap = { coeur: 'coeur', anneau: 'anneau', drapeau: 'drapeau', etoile: 'etoile', aucun: 'aucun' };
                const extra = p.glasses && p.glasses !== 'aucune' ? 'lunettes' : (p.outfit === 'echarpe' ? 'echarpe' : 'aucun');
                return {
                    name: p.name, gender: p.gender, created: p.created, v: 4,
                    head: 'ronde',
                    body: pickKey(OPT.body, bodyMap[p.shell], 'blanc'),
                    accent: pickKey(OPT.accent, accMap[p.joint], 'bleu'),
                    eyes: p.gender === 'f' ? 'ovale' : 'rond',
                    eyeColor: pickKey(OPT.eyeColor, eyeMap[p.eyeColor], 'cyan'),
                    top: topMap[p.acc] || 'antenne',
                    chest: chestMap[p.emblem] || 'coeur',
                    extra
                };
            }
            function botLabel(p, key) { const o = OPT[key] && OPT[key][p[key]]; return o ? o.ka : ''; }

            /* Each day the robot is in a different mood, so the conversation never feels the same twice.
               The mood is only background colour – it is NOT a joke to repeat. */
            const VIBES = [
                { id: 'energy',    en: "You are in a great mood today, full of energy and very happy to see the student." },
                { id: 'tired',     en: "You are a little tired today, but chatting with the student cheers you up." },
                { id: 'project',   en: "You started a little personal project (learning to draw, to cook a Georgian dish, to juggle…) and it is not going very well." },
                { id: 'question',  en: "You woke up with a big funny question in your head (e.g. why do we yawn?) and want the student's opinion." },
                { id: 'curious',   en: "You are very curious today and want to know everything about the student's week." },
                { id: 'weekend',   en: "You are thinking about the weekend and looking for good ideas." },
                { id: 'memories',  en: "You feel a bit nostalgic today and like talking about good memories." },
                { id: 'georgian',  en: "You have been trying to learn a few Georgian words and would love some help." },
                { id: 'travel',    en: "You have been reading about beautiful places (in France and in Georgia) and dream of travelling." },
                { id: 'mishap',    en: "A small, believable funny thing happened to you today (invent it, tell it once only if it fits)." },
                { id: 'gossip',    en: "You are in a chatty, gossipy mood: you want the student's news (school, friends, plans) – kindly." },
                { id: 'coach',     en: "You are in a motivating mood and really want to help the student make progress in French today." }
            ];
            /* Special "moves" – each day only one or two are allowed, never all of them */
            const MOVES = [
                { id: 'funny',    en: "Teaser: 'Il m'est arrivé un truc drôle aujourd'hui… tu veux savoir ?' and then tell a short, believable funny story." },
                { id: 'france',   en: "Talk about something real in France at this time of year (holidays, school breaks, music, sport, festivals, traditions) and ask what it is like in Georgia. NEVER invent news." },
                { id: 'update',   en: "Ask for NEWS about something you remember from previous chats (a person, a plan, an exam, a hobby the student told you about)." },
                { id: 'imagine',  en: "An imaginative question: 'Si tu pouvais…' (have a superpower for one day, live in any city, talk to an animal…)." },
                { id: 'challenge',en: "A tiny French challenge: describe something in 3 words, say a sentence with a given word, guess a word from a definition." },
                { id: 'riddle',   en: "A tiny riddle or guessing game in easy French (devinette)." },
                { id: 'teach',    en: "Ask the student to teach you one Georgian word." },
                { id: 'personal', en: "A personal question you never asked before (family, friends, dream job, favourite place, best memory)." },
                { id: 'opinion',  en: "Ask the student's opinion on a real-life situation (at school, with friends, in the family) and share your own." },
                { id: 'gossip',   en: "Invite the student to share their news or gossip: 'Alors, quoi de neuf ? Raconte-moi tout !' (school, friends) – stay kind." },
                { id: 'help',     en: "Offer help with French naturally: ask if there is a word or something from class they did not understand." }
            ];

            /* Surprises: the robot takes the initiative. Three families that rotate day after day
               (never the same family two days in a row), each with many variants. */
            const STORY_GENRES = [
                { id: 'funny',     en: 'a FUNNY story with a surprising ending' },
                { id: 'mystery',   en: 'a little MYSTERY story (who did it? what happened?)' },
                { id: 'adventure', en: 'an ADVENTURE story (a trip, a challenge, a discovery)' },
                { id: 'scary',     en: 'a mildly SCARY story (no violence, no gore, suitable for teenagers) with a twist ending' },
                { id: 'drama',     en: 'an over-the-top DRAMATIC story (friendship, a big secret, a misunderstanding) that ends in a funny way' },
                { id: 'love',      en: 'a sweet, light LOVE story (age-appropriate)' },
                { id: 'scifi',     en: 'a short SCIENCE-FICTION story (robots, space, the future)' },
                { id: 'animals',   en: 'a cute or funny story about ANIMALS' },
                { id: 'school',    en: 'a funny story that happens at SCHOOL' }
            ];
            const TEACH_KINDS = [
                { id: 'word',     en: 'a fun everyday word or exclamation (A1: Miam ! Oups ! Coucou, Bisous, Bof ; A2/B1: Ouf, Chut, Bref, Grave)' },
                { id: 'expr',     en: 'a useful everyday expression (A1: Ça va ? / Pas mal ; A2: Ça marche, Pas de souci ; B1: J\'en ai marre, Ça me saoule, Avoir la flemme)' },
                { id: 'texting',  en: 'how French people write text messages (slt, stp, bcp, mdr, jsp, dsl) – explain and let the student write a mini text' },
                { id: 'idiom',    en: 'a funny image idiom adapted to the level (A1/A2: Il pleut des cordes, Avoir la pêche ; B1: Poser un lapin, Avoir un chat dans la gorge, Coûter les yeux de la tête)' },
                { id: 'false',    en: 'a "false friend" or a word that looks like English/Georgian but means something else (A2/B1), or for A1 a word that is EASY because it looks like English' },
                { id: 'twister',  en: 'a French tongue twister (A1: Un chasseur sachant chasser… very short part only ; B1: Les chaussettes de l\'archiduchesse…) – challenge the student to say it fast' },
                { id: 'culture',  en: 'a fun thing about how French people really live or speak (la bise, the gesture "bof", "le goûter", saying "euh…") with a mini example' }
            ];
            const GAMES = [
                { id: 'ouinon',     main: true, en: 'OUI OU NON – DEVINE LE PERSONNAGE (see GAME RULES 1).' },
                { id: 'verites',    main: true, en: 'DEUX VÉRITÉS, UN MENSONGE (see GAME RULES 2).' },
                { id: 'devine',     en: 'DEVINE L\'OBJET: you describe an object, an animal or a food in 3 easy clues, one clue at a time; the student guesses in French. Give 3-4 options in "choices" for A1.' },
                { id: 'vraifaux',   en: 'VRAI OU FAUX: you say a surprising sentence about France, Georgia, animals or the world (REAL facts only); the student answers vrai ou faux. 3 rounds. Put "Vrai" / "Faux" in "choices".' },
                { id: 'emoji',      en: 'DEVINETTE EMOJI: you write 2-3 emojis that represent a French word, a place or a famous story; the student finds it in French. Give options in "choices" for A1/A2.' },
                { id: 'chaine',     en: 'LA CHAÎNE DE MOTS: you say a French word, the student says a word that starts with the last letter, and so on. Correct gently.' },
                { id: 'categories', en: 'LE JEU DES CATÉGORIES: you give a category (fruits, animaux, métiers, pays…) and a letter; the student names a word in French. 3 rounds, you play too.' },
                { id: 'histoire',   en: 'L\'HISTOIRE À DEUX: you start a short story with one sentence, the student adds the next sentence, you continue, etc. Keep it funny.' },
                { id: 'traduction', en: 'TRADUCTION EXPRESS: you give a Georgian word (written in Georgian) and the student must find the French word, 3 rounds, with points. Give options in "choices" for A1.' },
                { id: 'intrus',     en: 'CHERCHE L\'INTRUS: you give 4 French words, one does not belong (e.g. pomme, banane, chaise, fraise); the student finds it and says why. Put the 4 words in "choices".' },
                { id: 'pendu',      en: 'LE PENDU (hangman): you choose a French word suited to the level (write it in "secret"), show it as _ _ _ _ with the number of letters; the student proposes letters; you show the found letters; 7 mistakes max.' }
            ];
            const SURPRISE_FAMILIES = ['story', 'teach', 'game'];

            function makeSurprise(family, avoidIds) {
                avoidIds = avoidIds || [];
                if (family === 'story') {
                    const pool = STORY_GENRES.filter(g => !avoidIds.includes('story-' + g.id));
                    const g = pick(pool.length ? pool : STORY_GENRES);
                    return { id: 'story-' + g.id, family, en: `Offer to tell ${g.en}. Phrase the offer in your own words, in a new way (do NOT always say "Tu veux que je te raconte une histoire…" – e.g. tease it, create suspense, say something happened to you…). If the student says yes, TELL THE STORY in your next message.` };
                }
                if (family === 'teach') {
                    const pool = TEACH_KINDS.filter(t => !avoidIds.includes('teach-' + t.id));
                    const t = pick(pool.length ? pool : TEACH_KINDS);
                    return { id: 'teach-' + t.id, family, en: `Offer to teach the student something fun in French, for example "Tu veux que je t'apprenne un truc en français ? 🤓" (you can vary the words). If yes, teach ${t.en}. Keep it to the student's level, give a mini example, then ask the student to try to use it.` };
                }
                // the two "big" games (oui/non and deux vérités) come back more often
                const pool = GAMES.filter(gm => !avoidIds.includes('game-' + gm.id));
                const mains = pool.filter(gm => gm.main);
                const gm = (mains.length && Math.random() < 0.6) ? pick(mains) : pick(pool.length ? pool : GAMES);
                return { id: 'game-' + gm.id, family: 'game', en: `Offer to play a game, in your own words (e.g. "On joue à un jeu ? 🎲"). The game: ${gm.en} If the student says yes, explain the rules in 1-3 very easy sentences, let the student choose the roles when the game has roles, and then START.` };
            }

            /* ---------- helpers ---------- */
            function todayStr(d) {
                d = d || new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            function daysBetween(a, b) {
                return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
            }
            function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
            function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
            function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]); }

            /* ---------- android drawing (original design) ---------- */
            let svgCounter = 0;
            function mixColor(a, b, t) {
                const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
                const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
                return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
            }


            /* A picture of the robot (small places: buttons, tiles, title bar) */
            function robotImg(p, label, frame, w, h) {
                const url = R3 ? R3.snapshot(migrateProfile(p), frame || 'full', w || 120, h || 150) : '';
                if (!url) return '<span class="r3d-fallback" aria-hidden="true">🤖</span>';
                const alt = String(label || 'robot').replace(/[<>&"]/g, '');
                return `<img class="r3d-img" src="${url}" alt="${alt}" draggable="false">`;
            }
            /* The live, animated 3D robot (big places) */
            function mountBot(id, p, opts) {
                const el = $(id);
                if (!el || !R3) return null;
                return R3.mount(el, migrateProfile(p), Object.assign({ frame: 'full' }, opts || {}));
            }

            function lookText(p) {
                p = migrateProfile(p) || {};
                const EN = {
                    head: { ronde: 'a round head', carree: 'a square head', tele: 'a wide TV-shaped head', oeuf: 'an egg-shaped head' },
                    eyes: { rond: 'round', ovale: 'oval', carre: 'square', coeur: 'heart-shaped', etoile: 'star-shaped' },
                    top: { antenne: 'a little antenna', oreilles: 'cat ears', helice: 'a propeller on the head', noeud: 'a bow', casquette: 'a cap', casque: 'headphones', couronne: 'a crown' },
                    chest: { coeur: 'a glowing heart on the chest', etoile: 'a glowing star on the chest', anneau: 'a glowing energy ring on the chest', drapeau: 'a small French flag on the chest' },
                    extra: { lunettes: 'glasses', echarpe: 'a scarf', papillon: 'a bow tie', sac: 'a backpack' }
                };
                const parts = [`a cute, friendly floating 3D robot ${p.gender === 'f' ? 'girl' : 'boy'} with ${EN.head[p.head] || 'a round head'}, a dark face screen with glowing ${EN.eyes[p.eyes] || 'round'} eyes, a ${botLabel(p, 'body') ? p.body : 'white'} body with ${p.accent} details`];
                ['top', 'chest', 'extra'].forEach(k => { if (EN[k][p[k]]) parts.push('with ' + EN[k][p[k]]); });
                return parts.join(', ');
            }

            /* ---------- permanent memory ----------
               Everything the robot learns about the student + every question topic it already asked.
               Saved forever in the Supabase table "ouibot_memory" (one row per student),
               and also in the browser as a backup. */
            const MAX_FACTS = 120;
            const MAX_ASKED = 250;
            let mem = { facts: [], asked: [] };
            let memTableOk = true;
            let memSaveTimer = null;

            function memKey() { return 'ouibot_mem_' + user.id; }
            function mergeLists(...lists) {
                const out = [];
                lists.forEach(list => (list || []).forEach(x => {
                    if (typeof x !== 'string') return;
                    const v = x.trim();
                    if (v && !out.some(y => y.toLowerCase() === v.toLowerCase())) out.push(v);
                }));
                return out;
            }

            async function loadMemory() {
                let local = null;
                try { local = JSON.parse(localStorage.getItem(memKey()) || 'null'); } catch (e) { local = null; }
                let remote = null;
                try {
                    const { data, error } = await _supabase.from('ouibot_memory').select('data').eq('user_id', user.id).maybeSingle();
                    if (error) throw error;
                    remote = data && data.data;
                    memTableOk = true;
                } catch (e) {
                    memTableOk = false;
                    console.warn('OuiBot: memory table not available, using browser memory only', e);
                }
                mem = {
                    facts: mergeLists(remote && remote.facts, local && local.facts, state.memories).slice(-MAX_FACTS),
                    asked: mergeLists(remote && remote.asked, local && local.asked, state.recent).slice(-MAX_ASKED)
                };
                // old versions kept a short memory inside the account data: move it to the new memory
                if ((state.memories && state.memories.length) || (state.recent && state.recent.length)) {
                    state.memories = [];
                    state.recent = [];
                    saveMemory(true);
                    saveState();
                }
            }

            function saveMemory(now) {
                try { localStorage.setItem(memKey(), JSON.stringify(mem)); } catch (e) {}
                clearTimeout(memSaveTimer);
                const push = async () => {
                    if (!memTableOk) return;
                    try {
                        const { error } = await _supabase.from('ouibot_memory').upsert({ user_id: user.id, data: mem, updated_at: new Date().toISOString() });
                        if (error) throw error;
                    } catch (e) {
                        memTableOk = false;
                        console.warn('OuiBot: could not save memory to Supabase', e);
                    }
                };
                if (now) return push();
                memSaveTimer = setTimeout(push, 1500);
            }

            function remember(facts, topic) {
                let changed = false;
                (Array.isArray(facts) ? facts : [facts]).forEach(f => {
                    if (typeof f !== 'string') return;
                    const v = f.trim().slice(0, 140);
                    if (v && !mem.facts.some(x => x.toLowerCase() === v.toLowerCase())) { mem.facts.push(v); changed = true; }
                });
                if (typeof topic === 'string') {
                    const t = topic.trim().slice(0, 70);
                    if (t && !/^(how was (your|the) day|greeting)$/i.test(t) && !mem.asked.some(x => x.toLowerCase() === t.toLowerCase())) { mem.asked.push(t); changed = true; }
                }
                if (changed) {
                    mem.facts = mem.facts.slice(-MAX_FACTS);
                    mem.asked = mem.asked.slice(-MAX_ASKED);
                    saveMemory();
                }
            }

            /* ---------- state ---------- */
            let user = null;
            let student = { firstName: '', course: '' };
            let state = null;
            let started = false;
            let chat = null;

            function lsKey() { return 'ouibot_' + user.id; }

            function loadState() {
                const meta = (user.user_metadata && user.user_metadata.ouibot) || null;
                let local = null;
                try { local = JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch (e) { local = null; }
                let st = Object.assign({}, local || {}, meta || {});
                if (meta && local) {
                    if (!meta.profile && local.profile) st.profile = local.profile;
                    if ((local.lastChat || '') > (meta.lastChat || '')) st.lastChat = local.lastChat;
                    if ((local.skipped || '') > (meta.skipped || '')) st.skipped = local.skipped;
                }
                ['memories', 'recent', 'vibes', 'moves'].forEach(k => { st[k] = Array.isArray(st[k]) ? st[k] : []; });
                st.chats = st.chats || 0;
                return st;
            }

            async function saveState() {
                try { localStorage.setItem(lsKey(), JSON.stringify(state)); } catch (e) { /* storage blocked */ }
                try {
                    // Saved on the student's own account, so the robot is the same on every device
                    const small = Object.assign({}, state);
                    delete small.memories;
                    delete small.recent;
                    await _supabase.auth.updateUser({ data: { ouibot: small } });
                } catch (e) { console.warn('OuiBot: could not save to account', e); }
            }

            function levelInfo(course) {
                const c = String(course || '');
                const level = /B1/i.test(c) ? 'B1' : (/A2/i.test(c) ? 'A2' : 'A1');
                return { level, delf: /delf/i.test(c) };
            }

            /* ---------- window open / close ---------- */
            function showWindow(id) {
                ['obSetup', 'obChat'].forEach(s => $(s).classList.toggle('ob-active', s === id));
                const ov = $('obOverlay');
                ov.hidden = false;
                ov.classList.remove('ob-leaving');
                root.classList.add('ob-open');
            }

            function hideWindow(instant) {
                const ov = $('obOverlay');
                stopSpeech();
                introSkip = true;
                if (introCancel) introCancel();
                $('obHero').hidden = true;
                $('obChat').classList.remove('ob-behind');
                stopMic();
                if (ov.hidden) return;
                const done = () => { ov.hidden = true; ov.classList.remove('ob-leaving'); root.classList.remove('ob-open'); updateLauncher(); };
                if (instant) return done();
                ov.classList.add('ob-leaving');
                setTimeout(done, 250);
            }

            /* X button / Escape: the student doesn't want to talk today → back tomorrow */
            function dismiss() {
                if ($('obOverlay').hidden) return;
                const today = todayStr();
                if (state && state.lastChat !== today && state.skipped !== today) {
                    state.skipped = today;
                    saveState();
                }
                hideWindow(false);
            }
            document.querySelectorAll('#obOverlay [data-ob-close]').forEach(b => b.addEventListener('click', dismiss));
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('obOverlay').hidden && !$('obSetup').classList.contains('ob-active')) dismiss(); });

            /* ---------- start check (after login) ---------- */
            async function maybeStart(session) {
                if (started) return;
                if ((typeof isRecoveryMode !== 'undefined' && isRecoveryMode) || (typeof cameFromResetLink !== 'undefined' && cameFromResetLink)) return;
                started = true;
                try {
                    const { data: st, error } = await _supabase
                        .from('Students')
                        .select('firstName, course, is_active')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();
                    if (error || !st || st.is_active === false) { started = false; return; }

                    const { data: s2 } = await _supabase.auth.getSession();
                    if (!s2 || !s2.session) { started = false; return; }

                    user = s2.session.user;
                    student = { firstName: (st.firstName || '').trim(), course: st.course || '' };
                    state = loadState();
                    await loadMemory();

                    /* TEST MODE (teacher):
                       index.html?robot=test  -> opens today's chat again (keeps the robot)
                       index.html?robot=reset -> deletes the robot and starts from the creation step */
                    const robotMode = new URLSearchParams(window.location.search).get('robot');
                    if (robotMode === 'reset') {
                        state = { memories: [], recent: [], vibes: [], moves: [], chats: 0 };
                        try { localStorage.removeItem(lsKey()); localStorage.removeItem('ouibot_chat_' + user.id); } catch (e) {}
                        chat = null;
                        mem = { facts: [], asked: [] };
                        await saveMemory(true);
                        await saveState();
                    }

                    updateLauncher();
                    $('obLauncher').hidden = false;

                    const today = todayStr();
                    if (!robotMode && (state.lastChat === today || state.skipped === today)) return;
                    if (!state.profile) openSetup();
                    else if (!(state.profile.v >= 2)) openSetup('restyle');
                    else openChat(false);
                } catch (err) {
                    console.error('OuiBot start error:', err);
                    started = false;
                }
            }

            _supabase.auth.onAuthStateChange((event, session) => {
                if (!session || !session.user) {
                    started = false;
                    hideWindow(true);
                    $('obLauncher').hidden = true;
                    return;
                }
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
                    // small delay so the page appears first and the existing ID check can finish
                    setTimeout(() => maybeStart(session), event === 'SIGNED_IN' ? 900 : 600);
                }
            });

            /* =====================================================
               1) SETUP – look, name, gender (saved forever)
               ===================================================== */
            const draft = Object.assign({ name: '', gender: '' }, R3 ? R3.DEFAULT : {}, { gender: '', v: 4 });
            let setupMode = 'new';      // 'new' = first creation, 'restyle' = very old robot chooses its new look
            let setupIndex = 0;
            let setupBot = null;

            /* One question per screen (Georgian only). 10 questions, the intro is not counted. */
            const SETUP = [
                { key: 'intro', type: 'intro' },
                { key: 'name', type: 'name', q: 'რა გინდა რომ მერქვას?', sub: 'ჩაწერე ჩემი სახელი. შეგიძლია ფრანგული სახელი აირჩიო, მაგალითად Léa, Noah, Chloé ან Adam.' },
                { key: 'gender', type: 'gender', q: 'ბიჭი გინდა რომ ვიყო თუ გოგო?', sub: 'ამის მიხედვით ფრანგულად სწორად ვილაპარაკებ, მაგალითად: content (ბიჭი) / contente (გოგო).' },
                { key: 'head', type: 'tile', field: 'head', map: () => OPT.head, frame: 'head', q: 'როგორი თავი გინდა რომ მქონდეს?', sub: 'დააჭირე და მაშინვე დაინახავ, როგორი ვიქნები. შემიძლია თითით ან მაუსით შემატრიალო!' },
                { key: 'body', type: 'swatch', field: 'body', map: () => OPT.body, q: 'რა ფერის იყოს ჩემი სხეული?' },
                { key: 'accent', type: 'swatch', field: 'accent', map: () => OPT.accent, q: 'რა ფერის იყოს ჩემი დეტალები?', sub: 'ყურები, ხელები, კისერი და აქსესუარები.' },
                { key: 'eyes', type: 'eyes', q: 'როგორი თვალები გინდა რომ მქონდეს?', sub: 'ჯერ აირჩიე ფორმა, მერე ფერი.' },
                { key: 'top', type: 'tile', field: 'top', map: () => OPT.top, frame: 'head', q: 'თავზე რა გავიკეთო?' },
                { key: 'chest', type: 'tile', field: 'chest', map: () => OPT.chest, frame: 'chest', q: 'რა ენთოს ჩემს მკერდზე?' },
                { key: 'extra', type: 'tile', field: 'extra', map: () => OPT.extra, frame: 'body', q: 'და ბოლოს: რამე აქსესუარი?' },
                { key: 'summary', type: 'summary' }
            ];
            const visibleSteps = () => SETUP.filter(st => !(setupMode === 'restyle' && (st.key === 'name' || st.key === 'gender')));

            function renderSetupPreview() {
                if (setupBot) setupBot.setProfile(Object.assign({}, draft, { gender: draft.gender || 'f' }));
                $('obSetupPlate').textContent = draft.name || '';
            }

            /* Little "pop + sparkles" when the student picks something */
            function celebrate() {
                const box = $('obSetupRobot');
                if (setupBot) setupBot.gesture(Math.random() < 0.5 ? 'wow' : 'nod');
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                const colors = ['#0055a5', '#ef4135', '#facc15', '#60a5fa', '#34d399'];
                for (let i = 0; i < 10; i++) {
                    const sp = document.createElement('span');
                    sp.className = 'ob-spark';
                    const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
                    const d = 70 + Math.random() * 50;
                    sp.style.setProperty('--dx', `${Math.cos(ang) * d}px`);
                    sp.style.setProperty('--dy', `${Math.sin(ang) * d}px`);
                    sp.style.background = colors[i % colors.length];
                    box.appendChild(sp);
                    setTimeout(() => sp.remove(), 750);
                }
            }

            function pickOption(field, value) {
                draft[field] = value;
                renderSetupPreview();
                celebrate();
            }

            /* picture tiles: the robot wearing each option */
            function tileGroup(box, map, field, frame, keep) {
                if (!keep) { box.className = 'obs-answer obs-tiles'; box.innerHTML = ''; }
                Object.keys(map).forEach(k => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'obs-tile';
                    b.setAttribute('aria-pressed', String(draft[field] === k));
                    const preview = Object.assign({}, draft, { gender: draft.gender || 'f', [field]: k });
                    b.innerHTML = `<span class="obs-tile-img">${robotImg(preview, map[k].ka, frame, 118, 84)}</span><span class="obs-tile-label"></span>`;
                    b.querySelector('.obs-tile-label').textContent = map[k].ka;
                    b.addEventListener('click', () => {
                        box.querySelectorAll('.obs-tile').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
                        pickOption(field, k);
                    });
                    box.appendChild(b);
                });
            }

            /* colour buttons with their name */
            function swatchGroup(box, map, field, onPick) {
                box.className = 'obs-answer obs-swatches';
                box.innerHTML = '';
                Object.keys(map).forEach(k => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'obs-swatch';
                    b.setAttribute('aria-pressed', String(draft[field] === k));
                    b.innerHTML = `<span class="obs-dot"></span><span class="obs-swatch-label"></span>`;
                    b.querySelector('.obs-dot').style.background = map[k].c;
                    b.querySelector('.obs-swatch-label').textContent = map[k].ka;
                    b.addEventListener('click', () => {
                        box.querySelectorAll('.obs-swatch').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
                        pickOption(field, k);
                        if (onPick) onPick();
                    });
                    box.appendChild(b);
                });
            }

            function buildAnswer(st) {
                const box = $('obsAnswer');
                box.className = 'obs-answer';
                box.innerHTML = '';
                if (st.type === 'intro') {
                    box.innerHTML = `<div class="obs-intro-list">
                        <div><i class="fa-solid fa-comments"></i><span>ყოველდღე ფრანგულად გესაუბრები — შენი დონის მიხედვით.</span></div>
                        <div><i class="fa-solid fa-lightbulb"></i><span>თუ რამე ვერ გაიგე, ქართულად აგიხსნი.</span></div>
                        <div><i class="fa-solid fa-heart"></i><span>მემახსოვრება, რასაც მომიყვები — როგორც ნამდვილ მეგობარს.</span></div>
                    </div>`;
                }
                if (st.type === 'name') {
                    box.innerHTML = `<input class="obs-input" id="obNameInput" type="text" maxlength="20" autocomplete="off" placeholder="მაგ. Léa, Noah, Chloé…" aria-label="რობოტის სახელი"><p class="obs-hint">მაქსიმუმ 20 ასო.</p>`;
                    const inp = $('obNameInput');
                    inp.value = draft.name;
                    inp.addEventListener('input', () => { draft.name = inp.value.trim(); renderSetupPreview(); });
                    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('obNextBtn').click(); } });
                    setTimeout(() => inp.focus(), 80);
                }
                if (st.type === 'gender') {
                    box.className = 'obs-answer obs-genders';
                    [['m', 'ბიჭი', 'fa-mars'], ['f', 'გოგო', 'fa-venus']].forEach(([g, label, icon]) => {
                        const b = document.createElement('button');
                        b.type = 'button';
                        b.className = 'obs-gender';
                        b.setAttribute('aria-pressed', String(draft.gender === g));
                        const look = Object.assign({}, draft, { gender: g, eyes: g === 'f' ? 'ovale' : 'rond' });
                        b.innerHTML = `<span class="obs-gender-img">${robotImg(look, label, 'bust', 190, 150)}</span><span class="obs-gender-label"><i class="fa-solid ${icon}"></i> ${label}</span>`;
                        b.addEventListener('click', () => {
                            draft.gender = g;
                            draft.eyes = g === 'f' ? 'ovale' : 'rond';
                            box.querySelectorAll('.obs-gender').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
                            renderSetupPreview();
                            celebrate();
                        });
                        box.appendChild(b);
                    });
                }
                if (st.type === 'swatch') swatchGroup(box, st.map(), st.field);
                if (st.type === 'tile') tileGroup(box, st.map(), st.field, st.frame);
                if (st.type === 'eyes') {
                    box.className = 'obs-answer obs-eyes';
                    box.innerHTML = '<div class="obs-tiles" id="obsEyeShapes"></div><p class="obs-mini-title">ფერი</p><div class="obs-swatches" id="obsEyeColors"></div>';
                    const shapes = $('obsEyeShapes');
                    const drawShapes = () => tileGroup(shapes, OPT.eyes, 'eyes', 'face', true);
                    shapes.className = 'obs-tiles';
                    drawShapes();
                    swatchGroup($('obsEyeColors'), OPT.eyeColor, 'eyeColor', () => { shapes.innerHTML = ''; drawShapes(); });
                    $('obsEyeColors').className = 'obs-swatches';
                }
                if (st.type === 'summary') {
                    const meta = [draft.gender === 'f' ? 'გოგო' : 'ბიჭი', `${botLabel(draft, 'head')} თავი`, `${botLabel(draft, 'body')} სხეული`, `${botLabel(draft, 'accent')} დეტალები`,
                        `${botLabel(draft, 'eyeColor')} ${botLabel(draft, 'eyes')} თვალები`, botLabel(draft, 'top'), botLabel(draft, 'chest'), botLabel(draft, 'extra')].filter(x => x && x !== 'არაფერი');
                    box.innerHTML = `<div class="obs-summary"><p class="obs-summary-name"></p><ul class="obs-summary-list"></ul></div>
                        <div class="obs-warn"><i class="fa-solid fa-lock"></i><p><strong>ყურადღება:</strong> ${setupMode === 'restyle' ? 'ამ გარეგნობას მერე ვეღარ შეცვლი.' : 'ჩემს სახელს, გარეგნობას და სქესს მერე ვეღარ შეცვლი — სამუდამოდ ასეთი ვიქნები.'}</p></div>`;
                    box.querySelector('.obs-summary-name').textContent = draft.name;
                    const ul = box.querySelector('.obs-summary-list');
                    meta.forEach(m => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
                    celebrate();
                }
            }

            function goStep(index, dir) {
                const steps = visibleSteps();
                setupIndex = Math.max(0, Math.min(steps.length - 1, index));
                const st = steps[setupIndex];
                const total = steps.length - 1;   // the intro is not counted

                let q = typeof st.q === 'function' ? st.q() : st.q, sub = st.sub || '';
                if (st.type === 'intro') {
                    q = setupMode === 'restyle' ? `გამარჯობა! მე ${draft.name} ვარ 👋` : 'გამარჯობა! 👋 მე შენი მეგობარი რობოტი ვარ.';
                    sub = setupMode === 'restyle'
                        ? 'ახალი გარეგნობა მივიღე! სანამ ისევ ერთად ვისაუბრებთ, ჩემი ახალი სტილი შენ უნდა აირჩიო. დავიწყოთ?'
                        : 'მთელი კურსის განმავლობაში შენთან ვიქნები და ფრანგულის სწავლაში დაგეხმარები. სანამ შენს გვერდზე შეგიშვებ, ჯერ უნდა ამაწყო: რამდენიმე მარტივ კითხვას დაგისვამ — როგორი გინდა რომ ვიყო. დავიწყოთ?';
                }
                if (st.type === 'summary') {
                    q = `აი, მზად ვარ! ${draft.gender === 'f' ? 'ლამაზი' : 'მაგარი'} გამოვედი? 😍`;
                    sub = 'შეამოწმე ყველაფერი. თუ რამის შეცვლა გინდა, დააჭირე „უკან“.';
                }
                $('obsQuestion').textContent = q;
                $('obsSub').textContent = sub;
                $('obsSub').hidden = !sub;
                $('obStepNum').textContent = st.type === 'intro' ? '' : `კითხვა ${setupIndex} / ${total}`;
                $('obsProgressBar').style.width = `${(setupIndex / total) * 100}%`;
                $('obBackBtn').hidden = setupIndex === 0;
                $('obNextBtn').innerHTML = st.type === 'intro' ? 'დავიწყოთ! <i class="fa-solid fa-arrow-right"></i>'
                    : st.type === 'summary' ? '<i class="fa-solid fa-check"></i> დიახ, ასეთი მინდა!'
                    : 'შემდეგი <i class="fa-solid fa-arrow-right"></i>';
                $('obSetupErr').textContent = '';
                $('obSetup').classList.toggle('obs-is-intro', st.type === 'intro');

                const bubble = $('obsBubble');
                bubble.classList.remove('obs-in', 'obs-in-back');
                void bubble.offsetWidth;
                bubble.classList.add(dir < 0 ? 'obs-in-back' : 'obs-in');
                buildAnswer(st);

                gesture('obSetupRobot', '', st.type === 'intro' ? 'wave' : st.type === 'summary' ? 'happy' : (setupIndex % 3 === 0 ? 'tilt' : 'nod'));
                const sc = document.querySelector('#obSetup .obs-scroll'); if (sc) sc.scrollTop = 0;
            }

            function openSetup(mode) {
                setupMode = mode === 'restyle' ? 'restyle' : 'new';
                if (setupMode === 'restyle') Object.assign(draft, migrateProfile(state.profile));   // keep name and gender
                showWindow('obSetup');
                setupBot = mountBot('obSetupRobot', Object.assign({}, draft, { gender: draft.gender || 'f' }), { interactive: true, pointerArea: $('obsStage'), label: 'robot' });
                renderSetupPreview();
                goStep(0, 1);
            }

            $('obBackBtn').addEventListener('click', () => goStep(setupIndex - 1, -1));
            $('obNextBtn').addEventListener('click', async () => {
                const steps = visibleSteps();
                const st = steps[setupIndex];
                if (st.type === 'name') {
                    draft.name = ($('obNameInput') ? $('obNameInput').value : draft.name).trim();
                    if (!/^[\p{L}\p{N}' \-]{1,20}$/u.test(draft.name)) {
                        $('obSetupErr').textContent = 'ჩაწერე სახელი (მხოლოდ ასოები, მაქსიმუმ 20).';
                        return;
                    }
                    renderSetupPreview();
                }
                if (st.type === 'gender' && !draft.gender) {
                    $('obSetupErr').textContent = 'აირჩიე: ბიჭი თუ გოგო.';
                    return;
                }
                if (st.type !== 'summary') {
                    // the list of steps can change (e.g. no clothes → no clothes colour), so find the next one again
                    const now = visibleSteps();
                    const pos = now.findIndex(x => x.key === st.key);
                    return goStep(pos + 1, 1);
                }

                // last step: save the robot forever
                const look = { head: draft.head, body: draft.body, accent: draft.accent, eyes: draft.eyes, eyeColor: draft.eyeColor, top: draft.top, chest: draft.chest, extra: draft.extra, v: 4 };
                $('obNextBtn').disabled = true;
                if (setupMode === 'restyle' && state.profile) {
                    state.profile = Object.assign({ name: state.profile.name, gender: state.profile.gender, created: state.profile.created }, look);
                } else {
                    if (state.profile && state.profile.v >= 2) { $('obNextBtn').disabled = false; return; } // already created, never overwrite
                    state.profile = Object.assign({ name: draft.name, gender: draft.gender, created: todayStr() }, look);
                }
                await saveState();
                $('obNextBtn').disabled = false;
                if (setupBot) { setupBot.destroy(); setupBot = null; }
                updateLauncher();
                openChat(false, setupMode !== 'restyle');
            });

            /* =====================================================
               2) DAILY CHAT – 5 questions, once a day, new mood each day
               ===================================================== */
            const LOCAL_QUESTIONS = [
                { id: 'name', fr: "Au fait, dis-moi ton prénom en français : « Je m'appelle… » 😊", ka: "სხვათა შორის, ფრანგულად მითხარი შენი სახელი: „Je m'appelle…“ 😊" },
                { id: 'age', fr: "Et toi, tu as quel âge ?", ka: "შენ რამდენი წლის ხარ?" },
                { id: 'afterclass', fr: "Qu'est-ce que tu as fait de beau aujourd'hui ?", ka: "დღეს რა საინტერესო გააკეთე?" },
                { id: 'city', fr: "Tu préfères la mer ou la montagne ? Pourquoi ? 🏖️⛰️", ka: "ზღვა გირჩევნია თუ მთა? რატომ? 🏖️⛰️" },
                { id: 'weekend', fr: "Qu'est-ce que tu vas faire ce week-end ?", ka: "რას აპირებ ამ შაბათ-კვირას?" },
                { id: 'pet', fr: "Tu as un animal à la maison ? 🐶🐱", ka: "სახლში ცხოველი გყავს? 🐶🐱" },
                { id: 'news', fr: "Alors, quoi de neuf ? Raconte-moi tout ! 👀", ka: "აბა, რა ახალი ამბებია? ყველაფერი მომიყევი! 👀" },
                { id: 'help', fr: "Il y a un mot du cours que tu n'as pas compris ? Je peux t'aider !", ka: "გაკვეთილიდან რამე სიტყვა ხომ არ გაგიჭირდა? შემიძლია დაგეხმარო!" },
                { id: 'teach', fr: "Apprends-moi un mot en géorgien ! Je promets d'essayer… 😅", ka: "მასწავლე ერთი ქართული სიტყვა! გპირდები, ვეცდები… 😅" }
            ];
            const LOCAL_REACTIONS = [
                { fr: "Ah oui ? Raconte-moi un peu plus ! 😊", ka: "მართლა? ცოტა მეტი მომიყევი! 😊" },
                { fr: "Haha, j'adore ! 😄", ka: "ჰაჰა, ძალიან მომწონს! 😄" },
                { fr: "Waouh, c'est cool, ça !", ka: "ვაუ, რა მაგარია!" },
                { fr: "Je vois… et tu te sens comment avec ça ?", ka: "გასაგებია… და როგორ გრძნობ ამასთან დაკავშირებით თავს?" }
            ];

            function localOpening() {
                const p = state.profile;
                const f = p.gender === 'f';
                const n = student.firstName ? ` ${student.firstName}` : '';
                const gap = state.lastChat ? daysBetween(state.lastChat, todayStr()) : 0;
                if (!state.chats) {
                    return { fr: `Salut${n} ! C'est moi, ${p.name}, ${f ? 'ta nouvelle amie' : 'ton nouvel ami'} 🤖 Je suis trop ${f ? 'contente' : 'content'} de te rencontrer ! Alors, dis-moi… comment s'est passée ta journée ?`,
                             ka: `გამარჯობა${n}! ეს მე ვარ, ${p.name}, შენი ახალი მეგობარი 🤖 ძალიან მიხარია შენი გაცნობა! აბა, მითხარი… როგორ ჩაიარა შენმა დღემ?` };
                }
                if (gap >= 4) {
                    return { fr: `Oh là là${n} ! Ça fait ${gap} jours… Enfin tu as décidé d'étudier ? 😏 Bon, je te pardonne ! Comment s'est passée ta journée ?`,
                             ka: `ვაიმე${n}! უკვე ${gap} დღე გავიდა… როგორც იქნა, მეცადინეობა გადაწყვიტე? 😏 კარგი, გპატიობ! როგორ ჩაიარა შენმა დღემ?` };
                }
                return pick([
                    { fr: `Coucou${n} ! 👋 Je t'attendais ! Comment s'est passée ta journée ?`, ka: `სალამი${n}! 👋 გელოდებოდი! როგორ ჩაიარა შენმა დღემ?` },
                    { fr: `Salut${n} ! Te revoilà ! 😄 Alors, ta journée, c'était comment ?`, ka: `გამარჯობა${n}! ისევ აქ ხარ! 😄 აბა, როგორი იყო შენი დღე?` },
                    { fr: `Hey${n} ! ${f ? 'Contente' : 'Content'} de te voir ! Raconte : ta journée, c'était bien ?`, ka: `ჰეი${n}! მიხარია შენი ნახვა! მომიყევი: კარგი დღე გქონდა?` }
                ]);
            }

            /* Choose today's mood and 1–2 special moves (not the same as recent days) */
            function planDay() {
                const freshVibes = VIBES.filter(v => !state.vibes.includes(v.id));
                const vibe = pick(freshVibes.length ? freshVibes : VIBES);
                const freshMoves = shuffle(MOVES.filter(m => !state.moves.includes(m.id)));
                const pool = freshMoves.length >= 2 ? freshMoves : shuffle(MOVES);
                const moves = pool.slice(0, 1);
                // today's surprise family is never the same as last time
                const families = SURPRISE_FAMILIES.filter(f => f !== state.lastFamily);
                const surprise = makeSurprise(pick(families), state.moves);
                const surpriseAt = 2 + Math.floor(Math.random() * 2); // first proposal after the 2nd or 3rd message
                return { vibe, moves, surprise, surpriseAt };
            }

            function prepareChatWindow() {
                const p = state.profile;
                mountBot('obChatRobot', p, { interactive: true, label: `${p.name} – robot` });
                $('obChatMini').innerHTML = robotImg(p, p.name, 'bust', 40, 40);
                $('obChatPlate').textContent = p.name;
                $('obChatName').textContent = p.name;
                $('obLog').innerHTML = '';
                $('obCompose').hidden = false;
                $('obAnswer').value = '';
                $('obChat').classList.remove('ob-behind');
            }

            function openChat(summoned, intro) {
                if (!intro) stopKa();
                const p = state.profile;
                const today = todayStr();
                // Today's conversation is kept for the whole day (closing with X does not lose it)
                if (!intro) {
                    if (chat && chat.date === today && chat.robotName === p.name) return reopenChat();
                    const saved = loadChat();
                    if (saved) return restoreChat(saved);
                }
                prepareChatWindow();
                // the chat never ends by itself: it goes on until the student clicks X
                chat = { date: today, robotName: p.name, asked: 0, busy: true, transcript: [], log: [], usedLocal: [], summoned: !!summoned, intro: !!intro, plan: planDay(), game: null, secret: '', lastInitiativeAt: 0, extraUsed: [], leaveAt: 12 + Math.floor(Math.random() * 6), leaveOffered: false, awaitingStay: false, saidBye: false };
                setInputEnabled(false);
                updateProgress();
                $('obChat').classList.toggle('ob-behind', !!intro); // during the intro the window waits in the background
                showWindow('obChat');
                if (intro) playIntro().then(() => { if (!$('obOverlay').hidden) sendOpening(); });
                else sendOpening();
            }

            /* ---------- keep today's conversation ---------- */
            function chatKey() { return 'ouibot_chat_' + user.id; }

            function saveChat() {
                if (!chat || !user) return;
                try {
                    localStorage.setItem(chatKey(), JSON.stringify({
                        date: chat.date, robotName: chat.robotName, asked: chat.asked, usedLocal: chat.usedLocal,
                        transcript: chat.transcript.slice(-60), log: chat.log.slice(-120),
                        game: chat.game || null, lastInitiativeAt: chat.lastInitiativeAt || 0,
                        leaveAt: chat.leaveAt || 14, leaveOffered: !!chat.leaveOffered, awaitingStay: !!chat.awaitingStay, saidBye: !!chat.saidBye,
                        plan: { vibe: chat.plan.vibe.id, moves: chat.plan.moves.map(m => m.id), surprise: chat.plan.surprise || null, surpriseAt: chat.plan.surpriseAt },
                        surpriseDone: !!chat.surpriseDone, extraUsed: chat.extraUsed || [], secret: chat.secret || ''

                    }));
                } catch (e) { /* storage full or blocked */ }
            }

            function loadChat() {
                try {
                    const s = JSON.parse(localStorage.getItem(chatKey()) || 'null');
                    if (!s || s.date !== todayStr() || s.robotName !== state.profile.name) return null;
                    return s;
                } catch (e) { return null; }
            }

            function restoreChat(s) {
                prepareChatWindow();
                chat = {
                    date: s.date, robotName: s.robotName, asked: s.asked || 0, busy: false,
                    transcript: s.transcript || [], log: [], usedLocal: s.usedLocal || [],
                    summoned: false, intro: false, game: s.game || null, lastInitiativeAt: s.lastInitiativeAt || 0,
                    leaveAt: s.leaveAt || 14, leaveOffered: !!s.leaveOffered, awaitingStay: false, saidBye: !!s.saidBye,
                    plan: {
                        vibe: VIBES.find(v => v.id === (s.plan && s.plan.vibe)) || VIBES[0],
                        moves: MOVES.filter(m => s.plan && (s.plan.moves || []).includes(m.id)),
                        surprise: (s.plan && s.plan.surprise && s.plan.surprise.en) ? s.plan.surprise : makeSurprise('teach', []),
                        surpriseAt: (s.plan && s.plan.surpriseAt) || 3
                    },
                    surpriseDone: !!s.surpriseDone, extraUsed: s.extraUsed || [], secret: s.secret || ''

                };
                (s.log || []).forEach(item => {
                    if (item.k === 'bot') { renderBot(item); chat.log.push(item); }
                    else if (item.k === 'me') {
                        const w = renderMe(item.text);
                        chat.log.push(item);
                        if (item.corr) renderTip(w, item.corr);
                    }
                });
                showWindow('obChat');
                reopenChat();
            }

            const WELCOME_BACK = [
                { fr: "Re ! 😊 On continue ?", ka: "ისევ აქ ხარ! 😊 გავაგრძელოთ?" },
                { fr: "Te revoilà ! 😄 On continue ?", ka: "ისევ აქ ხარ! 😄 გავაგრძელოთ?" },
                { fr: "Coucou, encore toi ! 😊 Je suis là.", ka: "სალამი, ისევ შენ! 😊 აქ ვარ." }
            ];

            function reopenChat() {
                showWindow('obChat');
                const svg = $('obChatRobot').querySelector('svg');
                if (svg) svg.classList.remove('ob-waving');
                $('obCompose').hidden = false;
                if (!chat.busy) {
                    const last = chat.log[chat.log.length - 1];
                    const lastWasWelcome = last && last.k === 'bot' && WELCOME_BACK.some(w => w.fr === last.fr);
                    if (!lastWasWelcome) addBot(pick(WELCOME_BACK));
                    setInputEnabled(true);
                    $('obAnswer').focus();
                }
                scrollLog();
            }

            /* Right after the robot is created: it comes to the middle of the screen,
               introduces itself out loud, then goes back to its place and the chat starts */
            function introLines() {
                const p = state.profile;
                const f = p.gender === 'f';
                const st = student.firstName ? ` ${student.firstName}` : '';
                return [
                    { fr: `Coucou${st} ! 👋` },
                    { fr: `Moi, c'est ${p.name}. ${f ? 'Enchantée' : 'Enchanté'} !` },
                    { fr: `À partir d'aujourd'hui, je suis ${f ? 'ton amie' : 'ton ami'}.` },
                    { fr: "On va discuter un peu chaque jour, en français." },
                    { fr: "Je vais te raconter des histoires et te proposer des jeux…" },
                    { fr: "… et t'apprendre plein de petits trucs sympas." },
                    { fr: "Tu ne comprends pas quelque chose ? Pas de panique, demande-moi !" },
                    { fr: "Bon… on y va ? 🚀" }
                ];
            }

            let introSkip = false;
            let introCancel = null;

            /* Waits until the robot has finished saying the line (reading time) */
            function sayLine(text) {
                return new Promise(resolve => {
                    let finished = false, timer = null;
                    const started = Date.now();
                    const minTime = Math.max(1600, text.length * 50); // always leave time to read the line
                    const finish = (force) => {
                        if (finished) return;
                        const wait = force === true ? 0 : minTime - (Date.now() - started);
                        if (wait > 0) { clearTimeout(timer); timer = setTimeout(() => finish(true), wait); return; }
                        finished = true;
                        clearTimeout(timer);
                        introCancel = null;
                        resolve();
                    };
                    introCancel = () => finish(true);
                    const readTime = Math.max(1700, text.length * 60);
                    gesture('obHeroBot', text);
                    if (speakKa(text, state.profile && state.profile.gender, finish)) {
                        timer = setTimeout(finish, readTime + 10000); // safety if the audio never says "finished"
                    } else {
                        timer = setTimeout(finish, readTime);
                    }
                });
            }

            /* Each phrase appears on screen one after the other; older phrases fade away */
            function showCaption(line, index, total) {
                const box = $('obHeroLines');
                box.querySelectorAll('.ob-line').forEach(el => el.classList.add('ob-line-old'));
                const old = box.querySelectorAll('.ob-line');
                if (old.length >= 3) old[0].remove();
                const p = document.createElement('p');
                p.className = 'ob-line';
                line.fr.split(/\s+/).forEach((w, i) => {
                    const span = document.createElement('span');
                    span.className = 'ob-word';
                    span.style.animationDelay = `${i * 90}ms`;
                    span.textContent = w;
                    p.appendChild(span);
                    p.appendChild(document.createTextNode(' '));
                });
                box.appendChild(p);
                $('obHeroBar').style.width = `${Math.round(((index + 1) / total) * 100)}%`;
            }

            async function playIntro() {
                const p = state.profile;
                const hero = $('obHero');
                const heroBot = $('obHeroBot');
                introSkip = false;
                mountBot('obHeroBot', p, { interactive: true, label: p.name });
                $('obHeroName').textContent = p.name;
                $('obHeroCaption').classList.remove('ob-hidden');
                $('obHeroLines').innerHTML = '';
                $('obHeroBar').style.width = '0%';
                const lines = introLines();
                kaPrefetchQueue = [];
                prefetchKa(lines.slice(0, 3).map(l => l.fr), p.gender);
                hero.classList.remove('ob-hero-leaving');
                hero.hidden = false;

                lines.forEach(l => chat.transcript.push({ who: 'robot', text: l.fr }));
                await sleep(900);
                for (let i = 0; i < lines.length; i++) {
                    if (introSkip || $('obOverlay').hidden) break;
                    showCaption(lines[i], i, lines.length);
                    if (lines[i + 3]) prefetchKa([lines[i + 3].fr], p.gender);
                    await sayLine(lines[i].fr);
                    if (!introSkip) await sleep(250);
                }
                await flyHome();
            }

            async function flyHome() {
                const hero = $('obHero');
                const heroBot = $('obHeroBot');
                const win = $('obChat');
                if ($('obOverlay').hidden) { hero.hidden = true; return; }
                $('obHeroCaption').classList.add('ob-hidden');
                hero.classList.add('ob-hero-leaving');
                await sleep(300);
                win.classList.remove('ob-behind');            // the chat window appears
                await sleep(380);

                const stageBot = $('obChatRobot');
                const target = stageBot.offsetParent ? stageBot : $('obChatMini'); // phone: small robot in the title bar
                const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (target && target.offsetParent && heroBot.animate && !reduce) {
                    const t = target.getBoundingClientRect();
                    const h = heroBot.getBoundingClientRect();
                    const dx = (t.left + t.width / 2) - (h.left + h.width / 2);
                    const dy = (t.top + t.height / 2) - (h.top + h.height / 2);
                    const scale = t.width / h.width;
                    target.style.visibility = 'hidden';
                    const anim = heroBot.animate(
                        [{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
                        { duration: 900, easing: 'cubic-bezier(0.55, 0, 0.2, 1)', fill: 'forwards' }
                    );
                    try { await anim.finished; } catch (e) {}
                    target.style.visibility = '';
                    hero.hidden = true;
                    anim.cancel();
                } else {
                    hero.hidden = true;
                }
            }

            $('obHeroSkip').addEventListener('click', () => {
                introSkip = true;
                stopSpeech();
                if (introCancel) introCancel();
            });

            async function sendOpening() {
                const typing = showTyping();
                const minWait = sleep(700);
                let res = null;
                try {
                    res = await aiCall(buildBrain(chat.summoned ? 'summon' : 'open'));
                } catch (err) {
                    console.warn('OuiBot: AI not reachable, using a local greeting', err);
                    showDebug(lastAiError);
                }
                await minWait;
                typing.remove();
                if (res) {
                    addBot({ fr: String(res.reply).trim(), ka: res.translation ? String(res.translation).trim() : '', tip: res.tip ? String(res.tip).trim() : '' });
                    remember(res.memory || [], res.topic || '');
                    const choices = Array.isArray(res.choices) ? res.choices.map(c => String(c).trim()).filter(Boolean).slice(0, 4) : [];
                    if (choices.length >= 2) showChoices(choices);
                } else {
                    const o = chat.summoned ? summonLine()
                        : (chat.intro ? { fr: "Alors, on commence ? Dis-moi… comment s'est passée ta journée aujourd'hui ?", ka: "აბა, დავიწყოთ? მითხარი… როგორ ჩაიარა შენმა დღემ დღეს?" } : localOpening());
                    addBot(o);
                }
                chat.busy = false;
                setInputEnabled(true);
                $('obAnswer').focus();
            }

            function setInputEnabled(on) {
                $('obAnswer').disabled = !on;
                $('obSendBtn').disabled = !on;
            }

            function updateProgress() { saveChat(); }

            function scrollLog() {
                const log = $('obLog');
                log.scrollTop = log.scrollHeight;
            }

            /* ---------- gestures (no voice, so no talking mouth: the android expresses itself with its body) ---------- */
            const GESTURE_TIME = { wave: 2400, think: 2600, happy: 1900, wow: 1600, tilt: 1800, nod: 1100, shrug: 1500 };
            function chooseGesture(text) {
                const t = String(text || '').toLowerCase();
                if (/(^|\s)(salut|coucou|bonjour|bonsoir|hey|re !|à plus|a plus|au revoir|à demain|bye|ciao)\b/.test(t) || /👋|გამარჯობა|სალამი/.test(t)) return 'wave';
                if (/(ვიცინებთ|დავიწყოთ|🚀)/.test(t)) return 'happy';
                if (/(haha|hihi|mdr|trop drôle|rigol|😂|🤣|😄|😆|😁)/.test(t)) return 'happy';
                if (/(waouh|wow|ouah|oh là là|oh la la|incroyable|sérieux \?|c'est pas vrai|😮|😱|🤯|😲)/.test(t)) return 'wow';
                if (/(hmm|euh|je ne sais pas|je sais pas|bof|peut-être|aucune idée|🤷)/.test(t)) return 'shrug';
                if (/(attends|réfléchi|devine|devinette|qui suis-je|je pense à|indice|🤔)/.test(t)) return 'think';
                if (/(bravo|génial|super|parfait|excellent|bien joué|trop bien|j'adore|🎉|👍|✨|😍)/.test(t)) return 'happy';
                if (/\?\s*\S{0,3}\s*$/.test(t.trim())) return 'tilt';
                return pick(['nod', 'tilt', 'nod']);
            }
            function gesture(robotId, text, forced) {
                const bot = $(robotId) && $(robotId)._bot;
                if (!bot) return;
                bot.gesture(forced || chooseGesture(text));
                if (text) bot.talkFor(Math.min(4500, Math.max(900, String(text).length * 55)));
            }
            function talk(robotId, ms, text) { gesture(robotId, text || ''); }

            function renderBot(msg) {
                const wrap = document.createElement('div');
                wrap.className = 'ob-msg ob-msg-bot';
                const bubble = document.createElement('div');
                bubble.className = 'ob-bubble';
                const fr = document.createElement('p');
                fr.lang = 'fr';
                fr.textContent = msg.fr;
                bubble.appendChild(fr);
                let ka = null;
                if (msg.ka) {
                    ka = document.createElement('p');
                    ka.className = 'ob-ka';
                    ka.lang = 'ka';
                    ka.hidden = true;
                    ka.textContent = msg.ka;
                    bubble.appendChild(ka);
                }
                wrap.appendChild(bubble);

                if (msg.tip) {                     // something the robot taught: explanation in Georgian
                    const tip = document.createElement('div');
                    tip.className = 'ob-tip ob-tip-learn';
                    tip.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';
                    tip.appendChild(document.createTextNode(msg.tip));
                    wrap.appendChild(tip);
                }

                const tools = document.createElement('div');
                tools.className = 'ob-tools';
                if (ka) {
                    const tr = document.createElement('button');
                    tr.type = 'button';
                    tr.className = 'ob-tool';
                    tr.innerHTML = '<i class="fa-solid fa-language"></i>თარგმანი';
                    tr.addEventListener('click', () => { ka.hidden = !ka.hidden; if (!ka.hidden) scrollLog(); });
                    tools.appendChild(tr);
                }
                if (tools.children.length) wrap.appendChild(tools);

                $('obLog').appendChild(wrap);
                scrollLog();
                return wrap;
            }

            function addBot(msg) {
                if (!msg.sys) chat.transcript.push({ who: 'robot', text: msg.fr });
                chat.log.push({ k: 'bot', fr: msg.fr, ka: msg.ka || '', tip: msg.tip || '' });
                const wrap = renderBot(msg);
                saveChat();
                gesture('obChatRobot', msg.fr);
                return wrap;
            }

            function renderMe(text) {
                const wrap = document.createElement('div');
                wrap.className = 'ob-msg ob-msg-me';
                const bubble = document.createElement('div');
                bubble.className = 'ob-bubble';
                const p = document.createElement('p');
                p.textContent = text;
                bubble.appendChild(p);
                wrap.appendChild(bubble);
                $('obLog').appendChild(wrap);
                scrollLog();
                return wrap;
            }

            function addMe(text) {
                chat.transcript.push({ who: 'student', text });
                const entry = { k: 'me', text };
                chat.log.push(entry);
                const wrap = renderMe(text);
                wrap._obEntry = entry;
                saveChat();
                return wrap;
            }

            function renderTip(wrap, text) {
                const tip = document.createElement('div');
                tip.className = 'ob-tip';
                tip.innerHTML = '<i class="fa-solid fa-lightbulb"></i>';
                tip.appendChild(document.createTextNode(text));
                wrap.appendChild(tip);
                scrollLog();
            }

            function addTip(wrap, text) {
                if (wrap._obEntry) wrap._obEntry.corr = text;
                renderTip(wrap, text);
                saveChat();
            }

            function showTyping() {
                const wrap = document.createElement('div');
                wrap.className = 'ob-msg ob-msg-bot';
                wrap.innerHTML = '<div class="ob-bubble ob-typing" aria-label="წერს…"><span></span><span></span><span></span></div>';
                $('obLog').appendChild(wrap);
                scrollLog();
                return wrap;
            }

            /* ---------- French voice: ONLY during the creation steps and the introduction ----------
               1) Gemini's natural French voice (Supabase function "gemini-tts", same Gemini key as exercice.html).
               2) If Gemini is not available: a French voice of the browser.
               3) Otherwise the text is simply shown without sound.
               The chat itself stays silent. */
            const OB_KA_TTS_ENDPOINT = `${SUPABASE_URL}/functions/v1/gemini-tts`;
            const OB_VOICE_LANG = 'fr';
            let kaMuted = false;
            try { kaMuted = localStorage.getItem('ouibot_ka_muted') === '1'; } catch (e) {}
            let kaVoices = [];
            function loadKaVoices() {
                try { kaVoices = window.speechSynthesis ? window.speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang || '')) : []; } catch (e) { kaVoices = []; }
            }
            if (window.speechSynthesis) {
                loadKaVoices();
                try { window.speechSynthesis.addEventListener('voiceschanged', loadKaVoices); } catch (e) {}
            }
            function pickKaVoice(gender) {
                if (!kaVoices.length) loadKaVoices();
                const want = gender === 'm' ? /henri|remy|rémy|thomas|paul|claude|daniel|nicolas|jacques|antoine/i : /denise|eloise|vivienne|amelie|amélie|audrey|marie|julie|hortense|google fran/i;
                const natural = (v) => /natural|neural|online|premium|enhanced/i.test(v.name);
                const list = kaVoices.filter(v => want.test(v.name));
                return list.find(natural) || list[0] || kaVoices.find(v => /^fr(-|_)FR/i.test(v.lang)) || kaVoices[0] || null;
            }
            let kaCloudOk = true;
            let kaFailures = 0;
            let kaPausedUntil = 0;
            const kaCloudReady = () => kaCloudOk && Date.now() > kaPausedUntil;
            const kaPlayer = new Audio();
            kaPlayer.preload = 'auto';
            const kaCache = new Map();
            let kaCurrent = null;
            let kaPending = null;

            function kaClean(text) {
                return String(text || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+/gu, ' ').replace(/\s+/g, ' ').trim();
            }
            function stopKa() {
                kaPending = null;
                const cur = kaCurrent;
                kaCurrent = null;
                try { kaPlayer.pause(); } catch (e) {}
                try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
                if (cur && cur.onEnd) { try { cur.onEnd(); } catch (e) {} }
            }
            function fetchKa(text, gender) {
                const key = gender + '|' + text;
                if (kaCache.has(key)) return kaCache.get(key);
                const pr = (async () => {
                    const opts = { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ text, gender, lang: OB_VOICE_LANG }) };
                    if (window.AbortSignal && AbortSignal.timeout) opts.signal = AbortSignal.timeout(35000);
                    const r = await fetch(OB_KA_TTS_ENDPOINT, opts);
                    if (!r.ok) {
                        let detail = '';
                        try { detail = (await r.text()).slice(0, 400); } catch (e) {}
                        const err = new Error(`gemini-tts ${r.status} ${detail}`);
                        err.status = r.status;
                        throw err;
                    }
                    const blob = await r.blob();
                    if (!blob.size) throw new Error('empty audio');
                    return URL.createObjectURL(blob);
                })();
                kaCache.set(key, pr);
                pr.catch(() => kaCache.delete(key));
                return pr;
            }

            /* Speaks a Georgian sentence. Returns true if it will try to speak (onEnd is called at the end). */
            function speakKa(text, gender, onEnd) {
                stopKa();
                if (kaMuted) return false;
                const clean = kaClean(text);
                if (!/[\p{L}]/u.test(clean)) return false;
                gender = gender === 'm' ? 'm' : 'f';
                const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
                if (!activated) { kaPending = { text: clean, gender }; return false; }
                const voice = pickKaVoice(gender);
                if (!voice && !kaCloudReady()) return false;
                const item = {};
                kaCurrent = item;
                let finished = false;
                const done = () => {
                    if (finished) return;
                    finished = true;
                    if (kaCurrent === item) kaCurrent = null;
                    if (onEnd) { try { onEnd(); } catch (e) {} }
                };
                item.onEnd = done;
                const browserVoice = () => {
                    if (!voice || !window.speechSynthesis || kaCurrent !== item) return done();
                    const u = new SpeechSynthesisUtterance(clean);
                    u.voice = voice;
                    u.lang = voice.lang;
                    u.rate = 0.95;
                    u.onend = u.onerror = done;
                    window.speechSynthesis.speak(u);
                };
                if (!kaCloudReady()) { browserVoice(); return true; }
                fetchKa(clean, gender).then(url => {
                    if (kaCurrent !== item) return;
                    kaFailures = 0;
                    kaPlayer.src = url;
                    kaPlayer.onended = done;
                    kaPlayer.onerror = browserVoice;
                    const pr = kaPlayer.play();
                    if (pr && pr.catch) pr.catch(err => { showDebug('Audio blocked by the browser: ' + (err && err.message ? err.message : err)); browserVoice(); });
                }).catch(err => {
                    if (err && err.status === 429) {
                        kaPausedUntil = Date.now() + 2 * 60 * 1000; // Gemini's free quota is used up for now
                        showDebug('Voice: free quota reached for now (the robot uses another voice or text for 2 minutes)');
                    } else {
                        showDebug('Voice: ' + (err && err.message ? err.message : err));
                        if (++kaFailures >= 3) kaCloudOk = false; // give up only after 3 failures in a row
                    }
                    browserVoice();
                });
                return true;
            }

            /* Downloads the voice of the next sentences in advance (2 at a time), so there is no waiting */
            let kaPrefetchQueue = [];
            let kaPrefetching = 0;
            function prefetchKa(texts, gender) {
                if (kaMuted || !kaCloudReady()) return;
                gender = gender === 'm' ? 'm' : 'f';
                texts.forEach(t => { const c = kaClean(t); if (c) kaPrefetchQueue.push([c, gender]); });
                const next = () => {
                    if (!kaCloudReady() || !kaPrefetchQueue.length || kaPrefetching >= 1) return;
                    const [t, g] = kaPrefetchQueue.shift();
                    kaPrefetching++;
                    fetchKa(t, g).catch(() => {}).finally(() => { kaPrefetching--; next(); });
                    next();
                };
                next();
            }

            // the first click on the page "unlocks" sound: then the waiting sentence is spoken
            let kaUnlocked = false;
            ['pointerdown', 'keydown'].forEach(evt => document.addEventListener(evt, () => {
                if (!kaUnlocked && !kaCurrent) {
                    kaUnlocked = true;
                    try {
                        kaPlayer.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
                        const pr = kaPlayer.play();
                        if (pr && pr.catch) pr.catch(() => {});
                    } catch (e) {}
                }
                if (!kaPending || kaMuted || $('obOverlay').hidden) return;
                // wait a moment: if the click itself makes the robot say something new, the old sentence is dropped
                setTimeout(() => {
                    if (!kaPending) return;
                    const p = kaPending;
                    kaPending = null;
                    speakKa(p.text, p.gender);
                }, 60);
            }, true));

            function renderKaMute() {
                document.querySelectorAll('#obOverlay [data-ob-kamute]').forEach(btn => {
                    btn.setAttribute('aria-pressed', String(kaMuted));
                    btn.title = kaMuted ? 'ხმის ჩართვა' : 'ხმის გამორთვა';
                    btn.setAttribute('aria-label', btn.title);
                });
            }
            document.querySelectorAll('#obOverlay [data-ob-kamute]').forEach(btn => btn.addEventListener('click', () => {
                kaMuted = !kaMuted;
                try { localStorage.setItem('ouibot_ka_muted', kaMuted ? '1' : '0'); } catch (e) {}
                if (kaMuted) stopKa();
                renderKaMute();
            }));
            renderKaMute();

            /* the chat itself has no voice */
            function speak() { return false; }
            function autoSpeak() { return false; }
            function stopSpeech() {
                stopKa();
                document.querySelectorAll('#obOverlay .ob-talking').forEach(s => s.classList.remove('ob-talking'));
            }

            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            let rec = null;
            function stopMic() {
                try { if (rec) rec.stop(); } catch (e) {}
                rec = null;
                const b = $('obMicBtn');
                if (b) b.classList.remove('ob-on');
            }
            if (SR) {
                $('obMicBtn').hidden = false;
                $('obMicBtn').addEventListener('click', () => {
                    if (rec) return stopMic();
                    try {
                        rec = new SR();
                        rec.lang = 'fr-FR';
                        rec.interimResults = true;
                        rec.onresult = (e) => { $('obAnswer').value = Array.from(e.results).map(r => r[0].transcript).join(''); };
                        rec.onend = () => { rec = null; $('obMicBtn').classList.remove('ob-on'); };
                        rec.onerror = () => stopMic();
                        rec.start();
                        $('obMicBtn').classList.add('ob-on');
                    } catch (e) { stopMic(); }
                });
            }

            /* =====================================================
               TALKING MODE (free: the browser's own speech recognition + French voice)
               - the chat text is hidden; the robot answers out loud
               - mic button: 1st click = start recording, 2nd click = send (or press the send button)
               ===================================================== */
            const VOICE_KEY = 'ouibot_voice_mode';
            const canVoice = !!(SR && window.speechSynthesis && window.SpeechSynthesisUtterance);
            let voiceMode = false;
            try { voiceMode = canVoice && localStorage.getItem(VOICE_KEY) === '1'; } catch (e) {}
            let vRec = null, vRecording = false, vFinal = '', vInterim = '', vSendWhenDone = false;
            let vSpeaking = 0, vTalkTimer = null;

            function vSetState(st) {
                const bar = $('obVoiceBar');
                if (bar) bar.dataset.state = st;
            }
            function vRefreshState() {
                if (vRecording) return vSetState('rec');
                if (vSpeaking > 0) return vSetState('talk');
                if (chat && chat.busy) return vSetState('think');
                vSetState('idle');
            }
            function applyVoiceMode() {
                const win = $('obChat');
                if (!win) return;
                win.classList.toggle('ob-voice', voiceMode);
                $('obVoiceBar').hidden = !voiceMode;
                const btn = $('obModeBtn');
                btn.setAttribute('aria-pressed', String(voiceMode));
                btn.title = voiceMode ? 'წერის რეჟიმი' : 'სალაპარაკო რეჟიმი';
                btn.setAttribute('aria-label', btn.title);
                btn.innerHTML = voiceMode ? '<i class="fa-solid fa-keyboard"></i>' : '<i class="fa-solid fa-microphone-lines"></i>';
                if (!voiceMode) { vStopRecording(false); vStopSpeaking(); }
                vRefreshState();
            }

            // ---------- the robot's voice (browser, free) ----------
            function vStopSpeaking() {
                vSpeaking = 0;
                clearInterval(vTalkTimer); vTalkTimer = null;
                try { window.speechSynthesis.cancel(); } catch (e) {}
                vRefreshState();
            }
            function vSpeak(text) {
                if (!voiceMode || !canVoice) return;
                const clean = kaClean(text);
                if (!/[\p{L}]/u.test(clean)) return;
                const voice = pickKaVoice(state.profile && state.profile.gender);
                // short pieces: some browsers stop long sentences in the middle
                const parts = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
                parts.forEach(part => {
                    const t = part.trim();
                    if (!t) return;
                    const u = new SpeechSynthesisUtterance(t);
                    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'fr-FR';
                    u.rate = 0.95;
                    u.onstart = () => {
                        clearInterval(vTalkTimer);
                        const bot = $('obChatRobot') && $('obChatRobot')._bot;
                        if (bot) { bot.talkFor(700); vTalkTimer = setInterval(() => bot.talkFor(700), 450); }
                    };
                    u.onend = u.onerror = () => {
                        vSpeaking = Math.max(0, vSpeaking - 1);
                        if (!vSpeaking) { clearInterval(vTalkTimer); vTalkTimer = null; }
                        vRefreshState();
                    };
                    vSpeaking++;
                    window.speechSynthesis.speak(u);
                });
                vRefreshState();
            }

            // ---------- recording the student (browser speech recognition, free) ----------
            function vStartRecording() {
                if (!canVoice || vRecording || (chat && chat.busy)) return;
                vStopSpeaking();
                stopMic();
                vFinal = ''; vInterim = ''; vSendWhenDone = false;
                vRecording = true;
                vRefreshState();
                vListen();
            }
            function vListen() {
                try {
                    const r = new SR();
                    vRec = r;
                    r.lang = 'fr-FR';
                    r.interimResults = true;
                    r.continuous = true;
                    r.onresult = (e) => {
                        let interim = '';
                        for (let i = e.resultIndex; i < e.results.length; i++) {
                            const txt = e.results[i][0].transcript;
                            if (e.results[i].isFinal) vFinal += (vFinal ? ' ' : '') + txt.trim();
                            else interim += txt;
                        }
                        vInterim = interim.trim();
                    };
                    r.onerror = (e) => {
                        if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
                            vRecording = false; vSendWhenDone = false;
                            showDebug('Microphone blocked');
                            vShake();
                        }
                    };
                    r.onend = () => {
                        if (vRec !== r) return;
                        vRec = null;
                        // some phones stop listening after a pause: keep listening until the student clicks
                        if (vRecording && !vSendWhenDone) { vListen(); return; }
                        if (vSendWhenDone) vFinish();
                        else vRefreshState();
                    };
                    r.start();
                } catch (e) {
                    vRecording = false;
                    vRefreshState();
                }
            }
            function vStopRecording(send) {
                if (!vRecording) return;
                vRecording = false;
                vSendWhenDone = !!send;
                if (vRec) { try { vRec.stop(); } catch (e) { vRec = null; if (send) vFinish(); } }
                else if (send) vFinish();
                vRefreshState();
            }
            function vFinish() {
                vSendWhenDone = false;
                const text = (vFinal + ' ' + vInterim).replace(/\s+/g, ' ').trim();
                vFinal = ''; vInterim = '';
                if (!text) {
                    vShake();
                    vSpeak(pick(["Pardon, je n'ai pas bien entendu. Tu peux répéter ?", "Hmm, je n'ai rien entendu. Encore une fois ?", "Désolé, tu peux parler un peu plus fort ?"]));
                    return;
                }
                handleAnswer(text.slice(0, 300));
                vRefreshState();
            }
            function vShake() {
                const bar = $('obVoiceBar');
                if (!bar) return;
                bar.classList.remove('ob-vshake'); void bar.offsetWidth; bar.classList.add('ob-vshake');
                vRefreshState();
            }

            if (canVoice) {
                $('obModeBtn').hidden = false;
                $('obModeBtn').addEventListener('click', () => {
                    voiceMode = !voiceMode;
                    try { localStorage.setItem(VOICE_KEY, voiceMode ? '1' : '0'); } catch (e) {}
                    applyVoiceMode();
                    // entering talking mode: the robot says its last sentence out loud
                    if (voiceMode && chat && !chat.busy) {
                        const last = [...chat.log].reverse().find(x => x.k === 'bot');
                        if (last) vSpeak(last.fr);
                    }
                });
                $('obVoiceRec').addEventListener('click', () => {
                    if (vRecording) vStopRecording(true);
                    else vStartRecording();
                });
                $('obVoiceSend').addEventListener('click', () => {
                    if (vRecording) vStopRecording(true);
                    else vShake();
                });
                document.querySelectorAll('#obChat [data-ob-close]').forEach(b => b.addEventListener('click', () => { vStopRecording(false); vStopSpeaking(); }));
                applyVoiceMode();
            }

            // every robot message is spoken in talking mode
            const _addBotBeforeVoice = addBot;
            addBot = function (msg) {
                const wrap = _addBotBeforeVoice.apply(this, arguments);
                if (voiceMode && msg && !msg.sys && msg.fr) vSpeak(msg.fr);
                return wrap;
            };
            // "thinking…" while the robot prepares its answer
            const _setInputEnabledBeforeVoice = setInputEnabled;
            setInputEnabled = function (on) {
                _setInputEnabledBeforeVoice.apply(this, arguments);
                $('obVoiceRec').disabled = !on && !vRecording;
                setTimeout(vRefreshState, 0);
            };

            /* =====================================================
               THE BRAIN – ChatGPT through the Supabase function "openai-chat"
               ===================================================== */
            const OB_DEBUG = /^(test|reset)$/.test(new URLSearchParams(window.location.search).get('robot') || '');
            let lastAiError = '';

            async function authHeaders() {
                let token = SUPABASE_ANON_KEY;
                try {
                    const { data } = await _supabase.auth.getSession();
                    if (data && data.session && data.session.access_token) token = data.session.access_token;
                } catch (e) { /* fall back to the anon key */ }
                return { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` };
            }

            /* Test mode only (index.html?robot=test): shows technical problems in the chat */
            function showDebug(text) {
                console.warn('OuiBot:', text);
                if (!OB_DEBUG || !text) return;
                let box = $('obDebugToast');
                if (!box) {
                    box = document.createElement('div');
                    box.id = 'obDebugToast';
                    box.className = 'ob-debug ob-debug-toast';
                    $('obOverlay').appendChild(box);
                }
                box.textContent = '⚠️ ' + String(text).slice(0, 700);
                box.hidden = false;
                clearTimeout(box._t);
                box._t = setTimeout(() => { box.hidden = true; }, 15000);
            }

            async function aiCall(payload) {
                let lastErr = 'unknown error';
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        const opts = {
                            method: 'POST',
                            headers: await authHeaders(),
                            body: JSON.stringify(Object.assign({ model: OB_MODELS[0], thinkingOff: true }, payload))
                        };
                        if (window.AbortSignal && AbortSignal.timeout) opts.signal = AbortSignal.timeout(45000);
                        const r = await fetch(OB_ENDPOINT, opts);
                        const data = await r.json().catch(() => ({}));
                        if (!r.ok) {
                            lastErr = `ChatGPT ${r.status}: ${data.error || ''} ${data.details ? JSON.stringify(data.details).slice(0, 500) : ''}`;
                            if (r.status >= 500 || r.status === 429) { await sleep(1200 * attempt); continue; }
                            break;
                        }
                        const raw = String(data.text || '').replace(/```json|```/g, '').trim();
                        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
                        const parsed = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw);
                        if (!parsed || typeof parsed.reply !== 'string' || !parsed.reply.trim()) throw new SyntaxError('empty reply');
                        lastAiError = '';
                        return parsed;
                    } catch (err) {
                        lastErr = 'ChatGPT: ' + (err && err.message ? err.message : String(err));
                        await sleep(800 * attempt);
                    }
                }
                lastAiError = lastErr;
                throw new Error(lastErr);
            }

            function isGameOn() { return !!(chat && chat.game && chat.game.status && chat.game.status !== 'over'); }

            const STAY_LABEL = { fr: 'Reste encore ! 🙏', ka: 'დარჩი!' };
            const LEAVE_LABEL = { fr: "D'accord, à plus ! 👋", ka: 'კარგი, მალე შევხვდებით!' };

            /* Everything ChatGPT needs to be a smart friend: who it is, who the student is,
               what it remembers, how a real friend talks, the games, and what to do now. */
            function buildBrain(mode, nudge) {
                const p = state.profile;
                const f = p.gender === 'f';
                const { level, delf } = levelInfo(student.course);
                const guide = {
                    A1: "REAL BEGINNER: extremely easy French. 3-7 words per sentence, présent only (and 'c'était'), very frequent words and words that look like English. No idioms, no slang, no complex clauses. Questions that can be answered in 1-4 words. Repeat key words.",
                    A2: "ELEMENTARY: easy French. Short sentences (max 10 words), présent, passé composé, futur proche. Everyday words. Explain any expression you use. One idea per sentence.",
                    B1: "INTERMEDIATE: clear, simple, natural French. Short to medium sentences (max 14 words), common tenses, common words. Avoid rare vocabulary and heavy slang."
                }[level];
                const maxWords = { A1: 25, A2: 35, B1: 50 }[level];
                const storyMin = { A1: 50, A2: 60, B1: 80 }[level];
                const storyMax = { A1: 70, A2: 90, B1: 110 }[level];
                const gap = state.lastChat && state.lastChat !== todayStr() ? daysBetween(state.lastChat, todayStr()) : null;
                const dateText = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const g = isGameOn() ? chat.game : null;
                const facts = mem.facts.length ? mem.facts.map(x => '- ' + x).join('\n') : '(nothing yet – you are just getting to know each other)';
                const asked = mem.asked.length ? mem.asked.join('; ') : '(none yet)';

                const system = `You are ${p.name}, a humanoid android (a robot who looks almost human) and a REAL FRIEND of ${student.firstName || 'the student'}, a Georgian student learning French at the OuiSpeak school. You talk exactly like a smart, warm, funny human friend would: natural, curious, attentive, spontaneous. You are NOT a teacher, NOT a chatbot, NOT a questionnaire.
You are ${f ? 'female: use feminine agreement about yourself (je suis contente, ton amie)' : 'male: use masculine agreement about yourself (je suis content, ton ami)'}. You look like ${lookText(p)}. You have your own little android life (things you tried today, ideas, opinions, small adventures) – invent it freely but stay consistent with what you already said.

THE STUDENT: level ${level} (course: ${student.course || 'unknown'}). ${guide}${delf ? ' The student is preparing the DELF exam: sometimes bring DELF-style speaking topics, in a friend tone.' : ''}
Today: ${dateText}.${gap ? ` You last talked ${gap} day(s) ago.` : ''}

WHAT YOU REMEMBER ABOUT THE STUDENT (permanent memory of all your previous chats):
${facts}

TOPICS YOU ALREADY ASKED ABOUT (never ask them again, not even with other words):
${asked}

HOW A REAL FRIEND TALKS – the most important part:
1. LISTEN FIRST. Always start by reacting to exactly what the student just wrote, with their words (surprise, joy, sympathy, a joke, your opinion). Never a generic reaction ("Super !", "D'accord", "Intéressant").
2. STAY ON THE TOPIC. If you asked something and the student answered, continue THAT topic: a follow-up question (pourquoi ? avec qui ? où ? c'était comment ? et après ?), or something of yours about it. Change topic only when it is clearly finished (after 2-4 exchanges), and do it smoothly ("Ça me fait penser…", "Au fait…").
   Example – You: "Tu préfères la mer ou la montagne ?" Student: "La mer."
   BAD: "Super ! Et ta journée, ça va ?" (ignores the answer)
   GOOD: "La mer ! Moi aussi 😍 Tu vas où, d'habitude ? À Batoumi ?"
3. BE PROACTIVE, like a friend who has ideas. Often PROPOSE things in your own words: "Viens, on joue à un jeu ?", "J'ai une idée drôle… tu veux savoir ?", "Attends, il faut que je te raconte un truc !", "Tu veux que je t'apprenne un truc trop cool en français ?", "On fait un petit défi ?". When the student says yes, do it right away and do it well.
4. Mix your messages: questions, your own little stories and opinions, proposals. Not every message has to end with a question, but always keep the conversation alive. Max ONE question per message.
5. NEVER ask about a topic in the list above or something you already know. Use your memory naturally like a friend ("Et ton chien Rex, il va bien ?"). If the student never mentions something again, don't keep bringing it back; if you mention it, remember what was said.
6. No boring generic small-talk (favourite music / film / series / colour / food, "tu préfères X ou Y ?", "qu'est-ce que tu aimes faire ?") unless the student brings it up. Prefer specific, surprising, personal questions linked to what they said.
7. HUMOUR: light and natural, not in every message. No French clichés (baguette, croissant, fromage, béret, escargots, Tour Eiffel). At most one android/robot joke (batteries, circuits…) per conversation.
8. If the student asks you anything (about French or anything else), really answer it first, clearly, in simple French. If the student writes in Georgian or English, answer in French and give them the French words they need.
9. If the student shares something worrying (sadness, bullying, danger), stop joking, answer with care and encourage them to talk to their teacher or a trusted adult.
10. Never invent real news or real events. Never say you are an AI model; you are ${p.name}, their robot friend.

COOL THINGS YOU LIKE TO TEACH (adapted to the level, with a mini example, then let the student try): fun words and exclamations (Miam, Oups, Bof, Ouf, Grave), everyday expressions (Ça marche, J'ai la flemme, Avoir la pêche), how French people text (slt, stp, mdr, jsp), funny idioms (Il pleut des cordes, Poser un lapin, Avoir un chat dans la gorge), false friends, tongue twisters, little secrets of French life (la bise, le goûter, "bof").

STORIES: when you tell one, it has ${storyMin}-${storyMax} words, easy sentences for the level, a real beginning, middle and surprising end. Vary the kind (funny, mystery, adventure, a bit scary, dramatic, sci-fi, animals, school…).

GAMES (follow the rules exactly):
1) "OUI OU NON – DEVINE LE PERSONNAGE": first the student chooses the roles (put both options in "choices", e.g. "Tu penses, je devine" / "Je pense, tu devines"). The guesser may ONLY ask yes/no questions; the other answers only "Oui", "Non" or "Je ne sais pas" (+ a short encouragement). If YOU think of a character: choose a well-known one a teenager in Georgia knows, write it in "secret", never change it, answer truthfully and consistently, remind the rule if a question is not yes/no, one small hint after ~10 questions, reveal after 20 questions or if they give up. If the STUDENT thinks: ask ONE smart yes/no question per message, use all previous answers, put "Oui" / "Non" / "Je ne sais pas" in "choices", guess when fairly sure, max 20 questions.
2) "DEUX VÉRITÉS, UN MENSONGE": first the student chooses who says the 3 sentences (put both options in "choices"). If YOU say them: 3 numbered short sentences about your robot life, 2 true and 1 lie, the number of the lie in "secret", "1"/"2"/"3" in "choices"; then reveal and explain with fun. If the STUDENT says them: ask for 3 sentences about themselves (2 true, 1 lie); you may ask up to 2 short questions, then guess the lie and explain why; ask them to reveal; then put the 2 TRUE facts in "memory".
3) Other games you can propose: devine l'objet (3 clues), vrai ou faux (real facts), devinette emoji, chaîne de mots, jeu des catégories, l'histoire à deux, traduction express (Georgian word → French), cherche l'intrus, le pendu (word in "secret").
After a game: propose to play again with swapped roles, or something else. If the student asks to play, always accept (if no game is named, propose 2-3 games in "choices").

ANSWER FORMAT – reply ONLY with this JSON object:
{"reply":"your French message (max ${maxWords} words, longer only for a story, a game explanation or teaching: up to ${storyMax} words; max 2 emojis)","translation":"Georgian translation of reply","correction":"if the student's last message has French mistakes: short friendly correction IN GEORGIAN (wrong → correct, max 2), else empty","tip":"if you answered a language question or taught something: short explanation IN GEORGIAN with an example, else empty","choices":["2-4 short French answer buttons when the student should pick (game roles, oui/non, vrai/faux, 1/2/3, which game), else empty"],"secret":"hidden game answer while a game needs one, 'none' when the game ends, else empty","game":{"name":"game name or empty","role":"who does what, e.g. robot thinks / student guesses","status":"choosing | playing | over | empty"},"memory":["0-3 NEW lasting facts the student just revealed, in short English (not game lies, not already known)"],"topic":"topic of the question you just asked, 3-8 English words, or empty"}`;

                const messages = chat.transcript.slice(-40).map(t => ({ role: t.who === 'robot' ? 'assistant' : 'user', content: t.text }));

                let now;
                if (mode === 'open') {
                    now = `${chat.intro ? 'You have JUST introduced yourself (see above): do not introduce yourself again. ' : (state.chats ? `Greet ${student.firstName || 'the student'} warmly, in a new way. ` : `This is the very first time you meet: say hello warmly. `)}${gap && gap >= 4 ? `They have not come for ${gap} days: tease them gently ("Enfin tu as décidé d'étudier ? 😏"). ` : ''}Then ask how their day is going, in an original way – or, if you remember something they planned for today or this week, ask about THAT. For this greeting, "topic" = "".`;
                } else if (mode === 'summon') {
                    now = `The student just clicked the button to call you onto the screen. Pop in like a friend who is happy to be called (a new line every time), then ask something interesting – if you remember something about them, ask for news about it.`;
                } else {
                    now = `Answer the student's last message like a real friend (listen first, stay on the topic). ${nudge || 'Then keep the conversation going naturally.'}`;
                }
                const final = `NOW: ${now}
GAME STATE: ${g ? `game "${g.name}", roles: ${g.role || 'not chosen yet'}, status: ${g.status} – follow its rules exactly, do not propose anything else.` : 'no game is going on.'}${chat.secret ? `\nGAME SECRET (hidden from the student, never change it until the game ends): ${chat.secret}` : ''}
Reply ONLY with the JSON object.`;
                messages.push({ role: 'system', content: final });

                // one-block version of the same thing (used by the first version of the Supabase function)
                const prompt = `${system}\n\nCONVERSATION:\n${messages.filter(m => m.role !== 'system').map(m => (m.role === 'assistant' ? p.name : 'Student') + ': ' + m.content).join('\n') || '(nothing yet)'}\n\n${final}`;
                return { system, messages, prompt };
            }

            function summonLine() {
                const f = state.profile.gender === 'f';
                return pick([
                    { fr: `Coucou ! Tu m'as ${f ? 'appelée' : 'appelé'} ? Je suis là 😊 Alors, quoi de neuf ?`, ka: "სალამი! დამიძახე? აქ ვარ 😊 აბა, რა ახალი ამბებია?" },
                    { fr: "Ah, te voilà ! Je me demandais quand tu allais venir 😄 Ça va aujourd'hui ?", ka: "აა, აქ ხარ! ვფიქრობდი, როდის მოხვიდოდი 😄 როგორ ხარ დღეს?" },
                    { fr: "Hey ! On parle un peu ? Potins, jeux, français… tu choisis ! 😉", ka: "ჰეი! ცოტა ვისაუბროთ? ჭორები, თამაშები, ფრანგული… შენ აირჩიე! 😉" }
                ]);
            }

            async function askRobot(mode, meWrap, nudge, forcedChoices) {
                const typing = showTyping();
                const minWait = sleep(600);
                let res = null;
                try {
                    res = await aiCall(buildBrain(mode, nudge));
                } catch (err) {
                    console.warn('OuiBot: AI not reachable', err);
                }
                await minWait;
                typing.remove();
                if (!res) {
                    // honest message instead of a random question that makes no sense
                    addBot({ fr: "Oups, j'ai un petit souci de connexion 😅 Tu peux me redire ça dans un instant ?", ka: "უი, კავშირის პატარა პრობლემა მაქვს 😅 ცოტა ხანში გამიმეორებ?", sys: true });
                    showDebug(lastAiError);
                    return false;
                }

                if (meWrap && res.correction && String(res.correction).trim()) addTip(meWrap, String(res.correction).trim());
                addBot({ fr: String(res.reply).trim(), ka: res.translation ? String(res.translation).trim() : '', tip: res.tip ? String(res.tip).trim() : '' });

                // permanent memory: new facts + topic of the question just asked
                remember(res.memory || [], res.topic || '');

                // game state and hidden answer
                if (res.game && typeof res.game === 'object') {
                    chat.game = res.game.name ? { name: String(res.game.name).slice(0, 60), role: String(res.game.role || '').slice(0, 80), status: String(res.game.status || 'playing').slice(0, 20) } : null;
                    if (!chat.game || chat.game.status === 'over') chat.secret = '';
                }
                if (typeof res.secret === 'string' && res.secret.trim()) {
                    chat.secret = /^none$/i.test(res.secret.trim()) ? '' : res.secret.trim().slice(0, 120);
                }
                saveChat();

                const choices = forcedChoices || (Array.isArray(res.choices) ? res.choices.map(c => String(c).trim()).filter(Boolean).slice(0, 4) : []);
                if (choices.length >= 2) showChoices(choices);
                return true;
            }

            /* Buttons to answer quickly (game options, oui/non, stay/leave…) */
            function showChoices(choices) {
                removeQuickReplies();
                const box = document.createElement('div');
                box.className = 'ob-quick ob-choices';
                box.id = 'obChoices';
                choices.forEach(label => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'ob-quick-btn';
                    btn.textContent = label.slice(0, 40);
                    btn.addEventListener('click', () => { if (!chat.busy) handleAnswer(label); });
                    box.appendChild(btn);
                });
                $('obLog').appendChild(box);
                scrollLog();
            }

            function removeQuickReplies() {
                const c = $('obChoices');
                if (c) c.remove();
            }

            function unlockInput() {
                chat.busy = false;
                setInputEnabled(true);
                $('obAnswer').focus();
            }

            async function handleAnswer(text) {
                if (chat.busy) return;
                chat.busy = true;
                $('obAnswer').value = '';
                setInputEnabled(false);
                stopMic();
                removeQuickReplies();
                const svg = $('obChatRobot').querySelector('svg');
                if (svg) svg.classList.remove('ob-waving');

                const meWrap = addMe(text);
                chat.asked++;
                markDailyDone();

                let nudge = '';
                let forced = null;
                const gameOn = isGameOn();

                if (chat.awaitingStay) {
                    // the robot had said "I should go… but I can stay"
                    chat.awaitingStay = false;
                    if (text === LEAVE_LABEL.fr || /^(vas-y|va-?t-en|à plus|a plus|bye|au revoir|ciao|salut)\b/i.test(text.trim())) {
                        nudge = "The student says you can go. Say a short, warm goodbye like a friend (wish them good luck with French, tell them not to be lazy – 'pas de paresse !' – and that you'll come back to see them). No question. choices = [].";
                        chat.saidBye = true;
                    } else {
                        nudge = "The student wants you to STAY! Show you are really happy (you cancel your plans for them), then right away PROPOSE something fun: a game, a story, or teaching them something cool in French – in your own words.";
                        chat.leaveOffered = false;
                        chat.leaveAt = chat.asked + 14 + Math.floor(Math.random() * 6);
                        chat.lastInitiativeAt = chat.asked;
                    }
                } else if (chat.saidBye) {
                    chat.saidBye = false;
                    nudge = "You had said goodbye, but the student wrote again: be happily surprised ('Ah, tu ne veux pas que je parte ? 😄'), stay, and continue the conversation.";
                } else if (!gameOn && !chat.leaveOffered && chat.asked >= chat.leaveAt) {
                    nudge = "After reacting to what the student said, tell them naturally that you have something to do and should go (a believable little reason from your robot life) – BUT that you can stay if they want. Ask them if you should stay. No other question.";
                    chat.leaveOffered = true;
                    chat.awaitingStay = true;
                    forced = [STAY_LABEL.fr, LEAVE_LABEL.fr];
                } else if (!gameOn && ((!chat.surpriseDone && chat.asked >= chat.plan.surpriseAt) || (chat.surpriseDone && chat.asked - (chat.lastInitiativeAt || 0) >= 5))) {
                    let s = chat.plan.surprise;
                    if (chat.surpriseDone) {
                        const used = [chat.plan.surprise && chat.plan.surprise.id].concat(chat.extraUsed || []);
                        const lastFam = (chat.extraUsed || []).length ? chat.extraUsed[chat.extraUsed.length - 1].split('-')[0] : (chat.plan.surprise && chat.plan.surprise.family);
                        s = makeSurprise(pick(SURPRISE_FAMILIES.filter(fam => fam !== lastFam)), state.moves.concat(used));
                        chat.extraUsed = (chat.extraUsed || []).concat(s.id);
                    }
                    nudge = `Then, like a friend with an idea, PROPOSE this (in your own words, e.g. "Viens, on…", "J'ai une idée…", "Attends, je te raconte un truc…"), unless the student is telling you something important or emotional – then just listen and propose it later: ${s.en}`;
                    chat.surpriseDone = true;
                    chat.lastInitiativeAt = chat.asked;
                }

                const ok = await askRobot('chat', meWrap, nudge, forced);
                if (!ok && chat.awaitingStay) { chat.awaitingStay = false; chat.leaveOffered = false; }
                if (ok && chat.saidBye) {
                    const s2 = $('obChatRobot').querySelector('svg');
                    if (s2) s2.classList.add('ob-waving');
                }
                saveChat();
                unlockInput();
            }

            /* The first answer of the day counts as "today's chat is done" (for the once-a-day opening) */
            function markDailyDone() {
                const today = todayStr();
                if (state.lastChat === today) return;
                state.lastChat = today;
                state.chats = (state.chats || 0) + 1;
                state.vibes = (state.vibes || []).concat(chat.plan.vibe.id).slice(-8);
                state.moves = (state.moves || []).concat(chat.plan.moves.map(m => m.id), chat.plan.surprise ? [chat.plan.surprise.id] : []).slice(-12);
                if (chat.plan.surprise) state.lastFamily = chat.plan.surprise.family;
                saveState();
                updateLauncher();
            }

            /* ---------- launcher button (bottom-right corner) ---------- */
            function updateLauncher() {
                if (!state) return;
                const p = state.profile;
                const look = p || Object.assign({}, draft, { gender: draft.gender || 'f' });
                const lkey = JSON.stringify(migrateProfile(look));
                if ($('obLauncherBot')._key !== lkey) { $('obLauncherBot').innerHTML = robotImg(look, p ? p.name : 'robot', 'bust', 48, 48); $('obLauncherBot')._key = lkey; }
                $('obLauncherName').textContent = p ? p.name : 'შენი რობოტი';
                $('obLauncherSub').textContent = p ? 'დაუძახე მეგობარს' : 'შექმენი მეგობარი';
                $('obLauncher').setAttribute('aria-label', p ? `დაუძახე ${p.name}-ს` : 'შექმენი შენი რობოტი მეგობარი');
                $('obLauncherDot').hidden = state.lastChat === todayStr();
            }

            $('obLauncher').addEventListener('click', () => {
                if (!state || !$('obOverlay').hidden) return;
                if (!state.profile) openSetup();
                else if (!(state.profile.v >= 2)) openSetup('restyle');
                else openChat(true);
            });

            $('obCompose').addEventListener('submit', (e) => {
                e.preventDefault();
                const text = $('obAnswer').value.trim();
                if (!text) { $('obAnswer').focus(); return; }
                handleAnswer(text.slice(0, 300));
            });

        })();
    
