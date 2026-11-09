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

            /* ---------- appearance options (original humanoid android, girl or boy) ---------- */
            const SKINS = {
                porcelaine:  { c: '#f7e3d4', ka: 'ფაიფური', en: 'very fair' },
                claire:      { c: '#f1c8a4', ka: 'ღია', en: 'light' },
                doree:       { c: '#dfaa7e', ka: 'ოქროსფერი', en: 'golden' },
                mate:        { c: '#bd8258', ka: 'ხორბლისფერი', en: 'tan' },
                brune:       { c: '#8f5b3b', ka: 'მუქი', en: 'brown' },
                ebene:       { c: '#5c3824', ka: 'ძალიან მუქი', en: 'deep brown' },
                synthetique: { c: '#dde6f1', ka: 'სინთეტიკური', en: 'pale synthetic android' }
            };
            const HAIRS = {
                court:   { ka: 'მოკლე', en: 'short hair' },
                meche:   { ka: 'ჩოლკა', en: 'a swept fringe' },
                rase:    { ka: 'გადაპარსული', en: 'a buzz cut' },
                boucles: { ka: 'ხუჭუჭა', en: 'curly hair' },
                carre:   { ka: 'კარე', en: 'a bob cut' },
                longs:   { ka: 'გრძელი', en: 'long hair' },
                queue:   { ka: 'კუდი', en: 'a ponytail' },
                chignon: { ka: 'შეკრული', en: 'a bun' }
            };
            const HAIR_COLORS = {
                noir:    { c: '#211a16', ka: 'შავი', en: 'black' },
                brun:    { c: '#5a3a28', ka: 'წაბლისფერი', en: 'brown' },
                blond:   { c: '#e3bf74', ka: 'ქერა', en: 'blond' },
                roux:    { c: '#bf5530', ka: 'წითური', en: 'red' },
                platine: { c: '#e9e5dd', ka: 'პლატინისფერი', en: 'platinum' },
                bleu:    { c: '#3b82f6', ka: 'ლურჯი', en: 'blue' },
                rose:    { c: '#f472b6', ka: 'ვარდისფერი', en: 'pink' },
                violet:  { c: '#8b5cf6', ka: 'იისფერი', en: 'purple' }
            };
            const EYE_COLORS = {
                marron:   { c: '#6b3e26', ka: 'ყავისფერი', en: 'brown' },
                noisette: { c: '#9a6f37', ka: 'თხილისფერი', en: 'hazel' },
                vert:     { c: '#3f8f5a', ka: 'მწვანე', en: 'green' },
                bleu:     { c: '#3b7fd1', ka: 'ცისფერი', en: 'blue' },
                gris:     { c: '#7b8794', ka: 'ნაცრისფერი', en: 'grey' },
                cyan:     { c: '#22d3ee', ka: 'მანათობელი ცისფერი', en: 'glowing cyan', glow: true },
                violet:   { c: '#a78bfa', ka: 'მანათობელი იისფერი', en: 'glowing violet', glow: true }
            };
            /* Robotic body: shell colour, joint colour, chest light */
            const SHELLS = {
                blanc:    { c: '#f3f5f8', ka: 'თეთრი', en: 'glossy white' },
                argent:   { c: '#c7cdd6', ka: 'ვერცხლისფერი', en: 'silver' },
                perle:    { c: '#f2dde5', ka: 'მარგალიტისფერი', en: 'pearl pink' },
                glacier:  { c: '#d4e7f6', ka: 'ყინულისფერი', en: 'ice blue' },
                champagne:{ c: '#e9dcb8', ka: 'შამპანური', en: 'champagne gold' },
                graphite: { c: '#454c59', ka: 'გრაფიტი', en: 'graphite' },
                noir:     { c: '#1b1f27', ka: 'შავი', en: 'black' }
            };
            const JOINTS = {
                anthracite: { c: '#2d323c', ka: 'მუქი ნაცრისფერი', en: 'dark grey' },
                noir:       { c: '#0e1015', ka: 'შავი', en: 'black' },
                blanc:      { c: '#eef1f5', ka: 'თეთრი', en: 'white' },
                or:         { c: '#c9a24a', ka: 'ოქროსფერი', en: 'gold' },
                cyan:       { c: '#22d3ee', ka: 'მანათობელი ცისფერი', en: 'glowing cyan', glow: true },
                rose:       { c: '#f472b6', ka: 'მანათობელი ვარდისფერი', en: 'glowing pink', glow: true }
            };
            const EMBLEMS = {
                aucun:   { ka: 'არაფერი', en: '' },
                coeur:   { ka: 'მანათობელი გული', en: 'a glowing heart light on the chest' },
                anneau:  { ka: 'ენერგიის რგოლი', en: 'a glowing energy ring on the chest' },
                drapeau: { ka: 'საფრანგეთის დროშა', en: 'a small French flag on the chest' },
                etoile:  { ka: 'ვარსკვლავი', en: 'a glowing star on the chest' }
            };
            /* Clothes worn over the robotic body (optional) */
            const OUTFITS = {
                aucun:   { ka: 'არაფერი', en: '' },
                veste:   { ka: 'ქურთუკი', en: 'an open jacket' },
                sweat:   { ka: 'ჰუდი', en: 'an open hoodie' },
                blazer:  { ka: 'პიჯაკი', en: 'a smart blazer' },
                echarpe: { ka: 'შარფი', en: 'a scarf' },
                gilet:   { ka: 'ჟილეტი', en: 'a light vest' }
            };
            const OUTFIT_COLORS = {
                bleu:   { c: '#2563eb', ka: 'ლურჯი', en: 'blue' },
                rouge:  { c: '#e11d48', ka: 'წითელი', en: 'red' },
                vert:   { c: '#16a34a', ka: 'მწვანე', en: 'green' },
                noir:   { c: '#1f2937', ka: 'შავი', en: 'black' },
                blanc:  { c: '#f1f5f9', ka: 'თეთრი', en: 'white' },
                jaune:  { c: '#f59e0b', ka: 'ყვითელი', en: 'yellow' },
                rose:   { c: '#ec4899', ka: 'ვარდისფერი', en: 'pink' },
                violet: { c: '#7c3aed', ka: 'იისფერი', en: 'purple' }
            };
            const ACCS = {
                aucun:     { ka: 'არაფერი', en: '' },
                casque:    { ka: 'ყურსასმენი', en: 'headphones' },
                casquette: { ka: 'კეპი', en: 'a cap' },
                bonnet:    { ka: 'შალის ქუდი', en: 'a beanie' },
                bandeau:   { ka: 'სალტე', en: 'a headband' },
                fleur:     { ka: 'ყვავილი', en: 'a flower in the hair' },
                noeud:     { ka: 'ბაფთა', en: 'a bow' }
            };
            const GLASSES = {
                aucune:  { ka: 'არაფერი', en: '' },
                rondes:  { ka: 'მრგვალი', en: 'round glasses' },
                carrees: { ka: 'კვადრატული', en: 'square glasses' },
                soleil:  { ka: 'მზის სათვალე', en: 'sunglasses' },
                futur:   { ka: 'ფუტურისტული', en: 'futuristic visor glasses' }
            };
            const JEWELS = {
                aucun:   { ka: 'არაფერი', en: '' },
                boucles: { ka: 'საყურეები', en: 'small earrings' },
                creoles: { ka: 'რგოლები', en: 'hoop earrings' },
                collier: { ka: 'ყელსაბამი', en: 'a necklace' }
            };
            const ANDROID = {
                aucun:    { ka: 'არაფერი', en: '' },
                circuits: { ka: 'ხაზები სახეზე', en: 'thin glowing circuit lines on the cheek' },
                oreille:  { ka: 'ტექნო ყური', en: 'a glowing tech ring on the ear' },
                points:   { ka: 'ნათელი წერტილები', en: 'three tiny glowing dots under one eye' }
            };

            /* Older robots get the closest new look automatically */
            function migrateProfile(p) {
                if (!p) return p;
                if (p.v === 3) return p;
                if (p.v === 2) {
                    const overlayMap = { veste: 'veste', hoodie: 'sweat', costume: 'blazer', sport: 'sweat' };
                    return Object.assign({}, p, {
                        v: 3, shell: 'blanc', joint: 'anthracite', emblem: 'coeur',
                        outfit: overlayMap[p.outfit] || 'aucun',
                        android: ANDROID[p.android] ? p.android : 'circuits'
                    });
                }
                const colorMap = { bleu: 'bleu', rouge: 'rouge', menthe: 'vert', lavande: 'violet', soleil: 'jaune', orange: 'jaune', rose: 'rose', argent: 'blanc' };
                const accMap = { casque: 'casque', casquette: 'casquette', bonnet: 'bonnet', noeud: 'noeud', fleur: 'fleur' };
                return {
                    name: p.name, gender: p.gender, created: p.created, v: 3, old: true,
                    skin: 'claire', hair: p.gender === 'f' ? 'carre' : 'court', hairColor: 'brun',
                    eyeColor: p.eyes === 'coeurs' ? 'violet' : (p.eyes === 'visiere' || p.eyes === 'pixels' ? 'cyan' : 'marron'),
                    shell: 'blanc', joint: 'anthracite', emblem: 'coeur',
                    outfit: 'aucun', outfitColor: colorMap[p.color] || 'bleu',
                    acc: accMap[p.acc] || 'aucun', glasses: GLASSES[p.glasses] ? p.glasses : 'aucune',
                    jewel: 'aucun', android: 'circuits'
                };
            }

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

            function hairParts(style, f) {
                // { back, front } paths for a head centred at x=120 (forehead ≈ y 46, chin ≈ y 137)
                switch (style) {
                    case 'meche': return { back: '', front: 'M88 88 C83 52 100 33 124 33 C147 34 157 52 152 82 C148 65 140 56 128 55 C116 64 102 68 92 66 C90 72 89 80 88 88 Z' };
                    case 'rase': return { back: '', front: 'M90 82 C90 56 102 41 120 41 C138 41 150 56 150 82 C146 64 136 53 120 53 C104 53 94 64 90 82 Z', thin: true };
                    case 'boucles': {
                        const curls = [[92, 70], [95, 57], [104, 46], [115, 40], [127, 40], [138, 46], [146, 57], [149, 70], [100, 62], [111, 52], [129, 52], [140, 62], [120, 47]];
                        const front = curls.map(([x, y]) => `M${x - 8} ${y} a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0`).join(' ');
                        const back = [[88, 92], [152, 92], [87, 106], [153, 106]].map(([x, y]) => `M${x - 8} ${y} a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0`).join(' ');
                        return { back, front };
                    }
                    case 'carre': return { back: 'M83 90 C79 50 98 31 120 31 C142 31 161 50 157 90 L159 128 C151 135 143 133 141 125 L99 125 C97 133 89 135 81 128 Z', front: 'M90 80 C90 52 104 38 120 38 C136 38 150 52 150 80 C141 70 131 66 120 68 C109 66 99 70 90 80 Z' };
                    case 'longs': return { back: 'M83 92 C77 48 98 29 120 29 C142 29 163 48 157 92 L166 200 C152 208 141 202 139 188 L101 188 C99 202 88 208 74 200 Z', front: 'M90 86 C88 50 104 35 124 35 C144 37 153 54 150 84 C146 64 136 54 118 58 C104 62 94 72 90 86 Z' };
                    case 'queue': return { back: 'M138 50 C172 54 178 104 168 152 C164 172 156 182 149 186 C158 150 157 110 141 78 Z', front: 'M90 82 C90 51 104 37 120 37 C136 37 150 51 150 82 C144 63 134 55 120 55 C106 55 96 63 90 82 Z' };
                    case 'chignon': return { back: 'M107 34 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0', front: 'M90 82 C90 51 104 37 120 37 C136 37 150 51 150 82 C144 63 134 55 120 55 C106 55 96 63 90 82 Z' };
                    default: return { back: '', front: f
                        ? 'M89 86 C87 52 102 36 120 36 C138 36 153 52 151 86 C149 68 143 60 136 57 C126 62 112 62 101 56 C95 62 91 72 89 86 Z'
                        : 'M88 84 C86 55 99 37 120 36 C141 37 154 54 152 82 C150 70 146 62 138 58 C128 62 112 62 100 57 C94 62 90 72 88 84 Z' };
                }
            }

            function robotSVG(p, label, viewBox) {
                p = migrateProfile(p) || {};
                const f = p.gender === 'f';
                const id = 'oba' + (++svgCounter);
                const skin = (SKINS[p.skin] || SKINS.claire).c;
                const skinShade = mixColor(skin, '#5a2e1a', 0.2);
                const skinDeep = mixColor(skin, '#3b1d10', 0.35);
                const hairC = (HAIR_COLORS[p.hairColor] || HAIR_COLORS.brun).c;
                const hairLight = mixColor(hairC, '#ffffff', 0.3);
                const hairDark = mixColor(hairC, '#000000', 0.25);
                const eye = EYE_COLORS[p.eyeColor] || EYE_COLORS.marron;
                const cloth = (OUTFIT_COLORS[p.outfitColor] || OUTFIT_COLORS.bleu).c;
                const clothLight = mixColor(cloth, '#ffffff', 0.22);
                const clothDark = mixColor(cloth, '#0f172a', 0.32);
                const shell = (SHELLS[p.shell] || SHELLS.blanc).c;
                const shellLight = mixColor(shell, '#ffffff', 0.55);
                const shellShade = mixColor(shell, '#1e293b', 0.28);
                const shellLine = mixColor(shell, '#0f172a', 0.4);
                const jointDef = JOINTS[p.joint] || JOINTS.anthracite;
                const joint = jointDef.c;
                const jointLight = mixColor(joint, '#ffffff', 0.35);
                const glow = '#7df9ff';
                const hp = hairParts(p.hair || (f ? 'carre' : 'court'), f);
                const brow = mixColor(hairC, '#2b1b14', 0.45);
                const lip = f ? mixColor('#c2566b', skin, 0.25) : mixColor(skin, '#9a4a3a', 0.4);
                const lipDark = mixColor(lip, '#3b0d12', 0.3);
                const jointGlow = jointDef.glow ? `filter="url(#${id}f)"` : '';

                // ---------- robotic body ----------
                const torsoPath = f
                    ? 'M40 300 L42 212 C46 180 70 172 88 168 C100 165 106 160 108 156 L132 156 C134 160 140 165 152 168 C170 172 194 180 198 212 L200 300 Z'
                    : 'M28 300 L30 208 C34 176 62 168 82 163 C96 160 104 156 106 152 L134 152 C136 156 144 160 158 163 C178 168 206 176 210 208 L212 300 Z';
                const sL = f ? 50 : 40, sR = f ? 190 : 200; // outer arm x
                const stroke = (d, w, c, extra) => `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none" ${extra || ''}/>`;
                // robotic arm: shell segments + dark joints (shoulder, elbow)
                const roboArm = (upper, fore, shoulder, elbow, w) =>
                    stroke(upper, w, `url(#${id}a)`) + stroke(fore, w - 2, `url(#${id}a)`) +
                    stroke(upper, 1.4, shellLine, 'opacity=".35" transform="translate(5 0)"') +
                    `<circle cx="${elbow.x}" cy="${elbow.y}" r="${w * 0.42}" fill="${joint}" ${jointGlow}/><circle cx="${elbow.x - 2}" cy="${elbow.y - 2}" r="${w * 0.16}" fill="${jointLight}" opacity=".6"/>` +
                    `<circle cx="${shoulder.x}" cy="${shoulder.y}" r="${w * 0.55}" fill="${joint}" ${jointGlow}/><path d="M${shoulder.x - w * 0.3} ${shoulder.y - w * 0.3} a${w * 0.42} ${w * 0.42} 0 0 1 ${w * 0.5} -${w * 0.05}" stroke="${jointLight}" stroke-width="2" opacity=".55" fill="none"/>`;
                const hand = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="${r * 0.82}" ry="${r}" fill="${shell}" stroke="${shellLine}" stroke-width=".8"/>` +
                    [-0.45, -0.15, 0.15, 0.45].map(o => stroke(`M${x + o * r * 1.3} ${y - r * 0.7} v-${r * 0.75}`, r * 0.3, joint)).join('') +
                    stroke(`M${x - r * 0.75} ${y - r * 0.1} q-${r * 0.45} -${r * 0.35} -${r * 0.4} -${r * 0.9}`, r * 0.32, joint);
                // arms hanging down
                const shL = { x: sL + 12, y: 190 }, shR = { x: sR - 12, y: 190 };
                const elL = { x: sL - 3, y: 256 }, elR = { x: sR + 3, y: 256 };
                const leftArm = roboArm(`M${shL.x} ${shL.y} C${sL} 214 ${elL.x} 236 ${elL.x} ${elL.y}`, `M${elL.x} ${elL.y} C${elL.x} 272 ${sL - 4} 288 ${sL - 3} 304`, shL, elL, 26);
                const rightArmDown = roboArm(`M${shR.x} ${shR.y} C${sR} 214 ${elR.x} 236 ${elR.x} ${elR.y}`, `M${elR.x} ${elR.y} C${elR.x} 272 ${sR + 4} 288 ${sR + 3} 304`, shR, elR, 26);
                // gesture poses
                const elbowW = { x: sR + 12, y: 230 }, handW = { x: sR + 16, y: 122 };
                const waveUpper = `M${shR.x} ${shR.y} C${sR + 2} 200 ${elbowW.x} 214 ${elbowW.x} ${elbowW.y}`;
                const waveFore = `M${elbowW.x} ${elbowW.y} C${elbowW.x + 2} 196 ${handW.x} 162 ${handW.x} ${handW.y + 12}`;
                const elbowT = { x: sR - 6, y: 258 }, chin = { x: 134, y: 140 };
                const thinkUpper = `M${shR.x} ${shR.y} C${sR - 2} 214 ${elbowT.x + 2} 238 ${elbowT.x} ${elbowT.y}`;
                const thinkFore = `M${elbowT.x} ${elbowT.y} C${elbowT.x - 14} 214 ${chin.x + 22} 170 ${chin.x + 6} ${chin.y + 10}`;
                const armWaveUpper = stroke(waveUpper, 24, `url(#${id}a)`) + `<circle cx="${shR.x}" cy="${shR.y}" r="13" fill="${joint}" ${jointGlow}/>`;
                const armWaveFore = stroke(waveFore, 21, `url(#${id}a)`) + `<circle cx="${elbowW.x}" cy="${elbowW.y}" r="10" fill="${joint}" ${jointGlow}/>`;
                const armThink = stroke(thinkUpper, 24, `url(#${id}a)`) + stroke(thinkFore, 21, `url(#${id}a)`) + `<circle cx="${elbowT.x}" cy="${elbowT.y}" r="10" fill="${joint}" ${jointGlow}/><circle cx="${shR.x}" cy="${shR.y}" r="13" fill="${joint}" ${jointGlow}/>`;

                // torso shell: panels, seams, collar ring, chest light
                const half = f ? 78 : 90;
                let shellDetails = `
                    <path d="M120 176 V300" stroke="${shellLine}" stroke-width="1.1" opacity=".3"/>
                    <path d="M${120 - half + 18} 206 C${120 - half + 30} 222 ${108} 226 ${112} 214 M${120 + half - 18} 206 C${120 + half - 30} 222 ${132} 226 ${128} 214" stroke="${shellLine}" stroke-width="1.2" opacity=".35" fill="none"/>
                    <path d="M${120 - half + 6} 252 Q120 266 ${120 + half - 6} 252" stroke="${shellLine}" stroke-width="1.2" opacity=".3" fill="none"/>
                    <path d="M${120 - half + 14} 190 C${120 - half + 24} 178 ${96} 172 ${104} 168" stroke="#ffffff" stroke-width="4" opacity=".55" fill="none" stroke-linecap="round"/>
                    <path d="M${120 - half + 4} 268 Q120 284 ${120 + half - 4} 268" stroke="${joint}" stroke-width="3" opacity=".85" fill="none" ${jointGlow}/>`;
                let emblem = '';
                switch (p.emblem) {
                    case 'coeur': emblem = `<path d="M120 222 C110 214 108 204 115 202 C118 201 120 203 120 205 C120 203 122 201 125 202 C132 204 130 214 120 222 Z" fill="${glow}" filter="url(#${id}f)" opacity=".95"/>`; break;
                    case 'anneau': emblem = `<circle cx="120" cy="208" r="9" fill="none" stroke="${glow}" stroke-width="3" filter="url(#${id}f)"/><circle cx="120" cy="208" r="3" fill="${glow}" filter="url(#${id}f)"/>`; break;
                    case 'drapeau': emblem = `<rect x="108" y="200" width="24" height="16" rx="3" fill="#fff" stroke="${shellLine}" stroke-width=".6"/><rect x="108" y="200" width="8" height="16" rx="2" fill="#0055a5"/><rect x="124" y="200" width="8" height="16" rx="2" fill="#ef4135"/>`; break;
                    case 'etoile': emblem = `<path d="M120 196 l3.2 7.2 7.8 .8 -5.9 5.2 1.8 7.7 -6.9 -4 -6.9 4 1.8 -7.7 -5.9 -5.2 7.8 -.8 z" fill="${glow}" filter="url(#${id}f)"/>`; break;
                }
                const collarRing = `<ellipse cx="120" cy="158" rx="${f ? 20 : 22}" ry="6" fill="${joint}" ${jointGlow}/><ellipse cx="120" cy="156.5" rx="${f ? 16 : 18}" ry="3.6" fill="${jointLight}" opacity=".35"/>`;

                // optional clothes over the robotic body
                let overlay = '', overlayArmL = '', overlayArmR = '';
                const panelL = (inner) => `M${inner} 160 L${inner + 8} 206 L${inner + 2} 300 L${f ? 42 : 30} 300 L${f ? 42 : 30} 210 C${f ? 46 : 34} 178 ${f ? 70 : 62} 170 ${inner} 160 Z`;
                const panelR = (inner) => `M${inner} 160 L${inner - 8} 206 L${inner - 2} 300 L${f ? 198 : 210} 300 L${f ? 198 : 210} 210 C${f ? 194 : 206} 178 ${f ? 170 : 178} 170 ${inner} 160 Z`;
                switch (p.outfit) {
                    case 'veste':
                    case 'blazer':
                    case 'gilet': {
                        const inner = p.outfit === 'gilet' ? 92 : 98;
                        overlay = `<path d="${panelL(inner)}" fill="url(#${id}o)"/><path d="${panelR(240 - inner)}" fill="url(#${id}o)"/>`;
                        if (p.outfit !== 'gilet') overlay += `<path d="M${inner} 160 L${inner + 8} 206 L${inner - 2} 212 L${inner - 10} 172 Z M${240 - inner} 160 L${232 - inner} 206 L${242 - inner} 212 L${250 - inner} 172 Z" fill="${clothDark}"/>`;
                        if (p.outfit === 'blazer') overlay += `<circle cx="${inner + 4}" cy="246" r="2.4" fill="${clothDark}"/><circle cx="${inner + 4}" cy="268" r="2.4" fill="${clothDark}"/>`;
                        if (p.outfit !== 'gilet') {
                            overlayArmL = (d) => stroke(d, 27, cloth);
                            overlayArmR = (d) => stroke(d, 27, cloth);
                        }
                        break;
                    }
                    case 'sweat':
                        overlay = `<path d="${panelL(102)}" fill="url(#${id}o)"/><path d="${panelR(138)}" fill="url(#${id}o)"/><path d="M96 162 Q120 150 144 162 Q138 172 120 174 Q102 172 96 162 Z" fill="${clothDark}"/><path d="M106 172 L104 206 M134 172 L136 206" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round"/>`;
                        overlayArmL = (d) => stroke(d, 27, cloth);
                        overlayArmR = (d) => stroke(d, 27, cloth);
                        break;
                    case 'echarpe':
                        overlay = `<path d="M98 160 Q120 176 142 160 L144 170 Q120 188 96 170 Z" fill="${cloth}"/><path d="M128 174 L134 226 L122 228 L118 178 Z" fill="${clothDark}"/><path d="M121 212 L134 210 M120 220 L134 218" stroke="#fff" stroke-width="2" opacity=".6"/>`;
                        break;
                }
                const armDownL = `M${shL.x} ${shL.y} C${sL} 214 ${elL.x} 236 ${elL.x} ${elL.y} C${elL.x} 272 ${sL - 4} 288 ${sL - 3} 304`;
                const armDownR = `M${shR.x} ${shR.y} C${sR} 214 ${elR.x} 236 ${elR.x} ${elR.y} C${elR.x} 272 ${sR + 4} 288 ${sR + 3} 304`;
                const sleeveL = overlayArmL ? overlayArmL(armDownL) : '';
                const sleeveR = overlayArmR ? overlayArmR(armDownR) : '';
                const sleeveWave = overlayArmR ? overlayArmR(waveUpper) : '';
                const sleeveThink = overlayArmR ? overlayArmR(thinkUpper) : '';

                // ---------- face ----------
                const facePath = f
                    ? 'M90 88 C90 60 102 46 120 46 C138 46 150 60 150 88 C150 106 146 118 138 127 C132 133 126 137 120 137 C114 137 108 133 102 127 C94 118 90 106 90 88 Z'
                    : 'M89 86 C89 58 102 44 120 44 C138 44 151 58 151 86 C151 104 149 116 143 125 C137 133 128 139 120 139 C112 139 103 133 97 125 C91 116 89 104 89 86 Z';
                const EY = 91;
                // right eye drawn once, the left one is a mirror image
                const eyeR = (x) => `<g transform="translate(${x} ${EY}) scale(1.18) translate(${-x} ${-EY})">
                    <path d="M${x - 7} ${EY} C${x - 4} ${EY - 3.6} ${x + 3} ${EY - 4.2} ${x + 7.2} ${EY - 0.8} C${x + 3} ${EY + 2.8} ${x - 3} ${EY + 3} ${x - 7} ${EY} Z" fill="#fbfaf8"/>
                    <g class="ob-iris"><circle cx="${x}" cy="${EY - 0.4}" r="3.5" fill="url(#${id}i)" ${eye.glow ? `filter="url(#${id}f)"` : ''}/>
                    <circle cx="${x}" cy="${EY - 0.4}" r="1.6" fill="${eye.glow ? '#ffffff' : '#0b0b0f'}"/>
                    <circle cx="${x + 1.2}" cy="${EY - 1.7}" r="0.9" fill="#ffffff"/></g>
                    <path d="M${x - 7.4} ${EY + 0.2} C${x - 4} ${EY - 4} ${x + 3} ${EY - 4.6} ${x + 7.6} ${EY - 0.8}" stroke="#24150f" stroke-width="${f ? 1.9 : 1.4}" fill="none" stroke-linecap="round"/>
                    <path d="M${x - 6} ${EY - 4.6} C${x - 2} ${EY - 7.4} ${x + 4} ${EY - 7.2} ${x + 7} ${EY - 4}" stroke="${skinDeep}" stroke-width="0.9" opacity=".45" fill="none"/>
                    ${f ? `<path d="M${x + 7.2} ${EY - 1} l2.6 -2.4 M${x + 5.6} ${EY - 2.6} l1.8 -2.6" stroke="#24150f" stroke-width="1.1" stroke-linecap="round"/>` : ''}
                    <path d="M${x - 5} ${EY + 3.3} Q${x} ${EY + 4.6} ${x + 5} ${EY + 2.6}" stroke="${skinDeep}" stroke-width="0.7" opacity=".35" fill="none"/></g>`;
                const browR = f
                    ? `<path class="ob-brow" d="M126 83 C130 79 136 78.2 142.5 80.6 C137 80 131 81.2 126.4 84.6 Z" fill="${brow}"/>`
                    : `<path class="ob-brow" d="M125 82.6 C130 78.6 137 78 143.5 80.2 L143 82.8 C137 81.4 131 82.2 125.6 85.2 Z" fill="${brow}"/>`;
                const nose = `<path d="M118 93 C117 98 116 102 115.5 105" stroke="${skinShade}" stroke-width="1.1" opacity=".45" fill="none" stroke-linecap="round"/>
                    <path d="M114.5 106 Q117 108.5 120 108 Q123 108.5 125.5 106" stroke="${skinDeep}" stroke-width="1.2" opacity=".55" fill="none" stroke-linecap="round"/>
                    <ellipse cx="120" cy="104" rx="3" ry="2" fill="#ffffff" opacity=".12"/>`;
                const mouthSmile = f
                    ? `<path d="M111 116.5 C114 114 117 114.2 120 115 C123 114.2 126 114 129 116.5 C125 117.6 115 117.6 111 116.5 Z" fill="${lipDark}"/><path d="M111.5 116.6 C115 121.6 125 121.6 128.5 116.6 C124 118.2 116 118.2 111.5 116.6 Z" fill="${lip}"/><path d="M116 119.2 Q120 120.2 124 119.2" stroke="#ffffff" stroke-width="0.9" opacity=".35" fill="none" stroke-linecap="round"/>`
                    : `<path d="M111.5 116.6 C116 119 124 119 128.5 116.6" stroke="${lipDark}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M114.5 120.4 Q120 122.4 125.5 120.4" stroke="${skinDeep}" stroke-width="1.1" opacity=".35" fill="none" stroke-linecap="round"/>`;
                const mouthBig = `<path d="M110.5 115.5 C115 114.6 125 114.6 129.5 115.5 C127 123.5 113 123.5 110.5 115.5 Z" fill="#5b1f24"/><path d="M112 116.2 C116 115.6 124 115.6 128 116.2 L127.4 118 C123 118.8 117 118.8 112.6 118 Z" fill="#ffffff"/><path d="M110.5 115.5 C115 114.6 125 114.6 129.5 115.5" stroke="${lipDark}" stroke-width="1.4" fill="none"/>`;
                const mouthO = `<ellipse cx="120" cy="117.5" rx="3.6" ry="4.2" fill="#5b1f24"/><ellipse cx="120" cy="117.5" rx="3.6" ry="4.2" fill="none" stroke="${lipDark}" stroke-width="1.4"/>`;
                const cheeks = `<ellipse cx="102" cy="106" rx="8" ry="5" fill="#ff8a9a" opacity="${f ? 0.15 : 0.07}"/><ellipse cx="138" cy="106" rx="8" ry="5" fill="#ff8a9a" opacity="${f ? 0.15 : 0.07}"/>`;
                const contour = `<path d="M92 98 C94 116 104 130 120 136 C108 128 98 116 96 98 Z" fill="${skinShade}" opacity=".22"/><path d="M148 98 C146 116 136 130 120 136 C132 128 142 116 144 98 Z" fill="${skinShade}" opacity=".22"/>`;

                let androidFace = '';
                if (p.android === 'circuits') {
                    androidFace = `<g filter="url(#${id}f)" stroke="${glow}" stroke-width="1.1" fill="none" opacity=".95"><path d="M139 99 h5 l3 4 v7"/><path d="M137 112 h4 l3 3"/><circle cx="147" cy="110.5" r="1.2" fill="${glow}"/><circle cx="144.5" cy="115.5" r="1.1" fill="${glow}"/></g>`;
                } else if (p.android === 'oreille') {
                    androidFace = `<circle cx="151.5" cy="95" r="5.4" fill="${joint}"/><circle cx="151.5" cy="95" r="3.4" fill="none" stroke="${glow}" stroke-width="1.4" filter="url(#${id}f)"/>`;
                } else if (p.android === 'points') {
                    androidFace = `<g fill="${glow}" filter="url(#${id}f)"><circle cx="139" cy="99.5" r="1.1"/><circle cx="142.5" cy="98.5" r="1.1"/><circle cx="146" cy="97" r="1.1"/></g>`;
                }

                // ---------- accessories ----------
                let onHead = '';
                switch (p.acc) {
                    case 'casque': onHead = `<path d="M86 94 C83 28 157 28 154 94" stroke="#1f2937" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="80" y="82" width="12" height="22" rx="5" fill="#1f2937"/><rect x="148" y="82" width="12" height="22" rx="5" fill="#1f2937"/><circle cx="86" cy="93" r="2.5" fill="${cloth}"/><circle cx="154" cy="93" r="2.5" fill="${cloth}"/>`; break;
                    case 'casquette': onHead = `<path d="M88 72 C88 42 102 31 120 31 C138 31 152 42 152 72 C138 65 102 65 88 72 Z" fill="${cloth}"/><path d="M118 67 C140 59 168 61 184 71 C166 77 138 76 118 73 Z" fill="${clothDark}"/><circle cx="120" cy="32" r="2.6" fill="${clothDark}"/><path d="M120 33 C114 44 112 56 113 67" stroke="${clothDark}" stroke-width="1" opacity=".5" fill="none"/>`; break;
                    case 'bonnet': onHead = `<path d="M86 76 C86 36 102 26 120 26 C138 26 154 36 154 76 Z" fill="${cloth}"/><rect x="84" y="64" width="72" height="14" rx="7" fill="${clothDark}"/><circle cx="120" cy="25" r="8.5" fill="${clothLight}"/>${[96, 108, 120, 132, 144].map(x => `<path d="M${x} 38 V64" stroke="${clothDark}" stroke-width="1" opacity=".35"/>`).join('')}`; break;
                    case 'bandeau': onHead = `<path d="M90 68 Q120 44 150 68" stroke="${cloth}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`; break;
                    case 'fleur': onHead = `<g transform="translate(145 58)">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.cos(a * Math.PI / 180) * 5.5).toFixed(1)}" cy="${(Math.sin(a * Math.PI / 180) * 5.5).toFixed(1)}" r="4.8" fill="#f9a8d4"/>`).join('')}<circle r="3.4" fill="#facc15"/></g>`; break;
                    case 'noeud': onHead = `<g transform="translate(142 46) rotate(14)"><path d="M0 0 L-13 -8 L-13 8 Z" fill="${cloth}"/><path d="M0 0 L13 -8 L13 8 Z" fill="${cloth}"/><circle r="3.8" fill="${clothDark}"/></g>`; break;
                }
                let glasses = '';
                switch (p.glasses) {
                    case 'rondes': glasses = `<circle cx="107" cy="${EY}" r="9.5" fill="rgba(255,255,255,.06)" stroke="#a07c45" stroke-width="1.8"/><circle cx="133" cy="${EY}" r="9.5" fill="rgba(255,255,255,.06)" stroke="#a07c45" stroke-width="1.8"/><path d="M116.5 89.5 Q120 87.5 123.5 89.5" stroke="#a07c45" stroke-width="1.6" fill="none"/>`; break;
                    case 'carrees': glasses = `<rect x="96" y="83" width="21" height="15" rx="3" fill="rgba(255,255,255,.08)" stroke="#1f2937" stroke-width="2.2"/><rect x="123" y="83" width="21" height="15" rx="3" fill="rgba(255,255,255,.08)" stroke="#1f2937" stroke-width="2.2"/><path d="M117 89 H123" stroke="#1f2937" stroke-width="2"/>`; break;
                    case 'soleil': glasses = `<path d="M95 84 H118 V91 Q118 100 106.5 100 Q95 100 95 91 Z" fill="#0b1020"/><path d="M122 84 H145 V91 Q145 100 133.5 100 Q122 100 122 91 Z" fill="#0b1020"/><path d="M118 86.5 H122" stroke="#0b1020" stroke-width="2"/><path d="M99 88 L105 88" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>`; break;
                    case 'futur': glasses = `<path d="M94 84 H146 Q148 96 138 99 H102 Q92 96 94 84 Z" fill="${glow}" fill-opacity=".25" stroke="${glow}" stroke-width="1.4" filter="url(#${id}f)"/>`; break;
                }
                let jewel = '';
                switch (p.jewel) {
                    case 'boucles': jewel = `<circle cx="88.5" cy="103" r="1.8" fill="#facc15"/><circle cx="151.5" cy="103" r="1.8" fill="#facc15"/>`; break;
                    case 'creoles': jewel = `<circle cx="88.5" cy="107" r="4" fill="none" stroke="#facc15" stroke-width="1.5"/><circle cx="151.5" cy="107" r="4" fill="none" stroke="#facc15" stroke-width="1.5"/>`; break;
                }
                const necklace = p.jewel === 'collier' ? `<path d="M107 157 Q120 172 133 157" stroke="#facc15" stroke-width="1.4" fill="none"/><circle cx="120" cy="167" r="2.8" fill="#facc15"/>` : '';
                const hairShine = hp.thin ? '' : `<path d="M102 47 Q116 40 134 44" stroke="${hairLight}" stroke-width="2.2" opacity=".45" fill="none" stroke-linecap="round"/>`;

                return `<svg class="ob-bot ob-android" viewBox="${viewBox || '0 0 240 300'}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label || 'android'}">
                    <defs>
                        <linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${clothLight}"/><stop offset="1" stop-color="${clothDark}"/></linearGradient>
                        <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shellLight}"/><stop offset=".45" stop-color="${shell}"/><stop offset="1" stop-color="${shellShade}"/></linearGradient>
                        <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shellShade}"/><stop offset=".35" stop-color="${shellLight}"/><stop offset="1" stop-color="${shellShade}"/></linearGradient>
                        <linearGradient id="${id}n" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mixColor(joint, '#000000', 0.2)}"/><stop offset=".5" stop-color="${jointLight}"/><stop offset="1" stop-color="${mixColor(joint, '#000000', 0.2)}"/></linearGradient>
                        <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hairLight}"/><stop offset=".6" stop-color="${hairC}"/><stop offset="1" stop-color="${hairDark}"/></linearGradient>
                        <radialGradient id="${id}s" cx=".45" cy=".38" r=".75"><stop offset="0" stop-color="${mixColor(skin, '#ffffff', 0.14)}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/></radialGradient>
                        <linearGradient id="${id}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/></linearGradient>
                        <radialGradient id="${id}i" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="${mixColor(eye.c, '#ffffff', 0.35)}"/><stop offset="1" stop-color="${mixColor(eye.c, '#000000', 0.25)}"/></radialGradient>
                        <filter id="${id}f" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.3" result="bl"/><feMerge><feMergeNode in="bl"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    </defs>
                    <g class="ob-float">
                        <g class="ob-body">
                            ${hp.back ? `<path d="${hp.back}" fill="url(#${id}h)"/>` : ''}
                            <path d="M${f ? 110 : 108} 120 L${f ? 130 : 132} 120 L${f ? 132 : 134} 160 Q120 166 ${f ? 108 : 106} 160 Z" fill="url(#${id}n)"/>
                            ${[136, 144, 152].map(y => `<path d="M${f ? 111 : 109} ${y} Q120 ${y + 3} ${f ? 129 : 131} ${y}" stroke="${jointLight}" stroke-width="1.3" opacity=".45" fill="none"/>`).join('')}
                            <path d="M110 126 Q120 140 130 126" stroke="${skinDeep}" stroke-width="2" opacity=".25" fill="none"/>
                            <path d="${torsoPath}" fill="url(#${id}b)"/>
                            ${shellDetails}
                            ${emblem}
                            ${collarRing}
                            ${overlay}
                            ${necklace}
                            <g>${leftArm}${sleeveL}</g>
                            <g class="ob-arm-down">${rightArmDown}${sleeveR}</g>
                            <g class="ob-pose ob-pose-wave">${armWaveUpper}${sleeveWave}<g class="ob-forearm" style="transform-origin:${elbowW.x}px ${elbowW.y}px">${armWaveFore}${hand(handW.x, handW.y + 4, 9)}</g></g>
                            <g class="ob-pose ob-pose-think">${armThink}${sleeveThink}${hand(chin.x + 4, chin.y + 4, 8.5)}</g>
                        </g>
                        <g class="ob-head">
                            <ellipse cx="88.5" cy="95" rx="4.6" ry="9" fill="${skin}"/><ellipse cx="151.5" cy="95" rx="4.6" ry="9" fill="${skin}"/>
                            <path d="M88.5 89 Q86.5 95 89 101 M151.5 89 Q153.5 95 151 101" stroke="${skinShade}" stroke-width="1" fill="none"/>
                            ${jewel}
                            <path d="${facePath}" fill="url(#${id}s)"/>
                            ${cheeks}
                            <g class="ob-eyes"><g class="ob-eyes-in">${eyeR(133)}<g transform="translate(240 0) scale(-1 1)">${eyeR(133)}</g></g></g>
                            <g class="ob-brows">${browR}<g transform="translate(240 0) scale(-1 1)">${browR}</g></g>
                            ${nose}
                            <g class="ob-mouth-smile">${mouthSmile}</g>
                            <g class="ob-mouth-big">${mouthBig}</g>
                            <g class="ob-mouth-o">${mouthO}</g>
                            ${androidFace}
                            ${glasses}
                            <path d="${hp.front}" fill="url(#${id}h)" ${hp.thin ? 'opacity=".85"' : ''}/>
                            ${hairShine}
                            ${onHead}
                        </g>
                    </g>
                </svg>`;
            }

            /* Short text describing the android (for ChatGPT) */
            function lookText(p) {
                p = migrateProfile(p) || {};
                const parts = [`a humanoid android ${p.gender === 'f' ? 'girl' : 'boy'}: a realistic human face with ${(SKINS[p.skin] || SKINS.claire).en} skin, ${(HAIR_COLORS[p.hairColor] || HAIR_COLORS.brun).en} ${(HAIRS[p.hair] || HAIRS.court).en} and ${(EYE_COLORS[p.eyeColor] || EYE_COLORS.marron).en} eyes, on a sleek ${(SHELLS[p.shell] || SHELLS.blanc).en} robotic body with ${(JOINTS[p.joint] || JOINTS.anthracite).en} joints`];
                if (EMBLEMS[p.emblem] && EMBLEMS[p.emblem].en) parts.push(EMBLEMS[p.emblem].en);
                if (OUTFITS[p.outfit] && OUTFITS[p.outfit].en) parts.push(`wearing ${(OUTFIT_COLORS[p.outfitColor] || OUTFIT_COLORS.bleu).en} ${OUTFITS[p.outfit].en.replace(/^an? /, '')}`);
                [ACCS[p.acc], GLASSES[p.glasses], JEWELS[p.jewel], ANDROID[p.android]].forEach(x => { if (x && x.en) parts.push('with ' + x.en); });
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
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('obOverlay').hidden) dismiss(); });

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
            const draft = { name: '', gender: '', skin: 'claire', hair: '', hairColor: 'noir', eyeColor: 'marron', shell: 'blanc', joint: 'anthracite', emblem: 'coeur', outfit: 'aucun', outfitColor: 'bleu', acc: 'aucun', glasses: 'aucune', jewel: 'aucun', android: 'aucun', v: 3 };
            const SETUP_STEPS = 10;
            let setupStep = 1;
            let setupDir = 1;
            let setupMode = 'new';      // 'new' = first creation, 'restyle' = old robot gets the new android look
            let hairTouched = false;

            function setupSay(n) {
                const f = draft.gender === 'f';
                const name = draft.name || '';
                if (setupMode === 'restyle' && n === 3) return { fr: "J'ai une nouvelle apparence ! Tu choisis mon look ? 😍 D'abord, ma peau 🎨", ka: "ახალი გარეგნობა მაქვს! ჩემს სტილს შენ აირჩევ? 😍 ჯერ კანის ფერი 🎨" };
                return {
                    1: { fr: "Salut ! 👋 Je suis ton nouvel ami androïde. D'abord… comment je m'appelle ?", ka: "გამარჯობა! 👋 მე შენი ახალი ანდროიდი მეგობარი ვარ. ჯერ… რა მქვია?" },
                    2: { fr: `${name} ? J'adore ce prénom ! Je suis une fille ou un garçon ?`, ka: `${name}? ძალიან მომწონს ეს სახელი! გოგო ვარ თუ ბიჭი?` },
                    3: { fr: "Super ! Maintenant, choisis la couleur de ma peau 🎨", ka: "სუპერ! ახლა ჩემი კანის ფერი აირჩიე 🎨" },
                    4: { fr: "Et ma coiffure ? Choisis le style et la couleur 💇", ka: "ჩემი ვარცხნილობა? აირჩიე სტილი და ფერი 💇" },
                    5: { fr: "Et mes yeux ? 👀", ka: "ჩემი თვალები? 👀" },
                    6: { fr: "Et mon corps de robot ? Choisis les couleurs ⚙️", ka: "ჩემი რობოტის სხეული? აირჩიე ფერები ⚙️" },
                    7: { fr: "Des vêtements par-dessus ? C'est toi qui choisis 👕", ka: "ტანსაცმელი ზემოდან? შენ აირჩიე 👕" },
                    8: { fr: "Des accessoires ? Un chapeau, des lunettes, des bijoux… ✨", ka: "აქსესუარები? ქუდი, სათვალე, სამკაულები… ✨" },
                    9: { fr: "Et un petit détail d'androïde ? 🤖", ka: "და ანდროიდის პატარა დეტალი? 🤖" },
                    10: { fr: `Waouh, je suis trop ${f ? 'belle' : 'beau'} ! Merci ! On est amis pour toujours ? 🤝`, ka: "ვაუ, რა ლამაზი ვარ! მადლობა! სამუდამოდ მეგობრები ვართ? 🤝" }
                }[n];
            }

            function renderSetupPreview() {
                $('obSetupRobot').innerHTML = robotSVG(draft, draft.name || 'android');
                $('obSetupPlate').textContent = draft.name || '???';
            }

            /* Little "pop + sparkles" when the student picks something */
            function celebrate() {
                const box = $('obSetupRobot');
                box.classList.remove('ob-pop');
                void box.offsetWidth;
                box.classList.add('ob-pop');
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                const colors = ['#facc15', '#60a5fa', '#f472b6', '#34d399', '#ffffff'];
                for (let i = 0; i < 10; i++) {
                    const s = document.createElement('span');
                    s.className = 'ob-spark';
                    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
                    const d = 70 + Math.random() * 50;
                    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
                    s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
                    s.style.background = colors[i % colors.length];
                    box.appendChild(s);
                    setTimeout(() => s.remove(), 750);
                }
            }

            function pickOption(field, value) {
                draft[field] = value;
                if (field === 'hair') hairTouched = true;
                renderSetupPreview();
                celebrate();
            }

            /* tiles = small pictures of the android with each option */
            function tileGroup(boxId, map, field, viewBox) {
                const box = $(boxId);
                box.innerHTML = '';
                Object.keys(map).forEach(k => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'ob-tile';
                    b.setAttribute('aria-pressed', String(draft[field] === k));
                    const preview = Object.assign({}, draft, { [field]: k });
                    b.innerHTML = `<span class="ob-tile-img">${robotSVG(preview, map[k].ka, viewBox)}</span><span class="ob-tile-label"></span>`;
                    b.querySelector('.ob-tile-label').textContent = map[k].ka;
                    b.addEventListener('click', () => {
                        box.querySelectorAll('.ob-tile').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
                        pickOption(field, k);
                    });
                    box.appendChild(b);
                });
            }

            /* swatches = round colour buttons */
            function swatchGroup(boxId, map, field, onPick) {
                const box = $(boxId);
                box.innerHTML = '';
                Object.keys(map).forEach(k => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'ob-swatch';
                    b.style.background = map[k].c;
                    b.setAttribute('aria-label', map[k].ka);
                    b.title = map[k].ka;
                    b.setAttribute('aria-pressed', String(draft[field] === k));
                    b.addEventListener('click', () => {
                        box.querySelectorAll('.ob-swatch').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
                        pickOption(field, k);
                        if (onPick) onPick();
                    });
                    box.appendChild(b);
                });
            }

            const HEAD_VIEW = '74 22 92 124';
            const BODY_VIEW = '20 140 200 160';
            const EYES_VIEW = '93 77 54 28';
            const CHEST_VIEW = '62 170 116 70';
            function buildStepOptions(n) {
                if (n === 3) swatchGroup('obSkinOpts', SKINS, 'skin');
                if (n === 4) {
                    tileGroup('obHairOpts', HAIRS, 'hair', HEAD_VIEW);
                    swatchGroup('obHairColorOpts', HAIR_COLORS, 'hairColor', () => tileGroup('obHairOpts', HAIRS, 'hair', HEAD_VIEW));
                }
                if (n === 5) tileGroup('obEyeOpts', EYE_COLORS, 'eyeColor', EYES_VIEW);
                if (n === 6) {
                    const refresh = () => tileGroup('obEmblemOpts', EMBLEMS, 'emblem', CHEST_VIEW);
                    swatchGroup('obShellOpts', SHELLS, 'shell', refresh);
                    swatchGroup('obJointOpts', JOINTS, 'joint', refresh);
                    refresh();
                }
                if (n === 7) {
                    tileGroup('obOutfitOpts', OUTFITS, 'outfit', BODY_VIEW);
                    swatchGroup('obOutfitColorOpts', OUTFIT_COLORS, 'outfitColor', () => tileGroup('obOutfitOpts', OUTFITS, 'outfit', BODY_VIEW));
                }
                if (n === 8) {
                    tileGroup('obAccOpts', ACCS, 'acc', HEAD_VIEW);
                    tileGroup('obGlassesOpts', GLASSES, 'glasses', EYES_VIEW);
                    tileGroup('obJewelOpts', JEWELS, 'jewel', '74 76 92 104');
                }
                if (n === 9) tileGroup('obAndroidOpts', ANDROID, 'android', HEAD_VIEW);
            }

            function goStep(n) {
                setupDir = n >= setupStep ? 1 : -1;
                setupStep = n;
                buildStepOptions(n);
                document.querySelectorAll('#obSetup .ob-step').forEach(el => {
                    const on = Number(el.dataset.step) === n;
                    el.classList.toggle('ob-active', on);
                    el.classList.toggle('ob-from-left', on && setupDir < 0);
                });
                document.querySelectorAll('#obSetup .ob-steps li').forEach((li, i) => li.classList.toggle('ob-done', i < n));
                $('obStepNum').textContent = n;
                $('obBackBtn').hidden = n === 1 || (setupMode === 'restyle' && n === 3);
                $('obNextBtn').textContent = n === SETUP_STEPS ? 'დიახ, დავიწყოთ!' : 'შემდეგი';
                $('obSetupErr').textContent = '';

                const box = $('obSetupRobot');
                box.classList.remove('ob-hop');
                void box.offsetWidth;
                box.classList.add('ob-hop');
                const say = setupSay(n);
                const bubble = $('obSetupSayFr').parentElement;
                bubble.classList.remove('ob-swap');
                void bubble.offsetWidth;
                bubble.classList.add('ob-swap');
                $('obSetupSayFr').textContent = say.fr;
                $('obSetupSayKa').textContent = say.ka;

                if (n === 1) setTimeout(() => $('obNameInput').focus(), 60);
                if (n === SETUP_STEPS) {
                    $('obSummaryBot').innerHTML = robotSVG(draft, draft.name);
                    $('obSummaryName').textContent = draft.name;
                    const extras = [EMBLEMS[draft.emblem].ka, draft.outfit !== 'aucun' ? `${OUTFIT_COLORS[draft.outfitColor].ka} ${OUTFITS[draft.outfit].ka}` : 'არაფერი', ACCS[draft.acc].ka, GLASSES[draft.glasses].ka, JEWELS[draft.jewel].ka, ANDROID[draft.android].ka].filter(x => x !== 'არაფერი');
                    $('obSummaryMeta').textContent = [draft.gender === 'f' ? 'გოგო' : 'ბიჭი', SKINS[draft.skin].ka, `${HAIRS[draft.hair].ka} ${HAIR_COLORS[draft.hairColor].ka} თმა`, `${EYE_COLORS[draft.eyeColor].ka} თვალები`, `${SHELLS[draft.shell].ka} სხეული`].concat(extras).join(', ');
                    celebrate();
                }
                gesture('obSetupRobot', say.fr);
                speakKa(say.fr, draft.gender);
                if (n < SETUP_STEPS && draft.gender) { kaPrefetchQueue = []; prefetchKa([setupSay(n + 1).fr], draft.gender); }
            }

            function openSetup(mode) {
                setupMode = mode === 'restyle' ? 'restyle' : 'new';
                if (setupMode === 'restyle') {
                    // keep name and gender, start directly with the look
                    Object.assign(draft, migrateProfile(state.profile), { v: 3 });
                    delete draft.old;
                    hairTouched = true;
                }
                if (!draft.hair) draft.hair = draft.gender === 'm' ? 'court' : 'carre';
                renderSetupPreview();
                $('obNameInput').value = draft.name;
                setupStep = setupMode === 'restyle' ? 3 : 1;
                goStep(setupStep);
                showWindow('obSetup');
            }

            $('obNameInput').addEventListener('input', (e) => {
                draft.name = e.target.value.trim();
                renderSetupPreview();
            });
            $('obNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('obNextBtn').click(); } });
            document.querySelectorAll('#obGenderOpts [data-gender]').forEach(b => {
                b.addEventListener('click', () => {
                    draft.gender = b.dataset.gender;
                    if (!hairTouched) draft.hair = draft.gender === 'f' ? 'carre' : 'court';
                    kaPrefetchQueue = [];
                    prefetchKa([setupSay(3).fr], draft.gender);
                    document.querySelectorAll('#obGenderOpts [data-gender]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
                    renderSetupPreview();
                    celebrate();
                });
            });
            $('obBackBtn').addEventListener('click', () => goStep(Math.max(setupMode === 'restyle' ? 3 : 1, setupStep - 1)));
            $('obNextBtn').addEventListener('click', async () => {
                if (setupStep === 1) {
                    draft.name = $('obNameInput').value.trim();
                    if (!/^[\p{L}\p{N}' \-]{1,20}$/u.test(draft.name)) {
                        $('obSetupErr').textContent = 'ჩაწერე სახელი (მხოლოდ ასოები, მაქსიმუმ 20 სიმბოლო).';
                        return;
                    }
                    return goStep(2);
                }
                if (setupStep === 2 && !draft.gender) {
                    $('obSetupErr').textContent = 'აირჩიე: გოგო თუ ბიჭი.';
                    return;
                }
                if (setupStep < SETUP_STEPS) return goStep(setupStep + 1);

                // last step: save the android forever
                const look = {
                    skin: draft.skin, hair: draft.hair, hairColor: draft.hairColor, eyeColor: draft.eyeColor,
                    shell: draft.shell, joint: draft.joint, emblem: draft.emblem,
                    outfit: draft.outfit, outfitColor: draft.outfitColor, acc: draft.acc, glasses: draft.glasses,
                    jewel: draft.jewel, android: draft.android, v: 3
                };
                $('obNextBtn').disabled = true;
                if (setupMode === 'restyle' && state.profile) {
                    state.profile = Object.assign({ name: state.profile.name, gender: state.profile.gender, created: state.profile.created }, look);
                } else {
                    if (state.profile && state.profile.v >= 2) { $('obNextBtn').disabled = false; return; } // already created, never overwrite
                    state.profile = Object.assign({ name: draft.name, gender: draft.gender, created: todayStr() }, look);
                }
                await saveState();
                $('obNextBtn').disabled = false;
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
                $('obChatRobot').innerHTML = robotSVG(p, `${p.name} – robot`);
                $('obChatMini').innerHTML = robotSVG(p, p.name, '78 26 84 110');
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
                heroBot.innerHTML = robotSVG(p, p.name);
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
                const svg = $(robotId) && $(robotId).querySelector('svg');
                if (!svg) return;
                const g = forced || chooseGesture(text);
                Object.keys(GESTURE_TIME).forEach(k => svg.classList.remove('ob-g-' + k));
                void svg.getBoundingClientRect();
                svg.classList.add('ob-g-' + g);
                clearTimeout(svg._obGesture);
                svg._obGesture = setTimeout(() => svg.classList.remove('ob-g-' + g), GESTURE_TIME[g] || 1500);
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
                const look = p || Object.assign({}, draft, { gender: draft.gender || 'f', hair: draft.hair || 'carre' });
                $('obLauncherBot').innerHTML = robotSVG(look, p ? p.name : 'android', '80 30 80 80');
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
    
