/* =========================================================
   BB-EXTENDED-FEATURES.JS
   USDT • Робота/Професії • Банк • Турнір КНП • Міни
   Тижневий квест з промокодами • Акції • Бізнес
   ========================================================= */
(() => {
    'use strict';
    if (typeof firebase === 'undefined') return;

    /* ── helpers ── */
    function db()   { return firebase.database(); }
    function n(v, f = 0) { return Number.isFinite(Number(v)) ? Number(v) : f; }
    function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function uid(p = 'id') { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
    function round2(v) { return Math.round(n(v, 0) * 100) / 100; }
    function dateKey(ts = Date.now()) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function getUser() { return typeof gameState !== 'undefined' ? gameState.user : null; }
    function getBalance() { return n(typeof gameState !== 'undefined' ? gameState.balance : 0); }
    function getUsdt() { return n(typeof gameState !== 'undefined' ? gameState.usdt : 0); }

    /* ── Firebase USDT helpers ── */
    async function loadUsdt(username) {
        if (!username) return 0;
        const snap = await db().ref(`users/${username}/usdt`).once('value');
        return n(snap.val(), 0);
    }

    async function saveUsdt(username, amount) {
        if (!username) return;
        const rounded = Math.max(0, Math.round(n(amount, 0) * 100) / 100);
        await db().ref(`users/${username}/usdt`).set(rounded);
        if (typeof gameState !== 'undefined') gameState.usdt = rounded;
        if (typeof updateHeader === 'function') updateHeader();
        return rounded;
    }

    async function adjustUsdt(username, delta) {
        const current = await loadUsdt(username);
        const next = Math.max(0, Math.round((current + delta) * 100) / 100);
        await saveUsdt(username, next);
        return next;
    }

    /* ────────────────────────────────────────────────────── */
    /*  WORK / PROFESSION SYSTEM                              */
    /* ────────────────────────────────────────────────────── */
    const PROFESSIONS = [
        { id: 'freelancer',  name: 'Фрілансер',    icon: '💻', reward: 0.50, cooldown: 60,    xpGain: 5,  xpRequired: 0,   desc: 'Стартова професія. Немає вимог до досвіду.' },
        { id: 'programmer',  name: 'Програміст',   icon: '🖥️', reward: 1.20, cooldown: 90,    xpGain: 10, xpRequired: 50,  desc: 'Потрібно 50 XP. Гарний заробіток.' },
        { id: 'designer',    name: 'Дизайнер',     icon: '🎨', reward: 1.00, cooldown: 90,    xpGain: 8,  xpRequired: 50,  desc: 'Потрібно 50 XP. Творча робота.' },
        { id: 'trader',      name: 'Трейдер',      icon: '📊', reward: 2.50, cooldown: 120,   xpGain: 15, xpRequired: 150, desc: 'Потрібно 150 XP. Висока виплата.' },
        { id: 'doctor',      name: 'Лікар',        icon: '🏥', reward: 3.00, cooldown: 180,   xpGain: 20, xpRequired: 300, desc: 'Потрібно 300 XP. Дуже поважна професія.' },
        { id: 'lawyer',      name: 'Юрист',        icon: '⚖️', reward: 4.00, cooldown: 240,   xpGain: 25, xpRequired: 500, desc: 'Потрібно 500 XP. Елітний заробіток.' },
        { id: 'engineer',    name: 'Інженер',      icon: '⚙️', reward: 2.00, cooldown: 120,   xpGain: 12, xpRequired: 200, desc: 'Потрібно 200 XP.' },
        { id: 'chef',        name: 'Шеф-кухар',   icon: '👨‍🍳', reward: 1.50, cooldown: 90,    xpGain: 8,  xpRequired: 100, desc: 'Потрібно 100 XP.' },
        { id: 'pilot',       name: 'Пілот',        icon: '✈️', reward: 5.00, cooldown: 360,   xpGain: 30, xpRequired: 800, desc: 'Потрібно 800 XP. Найкращий заробіток.' },
        { id: 'tiler',       name: 'Плиточник',    icon: '🪟', reward: 1.80, cooldown: 90,    xpGain: 10, xpRequired: 80,  desc: 'Потрібно 80 XP. Укладати плитку.' },
        { id: 'tax_agent',   name: 'Податківець',  icon: '🏛️', reward: 3.50, cooldown: 180,   xpGain: 18, xpRequired: 400, desc: 'Потрібно 400 XP. Нерухомість та податки.' },
        { id: 'entrepreneur',name: 'Підприємець',  icon: '🤵', reward: 8.00, cooldown: 480,   xpGain: 40, xpRequired: 1500,desc: 'Потрібно 1500 XP. Максимальна виплата.' }
    ];

    const extState = {
        work: { jobId: null, xp: 0, lastWorkAt: 0, totalEarned: 0 },
        bank: { loans: {}, history: [], bootstrapped: false },
        stocks: { portfolio: {}, businesses: {} },
        workCooldownTimer: null,
        debtProcessingTimer: null,
        tournamentListener: null
    };

    /* ── load / save work state ── */
    async function loadWorkState() {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/workData`).once('value');
        const raw = snap.val() || {};
        extState.work.jobId      = raw.jobId || 'freelancer';
        extState.work.xp         = n(raw.xp, 0);
        extState.work.lastWorkAt = n(raw.lastWorkAt, 0);
        extState.work.totalEarned = n(raw.totalEarned, 0);
    }

    async function saveWorkState() {
        const u = getUser(); if (!u) return;
        await db().ref(`users/${u}/workData`).set({ ...extState.work });
    }

    function getCurrentProfession() {
        return PROFESSIONS.find(p => p.id === extState.work.jobId) || PROFESSIONS[0];
    }

    function getWorkCooldownRemaining() {
        const prof = getCurrentProfession();
        const elapsed = Math.floor((Date.now() - extState.work.lastWorkAt) / 1000);
        return Math.max(0, prof.cooldown - elapsed);
    }

    /* ── render work tab ── */
    function renderWorkTab() {
        const u = getUser();
        const prof = getCurrentProfession();
        const cooldown = getWorkCooldownRemaining();

        const jobNameEl = document.getElementById('work-current-job');
        if (jobNameEl) jobNameEl.textContent = `${prof.icon} ${prof.name}`;
        const xpEl = document.getElementById('work-xp-display');
        if (xpEl) xpEl.textContent = `${Math.floor(extState.work.xp)} XP`;
        const earnedEl = document.getElementById('work-earned-usdt');
        if (earnedEl) earnedEl.textContent = n(extState.work.totalEarned, 0).toFixed(2);

        const nextEl = document.getElementById('work-next-time');
        const doBtn = document.getElementById('work-do-btn');
        const coolBar = document.getElementById('work-cooldown-bar');
        const coolFill = document.getElementById('work-cooldown-fill');

        if (cooldown <= 0) {
            if (nextEl) nextEl.textContent = 'Готово!';
            if (doBtn) { doBtn.className = 'work-btn ready'; doBtn.textContent = '⚒️ ПРАЦЮВАТИ'; doBtn.disabled = false; }
            if (coolBar) coolBar.style.display = 'none';
        } else {
            const mins = Math.floor(cooldown / 60);
            const secs = cooldown % 60;
            if (nextEl) nextEl.textContent = `${mins}хв ${secs}с`;
            if (doBtn) { doBtn.className = 'work-btn busy'; doBtn.textContent = `⏳ ${mins}хв ${secs}с`; doBtn.disabled = true; }
            if (coolBar) coolBar.style.display = 'block';
            if (coolFill) coolFill.style.width = `${(1 - cooldown / prof.cooldown) * 100}%`;
        }

        const listEl = document.getElementById('jobs-list');
        if (!listEl) return;
        listEl.innerHTML = PROFESSIONS.map(p => {
            const isActive = p.id === extState.work.jobId;
            const canChoose = extState.work.xp >= p.xpRequired;
            const pct = p.xpRequired > 0 ? Math.min(100, (extState.work.xp / p.xpRequired) * 100) : 100;
            return `
                <div class="job-card ${isActive ? 'active-job' : ''}">
                    <div class="job-icon">${esc(p.icon)}</div>
                    <div class="job-name">${esc(p.name)} ${isActive ? '<span style="color:var(--g);font-size:10px;">● АКТИВНА</span>' : ''}</div>
                    <div class="job-meta">
                        💵 ${p.reward.toFixed(2)} USDT за роботу<br>
                        ⏱ Кулдаун: ${p.cooldown >= 60 ? Math.floor(p.cooldown/60)+'хв' : p.cooldown+'с'} •
                        ✨ +${p.xpGain} XP<br>
                        🎓 Вимога: ${p.xpRequired} XP<br>
                        <span style="color:var(--text2); font-size:10px;">${esc(p.desc)}</span>
                    </div>
                    <div class="job-xp-bar"><div class="job-xp-fill" style="width:${canChoose ? 100 : pct}%;"></div></div>
                    ${!isActive ? `<button class="btn" style="margin-top:8px; padding:8px;" ${canChoose ? '' : 'disabled'} onclick="chooseProfession('${p.id}')">${canChoose ? 'ОБРАТИ' : `ПОТРІБНО ${p.xpRequired} XP`}</button>` : ''}
                </div>`;
        }).join('');
    }

    window.chooseProfession = async function(jobId) {
        const prof = PROFESSIONS.find(p => p.id === jobId);
        if (!prof) return;
        if (extState.work.xp < prof.xpRequired) {
            showGN(`❌ Потрібно ${prof.xpRequired} XP`); return;
        }
        extState.work.jobId = jobId;
        await saveWorkState();
        showGN(`✅ Професія обрана: ${prof.icon} ${prof.name}`);
        renderWorkTab();
    };

    /* ── Mini-game overlay ── */
    function openMiniGameOverlay(html, css = '') {
        let ov = document.getElementById('work-minigame-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'work-minigame-overlay';
            ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:8000;display:flex;align-items:center;justify-content:center;padding:16px;';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';
        ov.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;">${html}</div>`;
        if (css) {
            let styleEl = document.getElementById('work-minigame-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'work-minigame-style';
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = css;
        }
    }
    function closeMiniGameOverlay() {
        const ov = document.getElementById('work-minigame-overlay');
        if (ov) ov.style.display = 'none';
    }

    function ensureProfessionSceneStyles() {
        if (document.getElementById('work-prof-scene-style')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'work-prof-scene-style';
        styleEl.textContent = `
            .work-prof-scene{
                position:relative;
                overflow:hidden;
                min-height:136px;
                margin:10px 0 14px;
                padding:14px 16px 12px;
                border-radius:18px;
                border:1px solid rgba(240,185,11,.25);
                background:
                    radial-gradient(circle at top right, rgba(240,185,11,.22), transparent 34%),
                    linear-gradient(135deg, rgba(30,32,38,.98), rgba(11,14,17,.98));
                box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 14px 34px rgba(0,0,0,.28);
            }
            .work-prof-scene::after{
                content:'';
                position:absolute;
                inset:-30% auto auto 72%;
                width:120px;
                height:120px;
                border-radius:50%;
                background:rgba(255,255,255,.06);
                filter:blur(8px);
            }
            .work-prof-scene-main{
                position:relative;
                z-index:1;
                display:flex;
                align-items:center;
                justify-content:center;
                width:88px;
                height:88px;
                margin:6px auto 10px;
                border-radius:24px;
                background:rgba(255,255,255,.06);
                border:1px solid rgba(255,255,255,.08);
                font-size:48px;
                animation:work-prof-bob 2.6s ease-in-out infinite;
            }
            .work-prof-scene-float{
                position:absolute;
                z-index:0;
                display:flex;
                align-items:center;
                justify-content:center;
                width:44px;
                height:44px;
                border-radius:14px;
                background:rgba(255,255,255,.05);
                color:#fff;
                font-size:22px;
                animation:work-prof-float 3.2s ease-in-out infinite;
                box-shadow:0 10px 20px rgba(0,0,0,.15);
            }
            .work-prof-scene-float.spin{ animation-name:work-prof-spin; animation-duration:5.8s; animation-timing-function:linear; }
            .work-prof-scene-caption{
                position:relative;
                z-index:1;
                text-align:center;
                color:var(--text2);
                font-size:12px;
                line-height:1.45;
            }
            @keyframes work-prof-bob {
                0%,100%{ transform:translateY(0) scale(1); }
                50%{ transform:translateY(-7px) scale(1.04); }
            }
            @keyframes work-prof-float {
                0%,100%{ transform:translateY(0) rotate(0deg); }
                50%{ transform:translateY(-10px) rotate(4deg); }
            }
            @keyframes work-prof-spin {
                from{ transform:rotate(0deg); }
                to{ transform:rotate(360deg); }
            }
            .work-tax-grid{
                display:grid;
                gap:8px;
                margin:12px 0;
            }
            .work-tax-card{
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                padding:10px 12px;
                border-radius:12px;
                background:#11151a;
                border:1px solid var(--border);
            }
        `;
        document.head.appendChild(styleEl);
    }

    function getProfessionScene(jobId, caption = '') {
        ensureProfessionSceneStyles();
        const scenes = {
            freelancer: { main: '💻', floats: ['📩', '🧾', '⭐'], caption: 'Нові замовлення прилітають щохвилини.' },
            programmer: { main: '🖥️', floats: ['</>', '0', '1'], caption: 'Код, логіка та швидкі рішення.' },
            designer: { main: '🎨', floats: ['🟡', '🔷', '✨'], caption: 'Форма, колір і креатив у русі.' },
            trader: { main: '📈', floats: ['💹', '🪙', '📊'], caption: 'Слідкуй за графіком і лови момент.' },
            doctor: { main: '🏥', floats: ['💊', '🩺', '❤️'], caption: 'Швидко постав діагноз і допоможи.' },
            pilot: { main: '✈️', floats: ['☁️', '🧭', '🌤️'], caption: 'Тримай курс і обходь перешкоди.' },
            engineer: { main: '⚙️', floats: ['🔩', '🛠️', '⚙️'], caption: 'Налаштуй механізм без помилок.' },
            chef: { main: '👨‍🍳', floats: ['🥕', '🍅', '🥦'], caption: 'Свіжі інгредієнти — головний секрет страви.' },
            tiler: { main: '🪟', floats: ['🧱', '📐', '✨'], caption: 'Підбери правильний візерунок до кладки.' },
            tax_agent: { main: '🏛️', floats: ['🏠', '🧾', '💰'], caption: 'Збір податків залежить від твоєї нерухомості.' },
            entrepreneur: { main: '🤵', floats: ['🏪', '📦', '💼'], caption: 'Бізнес любить влучні рішення.' }
        };
        const scene = scenes[jobId];
        if (!scene) return '';
        return `
            <div class="work-prof-scene">
                <div class="work-prof-scene-float" style="top:14px;left:16px;animation-delay:-0.4s;">${scene.floats[0] || '✨'}</div>
                <div class="work-prof-scene-float spin" style="top:22px;right:18px;">${scene.floats[1] || '⭐'}</div>
                <div class="work-prof-scene-float" style="left:24px;bottom:12px;animation-delay:-1.1s;">${scene.floats[2] || '💡'}</div>
                <div class="work-prof-scene-main">${scene.main}</div>
                <div class="work-prof-scene-caption">${caption || scene.caption}</div>
            </div>
        `;
    }

    let _workMiniGameState = {};

    window.doWork = async function() {
        if (getWorkCooldownRemaining() > 0) { showGN('⏳ Ще рано!'); return; }
        const u = getUser(); if (!u) return;
        const prof = getCurrentProfession();
        _workMiniGameState = { prof, u, penalties: 0, started: false };
        openWorkMiniGame(prof.id);
    };

    async function finishWork(penalties = 0, options = {}) {
        closeMiniGameOverlay();
        const { prof, u } = _workMiniGameState;
        if (!prof || !u) return;
        const rewardOverride = Number(options.rewardOverride);
        const baseReward = Number.isFinite(rewardOverride) ? rewardOverride : prof.reward;
        const penaltyAmount = Math.min(penalties * 0.10, baseReward * 0.5);
        const actualReward = Math.max(0.01, baseReward - penaltyAmount);
        extState.work.xp += prof.xpGain;
        extState.work.lastWorkAt = Date.now();
        extState.work.totalEarned = n(extState.work.totalEarned, 0) + actualReward;
        await saveWorkState();
        await adjustUsdt(u, actualReward);
        await appendBankRecord({
            type: 'work',
            currency: 'usdt',
            amount: actualReward,
            note: `${options.recordNote || `Робота: ${prof.name}`}${penalties > 0 ? ` (штраф -${penaltyAmount.toFixed(2)})` : ''}`,
            ts: Date.now()
        });
        await incrementWeeklyProgress(u, 'weeklyWorkCount');
        await incrementWeeklyProgress(u, 'weeklyUsdtEarned', actualReward);
        const msg = options.successMessage || (penalties > 0
            ? `💵 +${actualReward.toFixed(2)} USDT (штраф -${penaltyAmount.toFixed(2)} за ${penalties} помилок)`
            : `💵 +${actualReward.toFixed(2)} USDT за роботу ${prof.icon}`);
        showGN(msg);
        renderWorkTab();
        startWorkCooldownTick();
    }

    function openWorkMiniGame(jobId) {
        switch (jobId) {
            case 'programmer':   startProgrammerGame(); break;
            case 'designer':     startDesignerGame(); break;
            case 'trader':       startTraderGame(); break;
            case 'doctor':       startDoctorGame(); break;
            case 'pilot':        startPilotGame(); break;
            case 'engineer':     startEngineerGame(); break;
            case 'entrepreneur': startEntrepreneurGame(); break;
            case 'chef':         startChefGame(); break;
            case 'lawyer':       startLawyerGame(); break;
            case 'tiler':        startTilerGame(); break;
            case 'tax_agent':    startTaxAgentGame(); break;
            case 'freelancer':   startFreelancerGame(); break;
            default:             finishWork(0); break;
        }
    }

    /* ── PROGRAMMER: Even/Odd ── */
    function startProgrammerGame() {
        const ROUNDS = 8;
        // Mix of challenges: even/odd, prime, divisible-by-3, binary > decimal
        function genChallenge() {
            const type = Math.floor(Math.random() * 3);
            if (type === 0) {
                const n = Math.floor(Math.random() * 199) + 2;
                return {
                    display: n, label: 'ПАРНЕ чи НЕПАРНЕ?',
                    a: { text: '2️⃣ ПАРНЕ',  color: 'var(--g)', correct: n % 2 === 0 },
                    b: { text: '1️⃣ НЕПАРНЕ', color: 'var(--r)', correct: n % 2 !== 0 }
                };
            } else if (type === 1) {
                const n = Math.floor(Math.random() * 90) + 10;
                const isDiv3 = n % 3 === 0;
                return {
                    display: n, label: 'Ділиться на 3?',
                    a: { text: '✅ ТАК', color: 'var(--g)', correct: isDiv3 },
                    b: { text: '❌ НІ',  color: 'var(--r)', correct: !isDiv3 }
                };
            } else {
                // Show a small binary number up to 4 bits
                const n = Math.floor(Math.random() * 14) + 2;
                const bin = n.toString(2).padStart(4, '0');
                const isGt8 = n > 8;
                return {
                    display: `0b${bin}`, label: 'Це число > 8?',
                    a: { text: '📈 БІЛЬШЕ 8', color: 'var(--p)', correct: isGt8 },
                    b: { text: '📉 НЕ БІЛЬШЕ', color: '#555',     correct: !isGt8 }
                };
            }
        }
        const challenges = Array.from({ length: ROUNDS }, genChallenge);
        let idx = 0, errors = 0, streak = 0;
        function render() {
            if (idx >= ROUNDS) { finishWork(errors); return; }
            const ch = challenges[idx];
            openMiniGameOverlay(`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">🖥️ Програміст</span>
                    <span style="font-size:11px;color:var(--text2);">Рівень ${idx+1}/${ROUNDS} • ❌${errors} • 🔥${streak}</span>
                </div>
                ${getProfessionScene('programmer')}
                <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px 10px;text-align:center;margin-bottom:14px;font-family:'Courier New',monospace;">
                    <div style="font-size:52px;font-weight:900;color:#58a6ff;letter-spacing:2px;">${ch.display}</div>
                    <div style="font-size:13px;color:#8b949e;margin-top:6px;">${ch.label}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <button class="btn" id="mg-a-btn" style="background:${ch.a.color};color:#000;padding:16px;font-size:14px;">${ch.a.text}</button>
                    <button class="btn" id="mg-b-btn" style="background:${ch.b.color};color:${ch.b.color === '#555' ? '#fff' : '#000'};padding:16px;font-size:14px;">${ch.b.text}</button>
                </div>
            `);
            function pick(correct) {
                if (correct) { streak++; } else { errors++; streak = 0; }
                idx++;
                render();
            }
            document.getElementById('mg-a-btn').onclick = () => pick(ch.a.correct);
            document.getElementById('mg-b-btn').onclick = () => pick(ch.b.correct);
        }
        render();
    }

    /* ── DESIGNER: Visual color/shape matching ── */
    function startDesignerGame() {
        const ROUNDS = 5;
        const SHAPES  = ['circle','square','triangle','diamond','star'];
        const COLORS  = ['#F0B90B','#0ECB81','#F6465D','#3a7bd5','#e67e22','#9b59b6'];
        function genRound() {
            const s = SHAPES[Math.floor(Math.random()*SHAPES.length)];
            const c = COLORS[Math.floor(Math.random()*COLORS.length)];
            const wrongShapes = SHAPES.filter(x=>x!==s).sort(()=>Math.random()-.5).slice(0,2);
            const options = [{ shape:s, color:c }, ...wrongShapes.map(ws=>({ shape:ws, color:c }))].sort(()=>Math.random()-.5);
            return { shape:s, color:c, options };
        }
        const rounds = Array.from({ length: ROUNDS }, genRound);
        let idx = 0, errors = 0;
        const SHAPE_NAMES = { circle:'Коло', square:'Квадрат', triangle:'Трикутник', diamond:'Ромб', star:'Зірка' };
        function drawShape(ctx, shape, color, size=60) {
            ctx.fillStyle = color;
            const c = size/2;
            if (shape==='circle') { ctx.beginPath(); ctx.arc(c,c,c*.85,0,Math.PI*2); ctx.fill(); }
            else if (shape==='square') { const m=c*.15; ctx.fillRect(m,m,size-2*m,size-2*m); }
            else if (shape==='triangle') { ctx.beginPath(); ctx.moveTo(c,4); ctx.lineTo(size-4,size-4); ctx.lineTo(4,size-4); ctx.closePath(); ctx.fill(); }
            else if (shape==='diamond') { ctx.beginPath(); ctx.moveTo(c,4); ctx.lineTo(size-4,c); ctx.lineTo(c,size-4); ctx.lineTo(4,c); ctx.closePath(); ctx.fill(); }
            else if (shape==='star') {
                ctx.beginPath();
                for (let i=0;i<10;i++) {
                    const r = i%2===0 ? c*.85 : c*.4;
                    const a = (Math.PI/5)*i - Math.PI/2;
                    i===0 ? ctx.moveTo(c+r*Math.cos(a),c+r*Math.sin(a)) : ctx.lineTo(c+r*Math.cos(a),c+r*Math.sin(a));
                }
                ctx.closePath(); ctx.fill();
            }
        }
        function render() {
            if (idx >= ROUNDS) { finishWork(errors); return; }
            const round = rounds[idx];
            openMiniGameOverlay(`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">🎨 Дизайнер</span>
                    <span style="font-size:11px;color:var(--text2);">Замовлення ${idx+1}/${ROUNDS} • ❌${errors}</span>
                </div>
                ${getProfessionScene('designer')}
                <div style="text-align:center;margin-bottom:14px;">
                    <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Клієнт замовив:</div>
                    <canvas id="mg-target-canvas" width="80" height="80" style="display:inline-block;border-radius:8px;background:#111;"></canvas>
                    <div style="font-size:12px;color:var(--p);margin-top:4px;font-weight:700;">${SHAPE_NAMES[round.shape]}</div>
                </div>
                <div style="font-size:12px;color:var(--text2);text-align:center;margin-bottom:8px;">Знайди такий самий:</div>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                    ${round.options.map((opt,i)=>`<canvas id="mg-opt-${i}" width="70" height="70" style="border:2px solid var(--border);border-radius:8px;background:#111;cursor:pointer;" data-shape="${opt.shape}" data-correct="${opt.shape===round.shape}"></canvas>`).join('')}
                </div>
                <div id="mg-shape-msg" style="min-height:20px;text-align:center;margin-top:10px;font-size:13px;"></div>
            `);
            // Draw target
            const tCtx = document.getElementById('mg-target-canvas').getContext('2d');
            drawShape(tCtx, round.shape, round.color, 80);
            // Draw options
            round.options.forEach((opt, i) => {
                const c = document.getElementById(`mg-opt-${i}`);
                const ctx = c.getContext('2d');
                drawShape(ctx, opt.shape, round.color, 70);
                c.addEventListener('mouseenter', () => { c.style.borderColor = 'var(--p)'; });
                c.addEventListener('mouseleave', () => { if (c.style.borderColor !== 'var(--g)' && c.style.borderColor !== 'var(--r)') c.style.borderColor = 'var(--border)'; });
                c.addEventListener('click', () => {
                    document.querySelectorAll('[id^="mg-opt-"]').forEach(el => el.style.pointerEvents='none');
                    const correct = opt.shape === round.shape;
                    c.style.borderColor = correct ? 'var(--g)' : 'var(--r)';
                    const msg = document.getElementById('mg-shape-msg');
                    if (correct) { msg.style.color='var(--g)'; msg.textContent='✅ Молодець! Правильна форма!'; }
                    else { errors++; msg.style.color='var(--r)'; msg.textContent='❌ Не той варіант!'; }
                    setTimeout(() => { idx++; render(); }, 700);
                });
            });
        }
        render();
    }

    /* ── TRADER: Buy/Sell with mini chart ── */
    function startTraderGame() {
        const LEN = 9;
        function genPrices() {
            const arr = [10 + Math.floor(Math.random()*5)];
            for (let i=1;i<LEN;i++) arr.push(Math.max(5, Math.min(30, arr[i-1] + (Math.random()*4-2))));
            return arr.map(v=>Math.round(v*10)/10);
        }
        const prices = genPrices();
        let pos=2, trades=0, errors=0, holding=false, buyPrice=0;
        function render() {
            if (trades>=4) { finishWork(errors); return; }
            const current = prices[Math.min(pos, LEN-1)];
            const prev    = prices[Math.max(0, pos-1)];
            const trend   = current >= prev ? '📈' : '📉';
            const trendClr = current >= prev ? 'var(--g)' : 'var(--r)';
            // Mini ASCII spark chart
            const visible = prices.slice(Math.max(0,pos-5), pos+1);
            const mn=Math.min(...visible), mx=Math.max(...visible), rng=mx-mn||1;
            const bars=['▁','▂','▃','▄','▅','▆','▇','█'];
            const spark = visible.map(v=>bars[Math.min(7,Math.floor(((v-mn)/rng)*8))]).join('');
            openMiniGameOverlay(`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">📊 Трейдер</span>
                    <span style="font-size:11px;color:var(--text2);">Угод: ${trades}/4 • ❌${errors}</span>
                </div>
                ${getProfessionScene('trader')}
                <div style="background:#111;border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px;">
                        <span style="font-size:32px;font-weight:900;color:#fff;">$${current.toFixed(1)}</span>
                        <span style="font-size:20px;">${trend}</span>
                    </div>
                    <div style="font-family:monospace;font-size:22px;color:${trendClr};letter-spacing:2px;">${spark}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:4px;">Ціновий графік</div>
                    ${holding ? `<div style="margin-top:6px;font-size:12px;color:var(--g);">📌 Куплено за $${buyPrice.toFixed(1)} → ${current>buyPrice?'<span style="color:var(--g);">+прибуток</span>':'<span style="color:var(--r);">-збиток</span>'}</div>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                    <button class="btn" id="mg-buy-btn" style="background:var(--g);color:#000;" ${holding?'disabled':''}>🟢 КУПИТИ</button>
                    <button class="btn" id="mg-sell-btn" style="background:var(--r);color:#fff;" ${!holding?'disabled':''}>🔴 ПРОДАТИ</button>
                    <button class="btn" id="mg-next-btn" style="background:#333;color:#fff;">⏩ ДАЛІ</button>
                </div>
            `);
            document.getElementById('mg-buy-btn').onclick = () => { holding=true; buyPrice=current; pos=Math.min(pos+1,LEN-1); render(); };
            document.getElementById('mg-sell-btn').onclick = () => { if(current<buyPrice) errors++; holding=false; trades++; pos=Math.min(pos+1,LEN-1); render(); };
            document.getElementById('mg-next-btn').onclick = () => { pos=Math.min(pos+1,LEN-1); render(); };
        }
        render();
    }

    /* ── DOCTOR: Treat patients ── */
    function startDoctorGame() {
        const cases = [
            { icon:'🤒', symptom:'Температура 38.5°, кашель, нежить', correct:'💊 Парацетамол', options:['💊 Парацетамол','💉 Інсулін','🩺 Операція','🩹 Пластир'] },
            { icon:'🤕', symptom:'Сильний головний біль, світлочутливість', correct:'💊 Ібупрофен', options:['💉 Антибіотик','💊 Ібупрофен','🩹 Пластир','💊 Парацетамол'] },
            { icon:'🤢', symptom:'Нудота, блювота, болі в животі', correct:'💊 Церукал', options:['💊 Церукал','💊 Парацетамол','🩺 Операція','💉 Вітамін C'] },
            { icon:'🦴', symptom:'Перелом руки зі зміщенням', correct:'🩺 Операція', options:['💊 Ібупрофен','🩺 Операція','💉 Вітамін C','🩹 Пластир'] },
            { icon:'😴', symptom:'Хронічне безсоння, тривожність', correct:'💊 Седативне', options:['💊 Седативне','💉 Антибіотик','🩺 Операція','💊 Парацетамол'] }
        ];
        let idx=0, errors=0;
        function render() {
            if (idx>=cases.length) { finishWork(errors); return; }
            const c=cases[idx];
            const opts=[...c.options].sort(()=>Math.random()-.5);
            openMiniGameOverlay(`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">🏥 Лікар</span>
                    <span style="font-size:11px;color:var(--text2);">Пацієнт ${idx+1}/${cases.length} • ❌${errors}</span>
                </div>
                ${getProfessionScene('doctor')}
                <div style="background:#111;border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;text-align:center;">
                    <div style="font-size:52px;line-height:1;">${c.icon}</div>
                    <div style="font-size:13px;color:#fff;font-weight:700;margin-top:8px;">${c.symptom}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:4px;">Призначте лікування:</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${opts.map(opt=>`<button class="btn mg-opt-btn" data-val="${opt.replace(/"/g,'&quot;')}" style="padding:12px;font-size:12px;text-align:center;">${opt}</button>`).join('')}
                </div>
            `);
            document.querySelectorAll('.mg-opt-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.mg-opt-btn').forEach(b=>b.disabled=true);
                    const correct = btn.dataset.val === c.correct;
                    btn.style.background = correct ? 'var(--g)' : 'var(--r)';
                    if (!correct) { errors++; document.querySelectorAll('.mg-opt-btn').forEach(b=>{ if(b.dataset.val===c.correct) b.style.background='var(--g)'; }); }
                    setTimeout(()=>{ idx++; render(); }, 700);
                };
            });
        }
        render();
    }

    /* ── PILOT: Flappy-style ── */
    function startPilotGame() {
        openMiniGameOverlay(`
            <h3 style="color:var(--p);margin:0 0 4px;">✈️ Пілот</h3>
            <p style="color:var(--text2);font-size:12px;margin:0 0 8px;">Торкайтеся/клікайте, щоб летіти. Не врізайтесь у перешкоди!</p>
            ${getProfessionScene('pilot')}
            <canvas id="pilot-canvas" width="360" height="280" style="border-radius:10px;display:block;margin:0 auto;touch-action:none;"></canvas>
            <div id="pilot-status" style="text-align:center;color:var(--text2);font-size:12px;margin-top:8px;"></div>
        `);
        const canvas = document.getElementById('pilot-canvas');
        const ctx = canvas.getContext('2d');
        let gy = 140, vel = 0, score = 0, crashed = false, won = false;
        const obstacles = [{ x: 400, gapY: 80 + Math.random() * 120 }];
        let raf;
        function addObstacle() { obstacles.push({ x: 400, gapY: 60 + Math.random() * 160 }); }
        function jump() { if (!crashed && !won) vel = -5; }
        const onTouchStart = e => { e.preventDefault(); jump(); };
        canvas.addEventListener('click', jump);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        function cleanup() {
            cancelAnimationFrame(raf);
            canvas.removeEventListener('click', jump);
            canvas.removeEventListener('touchstart', onTouchStart);
        }
        function drawFrame() {
            ctx.fillStyle = '#0B0E11'; ctx.fillRect(0, 0, 360, 280);
            ctx.fillStyle = '#F0B90B'; ctx.fillRect(60, gy - 14, 28, 20);
            ctx.fillStyle = '#fff'; ctx.fillRect(80, gy - 12, 8, 8);
            obstacles.forEach(ob => {
                const gapH = 80;
                ctx.fillStyle = '#1E2026';
                ctx.strokeStyle = '#2B3139';
                ctx.lineWidth = 2;
                ctx.fillRect(ob.x, 0, 40, ob.gapY);
                ctx.strokeRect(ob.x, 0, 40, ob.gapY);
                ctx.fillRect(ob.x, ob.gapY + gapH, 40, 280);
                ctx.strokeRect(ob.x, ob.gapY + gapH, 40, 280);
            });
            ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
            ctx.fillText(`Відстань: ${score}м / 300м`, 8, 20);
            if (crashed) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 360, 280);
                ctx.fillStyle = '#F6465D'; ctx.font = 'bold 22px monospace';
                ctx.fillText('АВАРІЯ!', 130, 130);
                ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
                ctx.fillText('Повторіть спробу', 100, 155);
            }
            if (won) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 360, 280);
                ctx.fillStyle = '#0ECB81'; ctx.font = 'bold 20px monospace';
                ctx.fillText('МАРШРУТ ПРОЙДЕНО!', 60, 130);
            }
        }
        let frame = 0;
        function tick() {
            if (crashed || won) {
                drawFrame();
                if (crashed) {
                    document.getElementById('pilot-status').innerHTML = '<button id="pilot-retry" class="btn" style="margin:4px auto;display:block;width:auto;padding:8px 16px;">Спробувати знову</button><button id="pilot-quit" class="btn" style="margin:4px auto;display:block;width:auto;padding:8px 16px;background:#333;">Здатись (штраф)</button>';
                    document.getElementById('pilot-retry').onclick = () => { cleanup(); startPilotGame(); };
                    document.getElementById('pilot-quit').onclick = () => { cleanup(); finishWork(2); };
                } else {
                    setTimeout(() => { cleanup(); finishWork(0); }, 1500);
                }
                return;
            }
            frame++;
            vel += 0.35;
            gy += vel;
            obstacles.forEach(ob => { ob.x -= 3; });
            if (frame % 90 === 0) addObstacle();
            while (obstacles.length && obstacles[0].x < -50) obstacles.shift();
            const gapH = 80;
            for (const ob of obstacles) {
                if (ob.x < 90 && ob.x + 40 > 60) {
                    if (gy - 14 < ob.gapY || gy + 6 > ob.gapY + gapH) { crashed = true; break; }
                }
            }
            if (gy < 0 || gy > 280) crashed = true;
            if (!crashed) score = Math.min(300, Math.floor(frame * 0.5));
            if (score >= 300) won = true;
            drawFrame();
            raf = requestAnimationFrame(tick);
        }
        tick();
    }

    /* ── ENGINEER: Gear matching ── */
    function startEngineerGame() {
        const gears = [
            { size: 'Велика', speed: 'повільно', correct: 'Велика' },
            { size: 'Мала', speed: 'швидко', correct: 'Мала' },
            { size: 'Середня', speed: 'помірно', correct: 'Середня' }
        ];
        let idx = 0, errors = 0;
        function render() {
            if (idx >= gears.length) { finishWork(errors); return; }
            const g = gears[idx];
            openMiniGameOverlay(`
                <h3 style="color:var(--p);margin:0 0 4px;">⚙️ Інженер</h3>
                <p style="color:var(--text2);font-size:12px;margin:0 0 12px;">Механізм ${idx + 1}/${gears.length} • Помилки: ${errors}</p>
                ${getProfessionScene('engineer')}
                <div style="background:#111;border-radius:10px;padding:16px;text-align:center;margin-bottom:12px;">
                    <div style="font-size:1.2rem;">Механізм крутиться <b style="color:var(--p);">${g.speed}</b></div>
                    <div style="font-size:12px;color:var(--text2);margin-top:4px;">Яку шестерню підібрати?</div>
                </div>
                <div style="display:grid;gap:8px;">
                    ${['Велика', 'Середня', 'Мала'].map(s => `<button class="btn mg-gear-btn" data-size="${s}" style="padding:12px;">${s === 'Велика' ? '⚙️⚙️⚙️' : s === 'Середня' ? '⚙️⚙️' : '⚙️'} ${s} шестерня</button>`).join('')}
                </div>
            `);
            document.querySelectorAll('.mg-gear-btn').forEach(btn => {
                btn.onclick = () => {
                    if (btn.dataset.size !== g.correct) errors++;
                    idx++;
                    render();
                };
            });
        }
        render();
    }

    /* ── ENTREPRENEUR: Stock decisions ── */
    function startEntrepreneurGame() {
        const decisions = [
            { scenario: '📈 Курс криптовалюти зростає на 15%', correct: 'Купити акції крипто-бізнесу', options: ['Купити акції крипто-бізнесу', 'Продати всі активи', 'Взяти кредит'] },
            { scenario: '📉 Ринок нерухомості падає на 20%', correct: 'Почекати та спостерігати', options: ['Купити нерухомість зараз', 'Почекати та спостерігати', 'Продати наявне майно'] },
            { scenario: '💼 Новий конкурент відкрив магазин поряд', correct: 'Зробити акції та знижки', options: ['Зробити акції та знижки', 'Ігнорувати конкурента', 'Закрити бізнес'] }
        ];
        let idx = 0, errors = 0;
        function render() {
            if (idx >= decisions.length) { finishWork(errors); return; }
            const d = decisions[idx];
            const opts = [...d.options].sort(() => Math.random() - 0.5);
            openMiniGameOverlay(`
                <h3 style="color:var(--p);margin:0 0 4px;">🤵 Підприємець</h3>
                <p style="color:var(--text2);font-size:12px;margin:0 0 12px;">Рішення ${idx + 1}/${decisions.length} • Помилки: ${errors}</p>
                ${getProfessionScene('entrepreneur')}
                <div style="background:#111;border-radius:10px;padding:16px;margin-bottom:12px;">
                    <div style="font-size:1rem;">${d.scenario}</div>
                    <div style="font-size:12px;color:var(--text2);margin-top:4px;">Що робити?</div>
                </div>
                <div style="display:grid;gap:8px;">
                    ${opts.map(o => `<button class="btn mg-dec-btn" data-val="${o.replace(/"/g, '&quot;')}" style="padding:12px;text-align:left;font-size:12px;">${o}</button>`).join('')}
                </div>
            `);
            document.querySelectorAll('.mg-dec-btn').forEach(btn => {
                btn.onclick = () => {
                    if (btn.dataset.val !== d.correct) errors++;
                    idx++;
                    render();
                };
            });
        }
        render();
    }

    /* ── CHEF: Pick ripe food ── */
    /* ── CHEF: Animated vegetables slide across screen – tap/click FRESH ones ── */
    function startChefGame() {
        const ROUNDS = 3;
        let roundIdx = 0, errors = 0;

        // SVG-based vegetable/fruit art (no emojis, real styled images via inline SVG)
        const VEGGIES = [
            // { id, label, svgPath, fresh }
            { id:'tomato_f',  label:'Томат',    fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="34" r="22" fill="#e84040"/><ellipse cx="30" cy="34" rx="22" ry="22" fill="#e84040"/><path d="M22 18 Q30 10 38 18" fill="none" stroke="#2d7d2d" stroke-width="3"/><line x1="30" y1="10" x2="30" y2="18" stroke="#2d7d2d" stroke-width="3"/><ellipse cx="24" cy="30" rx="4" ry="6" fill="#f06060" opacity=".4"/></svg>` },
            { id:'tomato_r',  label:'Гнилий томат', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="34" r="22" fill="#7a3030"/><path d="M22 18 Q30 10 38 18" fill="none" stroke="#4d4d2d" stroke-width="3"/><line x1="30" y1="10" x2="30" y2="18" stroke="#4d4d2d" stroke-width="3"/><ellipse cx="36" cy="38" rx="7" ry="5" fill="#3a1010" opacity=".7"/><line x1="20" y1="28" x2="40" y2="44" stroke="#3a1010" stroke-width="2" opacity=".6"/></svg>` },
            { id:'apple_f',   label:'Яблуко',   fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="36" rx="20" ry="20" fill="#cc2222"/><path d="M30 14 Q36 6 44 10" fill="none" stroke="#4d7d2d" stroke-width="3"/><line x1="30" y1="14" x2="30" y2="20" stroke="#5d8d3d" stroke-width="2.5"/><ellipse cx="22" cy="30" rx="4" ry="7" fill="#dd4444" opacity=".4"/></svg>` },
            { id:'apple_r',   label:'Гниле яблуко', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="36" rx="20" ry="20" fill="#5a1f1f"/><path d="M30 14 Q36 6 44 10" fill="none" stroke="#3d5d1d" stroke-width="3"/><line x1="30" y1="14" x2="30" y2="20" stroke="#5d7d3d" stroke-width="2.5"/><ellipse cx="35" cy="40" rx="8" ry="6" fill="#2a0a0a" opacity=".8"/><path d="M22 30 Q30 38 38 30" fill="none" stroke="#1a0000" stroke-width="2"/></svg>` },
            { id:'carrot_f',  label:'Морква',   fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 15 L20 50 Q30 55 40 50 Z" fill="#f47c20"/><path d="M30 15 L28 10 M30 15 L26 8 M30 15 L32 8" stroke="#2d7d2d" stroke-width="2.5" fill="none"/><line x1="25" y1="28" x2="35" y2="28" stroke="#e06010" stroke-width="1.5" opacity=".5"/><line x1="23" y1="36" x2="37" y2="36" stroke="#e06010" stroke-width="1.5" opacity=".5"/></svg>` },
            { id:'carrot_r',  label:'Гнила морква', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 15 L20 50 Q30 55 40 50 Z" fill="#7a4010"/><path d="M30 15 L28 10 M30 15 L26 8 M30 15 L32 8" stroke="#3d4d1d" stroke-width="2.5" fill="none"/><ellipse cx="33" cy="38" rx="6" ry="8" fill="#3a1a00" opacity=".7"/></svg>` },
            { id:'broccoli_f',label:'Броколі',  fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="38" width="8" height="16" rx="3" fill="#5d8d3d"/><circle cx="30" cy="28" r="14" fill="#3d7d1d"/><circle cx="22" cy="26" r="8" fill="#4d8d2d"/><circle cx="38" cy="26" r="8" fill="#4d8d2d"/><circle cx="30" cy="20" r="8" fill="#5d9d3d"/></svg>` },
            { id:'broccoli_r',label:'Гнила броколі', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="38" width="8" height="16" rx="3" fill="#3d4d1d"/><circle cx="30" cy="28" r="14" fill="#2d4d0d"/><circle cx="22" cy="26" r="8" fill="#2a3a1a"/><circle cx="38" cy="26" r="8" fill="#2a3a1a"/><circle cx="30" cy="20" r="8" fill="#1a2d0a"/><ellipse cx="30" cy="26" rx="6" ry="5" fill="#0a1a02" opacity=".5"/></svg>` },
            { id:'cucumber_f',label:'Огірок',   fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="32" rx="12" ry="20" fill="#4aad2a"/><ellipse cx="30" cy="32" rx="8" ry="16" fill="#5dcc3d" opacity=".5"/><path d="M28 12 L30 8 L32 12" fill="#3d8d1d"/><line x1="20" y1="26" x2="40" y2="26" stroke="#3d8d1d" stroke-width="1" opacity=".4"/><line x1="18" y1="34" x2="42" y2="34" stroke="#3d8d1d" stroke-width="1" opacity=".4"/></svg>` },
            { id:'cucumber_r',label:'Гнилий огірок', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="32" rx="12" ry="20" fill="#2d5d1a"/><ellipse cx="32" cy="38" rx="7" ry="6" fill="#0d1d05" opacity=".8"/><path d="M28 12 L30 8 L32 12" fill="#1d3d0a"/></svg>` },
            { id:'pepper_f',  label:'Перець',   fresh:true,  svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 18 Q18 20 16 36 Q18 52 30 52 Q42 52 44 36 Q42 20 30 18Z" fill="#e82020"/><path d="M30 18 L32 10 L28 10" stroke="#3d7d1d" stroke-width="2.5" fill="none"/><ellipse cx="24" cy="32" rx="4" ry="8" fill="#f04040" opacity=".3"/></svg>` },
            { id:'pepper_r',  label:'Гнилий перець', fresh:false, svg:`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 18 Q18 20 16 36 Q18 52 30 52 Q42 52 44 36 Q42 20 30 18Z" fill="#6a1010"/><path d="M30 18 L32 10 L28 10" stroke="#2d4d0d" stroke-width="2.5" fill="none"/><ellipse cx="34" cy="40" rx="8" ry="7" fill="#1a0000" opacity=".8"/></svg>` },
        ];

        const ROUND_SETS = [
            // round 0: pick 3 fresh out of 6
            [ 'tomato_f','apple_r','carrot_f','broccoli_r','cucumber_f','pepper_r' ],
            // round 1: pick 2 fresh out of 5
            [ 'apple_f','tomato_r','carrot_r','pepper_f','cucumber_r' ],
            // round 2: pick 3 fresh out of 7
            [ 'tomato_f','apple_f','carrot_r','broccoli_f','cucumber_r','pepper_r','broccoli_r' ],
        ];

        const ov = document.getElementById('work-minigame-overlay') || (() => {
            const el = document.createElement('div');
            el.id = 'work-minigame-overlay';
            document.body.appendChild(el);
            return el;
        })();

        function playRound() {
            if (roundIdx >= ROUNDS) { ov.innerHTML = ''; ov.style.display = 'none'; finishWork(errors); return; }
            const ids = [...ROUND_SETS[roundIdx]].sort(() => Math.random() - 0.5);
            const items = ids.map(id => VEGGIES.find(v => v.id === id));
            const freshLeft = items.filter(v => v.fresh).length;
            let picked = 0;
            let localErrors = 0;

            // Build DOM
            ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0B0E11;display:flex;flex-direction:column;align-items:center;overflow:hidden;';
            ov.innerHTML = `
                <div style="padding:16px 20px;width:100%;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">👨‍🍳 Шеф-кухар</span>
                    <span style="color:var(--text2);font-size:12px;">Раунд ${roundIdx+1}/${ROUNDS} • Помилки: ${errors}</span>
                </div>
                <p style="color:var(--text2);font-size:13px;margin:0 0 6px;">Вибери <b style="color:var(--g);">свіжі</b> овочі! (<span id="chef-left">${freshLeft}</span> залишилось)</p>
                <div id="chef-table" style="position:relative;flex:1;width:100%;overflow:hidden;"></div>
                <div id="chef-msg" style="color:var(--r);font-size:13px;min-height:20px;margin-bottom:6px;"></div>
            `;

            const table = ov.querySelector('#chef-table');
            const msgEl = ov.querySelector('#chef-msg');
            const leftEl = ov.querySelector('#chef-left');
            let freshRemaining = freshLeft;

            // Animate each item sliding across the table
            items.forEach((item, i) => {
                const el = document.createElement('div');
                const size = 64;
                const topPct = 10 + (i * (80 / items.length));
                const delay = i * 0.6; // stagger
                const duration = 5 + Math.random() * 3; // 5-8s
                const fromRight = Math.random() > 0.5;
                el.style.cssText = `
                    position:absolute;
                    top:${topPct}%;
                    width:${size}px;height:${size}px;
                    cursor:pointer;
                    animation: chef-slide-${fromRight?'r':'l'} ${duration}s ${delay}s linear infinite;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
                    ${fromRight ? 'right:0;' : 'left:0;'}
                `;
                el.innerHTML = item.svg;
                el.dataset.fresh = item.fresh ? '1' : '0';
                el.dataset.label = item.label;

                el.addEventListener('click', () => {
                    if (el.dataset.done) return;
                    el.dataset.done = '1';
                    if (item.fresh) {
                        freshRemaining--;
                        leftEl.textContent = freshRemaining;
                        el.style.animation = 'none';
                        el.style.opacity = '0.3';
                        el.style.transform = 'scale(1.3)';
                        el.style.transition = 'all 0.3s';
                        msgEl.style.color = 'var(--g)';
                        msgEl.textContent = `✅ ${item.label} — свіжий!`;
                        if (freshRemaining <= 0) {
                            setTimeout(() => { roundIdx++; playRound(); }, 600);
                        }
                    } else {
                        errors++;
                        localErrors++;
                        el.style.animation = 'none';
                        el.style.opacity = '0.3';
                        el.style.border = '3px solid var(--r)';
                        el.style.borderRadius = '8px';
                        msgEl.style.color = 'var(--r)';
                        msgEl.textContent = `❌ ${item.label} — зіпсований! -1 помилка`;
                    }
                });
                table.appendChild(el);
            });
        }

        // Inject keyframes if not present
        if (!document.getElementById('chef-anim-style')) {
            const s = document.createElement('style');
            s.id = 'chef-anim-style';
            s.textContent = `
                @keyframes chef-slide-r { 0%{transform:translateX(110vw)} 100%{transform:translateX(-110vw)} }
                @keyframes chef-slide-l { 0%{transform:translateX(-110vw)} 100%{transform:translateX(110vw)} }
            `;
            document.head.appendChild(s);
        }

        playRound();
    }

    /* ── LAWYER: Legal quiz ── */
    function startLawyerGame() {
        const cases = [
            { situation: '👨‍💼 Клієнт підписав контракт не читаючи. Він каже, що умови несправедливі.', correct: 'Консультація та аналіз контракту', options: ['Одразу подати до суду', 'Консультація та аналіз контракту', 'Ігнорувати проблему'] },
            { situation: '🏠 Орендар не платить за квартиру 3 місяці.', correct: 'Надіслати офіційну претензію', options: ['Виселити фізично', 'Надіслати офіційну претензію', 'Знизити оренду'] },
            { situation: '🚗 Клієнт потрапив у ДТП. Другий водій тікає.', correct: 'Зафіксувати все та викликати поліцію', options: ['Догнати другого водія', 'Зафіксувати все та викликати поліцію', 'Самостійно вирішити суперечку'] },
            { situation: '💼 Роботодавець відмовляється виплачувати зарплату 2 місяці.', correct: 'Подати скаргу в інспекцію праці', options: ['Нічого не робити', 'Подати скаргу в інспекцію праці', 'Звільнитись без виплати'] },
            { situation: '🏗️ Сусід будує паркан на ділянці клієнта без дозволу.', correct: 'Підготувати заяву до суду про усунення перешкод', options: ['Самостійно зруйнувати паркан', 'Підготувати заяву до суду про усунення перешкод', 'Ігнорувати ситуацію'] },
            { situation: '📝 Клієнт уклав договір купівлі-продажу, але продавець не передає товар.', correct: 'Вимагати виконання договору або повернення коштів через суд', options: ['Забути про гроші', 'Вимагати виконання договору або повернення коштів через суд', 'Написати в соціальних мережах'] },
            { situation: '👶 Батьки розлучаються, не можуть домовитись про опіку над дитиною.', correct: 'Звернутись до суду для встановлення порядку виховання', options: ['Вирішити самостійно без будь-яких документів', 'Звернутись до суду для встановлення порядку виховання', 'Відмовитись від дитини'] },
            { situation: '🏦 Банк незаконно списав кошти з рахунку клієнта.', correct: 'Надіслати претензію до банку та звернутись до НБУ', options: ['Просто закрити рахунок', 'Надіслати претензію до банку та звернутись до НБУ', 'Нічого не робити'] },
            { situation: '🔑 Клієнт придбав квартиру, але продавець відмовляється виселятись.', correct: 'Підготувати позов про виселення в суд', options: ['Виселити силою', 'Підготувати позов про виселення в суд', 'Продати квартиру ще раз'] },
            { situation: '📱 Компанія незаконно використовує торгову марку клієнта.', correct: 'Надіслати претензію та подати позов про захист прав інтелектуальної власності', options: ['Змінити свою торгову марку', 'Надіслати претензію та подати позов про захист прав інтелектуальної власності', 'Написати у ЗМІ та чекати'] },
            { situation: '🚧 Клієнта незаконно затримала поліція без пояснення підстав.', correct: 'Вимагати адвоката та зафіксувати порушення прав', options: ['Підписати всі документи', 'Вимагати адвоката та зафіксувати порушення прав', 'Спробувати втекти'] },
            { situation: '💊 Лікар поставив неправильний діагноз, що завдало шкоди здоров\'ю клієнта.', correct: 'Зібрати докази та подати позов про відшкодування шкоди', options: ['Просто перейти до іншого лікаря', 'Зібрати докази та подати позов про відшкодування шкоди', 'Подати скаргу в соцмережах'] },
        ];
        // Pick 5 random cases
        const selected = [...cases].sort(() => Math.random() - 0.5).slice(0, 5);
        let idx = 0, errors = 0;
        function render() {
            if (idx >= selected.length) { finishWork(errors); return; }
            const c = selected[idx];
            const opts = [...c.options].sort(() => Math.random() - 0.5);
            openMiniGameOverlay(`
                <h3 style="color:var(--p);margin:0 0 4px;">⚖️ Юрист</h3>
                <p style="color:var(--text2);font-size:12px;margin:0 0 12px;">Справа ${idx + 1}/${selected.length} • Помилки: ${errors}</p>
                <div style="background:#111;border-radius:10px;padding:14px;margin-bottom:12px;font-size:13px;line-height:1.5;">
                    ${c.situation}
                </div>
                <p style="margin:0 0 8px;color:var(--text2);font-size:12px;">Яка правильна юридична дія?</p>
                <div style="display:grid;gap:8px;">
                    ${opts.map(o => `<button class="btn mg-law-btn" data-val="${o.replace(/"/g, '&quot;')}" style="padding:12px;text-align:left;font-size:12px;">${o}</button>`).join('')}
                </div>
            `);
            document.querySelectorAll('.mg-law-btn').forEach(btn => {
                btn.onclick = () => {
                    if (btn.dataset.val !== c.correct) errors++;
                    idx++;
                    render();
                };
            });
        }
        render();
    }

    /* ── TILER: Canvas pattern puzzle – pick the tile that matches the missing spot ── */
    function startTilerGame() {
        const ROUNDS = 3;
        let roundIdx = 0, errors = 0;

        // Pattern definitions: each is a function that draws on a canvas ctx
        const PATTERNS = [
            { id:'stripes_h', draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); ctx.strokeStyle='#000'; ctx.lineWidth=2; for(let i=0;i<s;i+=8){ctx.beginPath();ctx.moveTo(x,y+i);ctx.lineTo(x+s,y+i);ctx.stroke();} } },
            { id:'stripes_v', draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); ctx.strokeStyle='#000'; ctx.lineWidth=2; for(let i=0;i<s;i+=8){ctx.beginPath();ctx.moveTo(x+i,y);ctx.lineTo(x+i,y+s);ctx.stroke();} } },
            { id:'checker',   draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); const sq=12; for(let r=0;r*sq<s;r++)for(let co=0;co*sq<s;co++){if((r+co)%2===0){ctx.fillStyle='#000';ctx.fillRect(x+co*sq,y+r*sq,Math.min(sq,s-co*sq),Math.min(sq,s-r*sq));}} } },
            { id:'diagonal',  draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); ctx.strokeStyle='#000'; ctx.lineWidth=2; for(let i=-s;i<2*s;i+=10){ctx.beginPath();ctx.moveTo(x+i,y);ctx.lineTo(x+i+s,y+s);ctx.stroke();} } },
            { id:'dots',      draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); ctx.fillStyle='#000'; for(let r=6;r<s;r+=12)for(let co=6;co<s;co+=12){ctx.beginPath();ctx.arc(x+co,y+r,3,0,Math.PI*2);ctx.fill();} } },
            { id:'cross',     draw(ctx,x,y,s,c) { ctx.fillStyle=c; ctx.fillRect(x,y,s,s); ctx.strokeStyle='#000'; ctx.lineWidth=2; for(let r=0;r<s;r+=14)for(let co=0;co<s;co+=14){ctx.beginPath();ctx.moveTo(x+co+2,y+r+7);ctx.lineTo(x+co+12,y+r+7);ctx.moveTo(x+co+7,y+r+2);ctx.lineTo(x+co+7,y+r+12);ctx.stroke();} } },
        ];

        const COLORS = ['#3a7bd5','#e84040','#f0b90b','#3dbb6d','#9b59b6','#e67e22'];

        const GRID_COLS = 4, GRID_ROWS = 4;
        const TILE_SIZE = 56;

        function genRound() {
            // Build a 4x4 wall where all tiles share the same pattern
            const patIdx = Math.floor(Math.random() * PATTERNS.length);
            const colIdx = Math.floor(Math.random() * COLORS.length);
            // Missing tile position
            const missingRow = Math.floor(Math.random() * GRID_ROWS);
            const missingCol = Math.floor(Math.random() * GRID_COLS);
            // Three wrong patterns (different from correct)
            const wrongPats = PATTERNS.filter((_,i) => i !== patIdx)
                .sort(() => Math.random()-0.5).slice(0,3);
            return { patIdx, colIdx, missingRow, missingCol, wrongPats };
        }

        const ov = document.getElementById('work-minigame-overlay') || (() => {
            const el = document.createElement('div'); el.id='work-minigame-overlay';
            document.body.appendChild(el); return el;
        })();

        function playRound() {
            if (roundIdx >= ROUNDS) { ov.innerHTML=''; ov.style.display='none'; finishWork(errors); return; }
            const round = genRound();
            const { patIdx, colIdx, missingRow, missingCol, wrongPats } = round;
            const pat = PATTERNS[patIdx];
            const col = COLORS[colIdx];

            ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0B0E11;display:flex;flex-direction:column;align-items:center;padding:16px;box-sizing:border-box;overflow-y:auto;';
            ov.innerHTML = `
                <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">🪟 Плиточник</span>
                    <span style="color:var(--text2);font-size:12px;">Кладка ${roundIdx+1}/${ROUNDS} • Помилки: ${errors}</span>
                </div>
                ${getProfessionScene('tiler')}
                <p style="color:var(--text2);font-size:13px;margin:0 0 10px;text-align:center;">В стіні відсутня 1 плитка.<br>Підберіть плитку з <b style="color:var(--p);">правильним візерунком</b>:</p>
                <canvas id="tiler-wall" width="${GRID_COLS*TILE_SIZE}" height="${GRID_ROWS*TILE_SIZE}" style="border:2px solid var(--border);border-radius:8px;margin-bottom:14px;"></canvas>
                <p style="color:var(--text2);font-size:12px;margin:0 0 8px;">Виберіть потрібну плитку:</p>
                <div id="tiler-options" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;"></div>
                <div id="tiler-msg" style="min-height:20px;margin-top:10px;font-size:13px;"></div>
            `;

            // Draw the wall
            const wallCanvas = ov.querySelector('#tiler-wall');
            const ctx = wallCanvas.getContext('2d');
            for (let r=0; r<GRID_ROWS; r++) {
                for (let c=0; c<GRID_COLS; c++) {
                    const x = c*TILE_SIZE, y = r*TILE_SIZE;
                    if (r === missingRow && c === missingCol) {
                        // Empty slot
                        ctx.fillStyle = '#111';
                        ctx.fillRect(x,y,TILE_SIZE,TILE_SIZE);
                        ctx.strokeStyle = '#F0B90B';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([6,4]);
                        ctx.strokeRect(x+1,y+1,TILE_SIZE-2,TILE_SIZE-2);
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#F0B90B';
                        ctx.font = 'bold 18px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('?', x+TILE_SIZE/2, y+TILE_SIZE/2);
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'alphabetic';
                    } else {
                        pat.draw(ctx, x, y, TILE_SIZE, col);
                        ctx.strokeStyle = '#0B0E11';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x,y,TILE_SIZE,TILE_SIZE);
                    }
                }
            }

            // Build options: correct + 3 wrong patterns
            const options = [
                { patIdx, correct: true },
                ...wrongPats.map(wp => ({ patIdx: PATTERNS.indexOf(wp), correct: false }))
            ].sort(() => Math.random()-0.5);

            const optDiv = ov.querySelector('#tiler-options');
            const msgEl = ov.querySelector('#tiler-msg');

            options.forEach(opt => {
                const canvas = document.createElement('canvas');
                canvas.width = TILE_SIZE;
                canvas.height = TILE_SIZE;
                canvas.style.cssText = `cursor:pointer;border:2px solid var(--border);border-radius:6px;transition:border-color 0.2s;`;
                const octx = canvas.getContext('2d');
                PATTERNS[opt.patIdx].draw(octx, 0, 0, TILE_SIZE, col);
                canvas.addEventListener('mouseenter', () => { canvas.style.borderColor = 'var(--p)'; });
                canvas.addEventListener('mouseleave', () => { canvas.style.borderColor = 'var(--border)'; });
                canvas.addEventListener('click', () => {
                    optDiv.querySelectorAll('canvas').forEach(c => c.style.pointerEvents='none');
                    if (opt.correct) {
                        canvas.style.borderColor = 'var(--g)';
                        msgEl.style.color = 'var(--g)';
                        msgEl.textContent = '✅ Правильно! Плитка підходить!';
                        // Fill in the missing tile on the wall
                        pat.draw(ctx, missingCol*TILE_SIZE, missingRow*TILE_SIZE, TILE_SIZE, col);
                        ctx.strokeStyle = '#0B0E11'; ctx.lineWidth=1;
                        ctx.strokeRect(missingCol*TILE_SIZE, missingRow*TILE_SIZE, TILE_SIZE, TILE_SIZE);
                        setTimeout(() => { roundIdx++; playRound(); }, 800);
                    } else {
                        errors++;
                        canvas.style.borderColor = 'var(--r)';
                        msgEl.style.color = 'var(--r)';
                        msgEl.textContent = '❌ Не той візерунок! Спробуй ще.';
                        // Re-enable other canvases
                        optDiv.querySelectorAll('canvas').forEach(c => {
                            if (c !== canvas) c.style.pointerEvents='auto';
                        });
                    }
                });
                optDiv.appendChild(canvas);
            });
        }

        playRound();
    }

    /* ── TAX AGENT: Collect taxes from owned real estate ── */
    function startTaxAgentGame() {
        const TAX_AGENT_BASE_REWARD = 0.25;
        const TAX_AGENT_LEVEL_BONUS = 0.05;
        const TAX_AGENT_PRICE_FACTOR = 0.002;
        // Caps payout from one property so large late-game assets do not make the tax profession overpowered.
        const TAX_AGENT_PROPERTY_CAP = 2.5;
        const catalog = typeof realEstateCatalog === 'undefined' ? [] : realEstateCatalog;
        const state = typeof realEstateState === 'undefined' ? { properties: {} } : realEstateState;
        const ownedEntries = catalog
            .filter(definition => state.properties?.[definition.id])
            .map(definition => {
                const level = Math.max(1, n(state.properties[definition.id]?.level, 1));
                // Higher-level and more expensive properties bring a larger tax payment,
                // but each property is capped to keep the profession balanced.
                const taxAmount = Number(Math.min(
                    TAX_AGENT_PROPERTY_CAP,
                    TAX_AGENT_BASE_REWARD + (level * TAX_AGENT_LEVEL_BONUS) + (n(definition.price, 0) * TAX_AGENT_PRICE_FACTOR)
                ).toFixed(2));
                return { definition, level, taxAmount };
            });

        if (!ownedEntries.length) {
            openMiniGameOverlay(`
                <h3 style="color:var(--p);margin:0 0 4px;">🏛️ Податківець</h3>
                <p style="color:var(--text2);font-size:12px;margin:0 0 12px;">Без міні-гри — просто збір податків з кожної нерухомості.</p>
                ${getProfessionScene('tax_agent')}
                <div style="background:#111;border-radius:12px;padding:14px;margin-bottom:12px;font-size:13px;line-height:1.6;">
                    У тебе ще немає нерухомості, тож податки збирати поки що ні з чого.
                </div>
                <button class="btn" id="mg-tax-close" style="width:100%;">ЗРОЗУМІЛО</button>
            `);
            document.getElementById('mg-tax-close').onclick = closeMiniGameOverlay;
            return;
        }

        const totalReward = Number(ownedEntries.reduce((sum, entry) => sum + entry.taxAmount, 0).toFixed(2));
        openMiniGameOverlay(`
            <h3 style="color:var(--p);margin:0 0 4px;">🏛️ Податківець</h3>
            <p style="color:var(--text2);font-size:12px;margin:0 0 12px;">Тепер тут не міні-гра, а прямий збір податків з кожної нерухомості.</p>
            ${getProfessionScene('tax_agent', `У портфелі ${ownedEntries.length} обʼєкт(ів). Збери податки й заверши зміну.`)}
            <div class="work-tax-grid">
                ${ownedEntries.map(entry => `
                    <div class="work-tax-card">
                        <div>
                            <div style="font-weight:800;color:#fff;">${esc(entry.definition.icon)} ${esc(entry.definition.name)}</div>
                            <div style="font-size:12px;color:var(--text2);">Рівень ${entry.level}</div>
                        </div>
                        <div style="font-weight:900;color:var(--g);">+${entry.taxAmount.toFixed(2)} USDT</div>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:#111;border-radius:12px;padding:12px 14px;margin-bottom:12px;">
                <span style="color:var(--text2);font-size:12px;">Разом за зміну</span>
                <span style="font-size:20px;font-weight:900;color:var(--p);">+${totalReward.toFixed(2)} USDT</span>
            </div>
            <button class="btn" id="mg-tax-collect" style="width:100%;">СТЯГНУТИ ПОДАТКИ</button>
        `);
        document.getElementById('mg-tax-collect').onclick = () => {
            finishWork(0, {
                rewardOverride: totalReward,
                successMessage: `🏛️ Зібрано податки: +${totalReward.toFixed(2)} USDT з ${ownedEntries.length} об'єктів`,
                recordNote: 'Податки з нерухомості'
            });
        };
    }

    /* ── FREELANCER: Random job ── */
    function startFreelancerGame() {
        const gigs = [
            { icon:'🌐', task:'Клієнт просить лендинг — швидко й красиво!', correct:'🖥️ Верстка', options:['🖥️ Верстка','⚖️ Судовий позов','🏥 Діагностика','✈️ Пілот'] },
            { icon:'🎭', task:'Потрібно терміново намалювати банер для соцмереж.', correct:'🎨 Дизайн', options:['🎨 Дизайн','⚙️ Ремонт двигуна','🏛️ Податки','💊 Ліки'] },
            { icon:'🏗️', task:'Замовник хоче плитку на кухні.', correct:'🪟 Плитка', options:['🪟 Плитка','✈️ Рейс','📈 Торги','🩺 Операція'] },
            { icon:'🤖', task:'Потрібен Python скрипт для автоматизації.', correct:'🖥️ Верстка', options:['🖥️ Верстка','⚖️ Юриспруденція','👨‍🍳 Рецепт','🚗 Авто'] },
            { icon:'📱', task:'Клієнт хоче адаптивний сайт під мобільний.', correct:'🎨 Дизайн', options:['🎨 Дизайн','🏥 Медицина','🪟 Плитка','⚙️ Інженерія'] }
        ];
        let idx=0, errors=0;
        function render() {
            if (idx>=gigs.length) { finishWork(errors); return; }
            const gig=gigs[idx];
            const opts=[...gig.options].sort(()=>Math.random()-.5);
            openMiniGameOverlay(`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--p);font-size:15px;font-weight:900;">💻 Фрілансер</span>
                    <span style="font-size:11px;color:var(--text2);">Замовлення ${idx+1}/${gigs.length} • ❌${errors}</span>
                </div>
                ${getProfessionScene('freelancer')}
                <div style="background:#111;border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;text-align:center;">
                    <div style="font-size:44px;line-height:1.1;">${gig.icon}</div>
                    <div style="font-size:14px;color:#fff;font-weight:700;margin-top:8px;">${gig.task}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:4px;">Оберіть потрібний навик:</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${opts.map(opt=>`<button class="btn mg-free-btn" data-val="${opt.replace(/"/g,'&quot;')}" style="padding:12px;font-size:12px;">${opt}</button>`).join('')}
                </div>
            `);
            document.querySelectorAll('.mg-free-btn').forEach(btn=>{
                btn.onclick=()=>{
                    document.querySelectorAll('.mg-free-btn').forEach(b=>b.disabled=true);
                    const correct=btn.dataset.val===gig.correct;
                    btn.style.background=correct?'var(--g)':'var(--r)';
                    if(!correct){ errors++; document.querySelectorAll('.mg-free-btn').forEach(b=>{ if(b.dataset.val===gig.correct) b.style.background='var(--g)'; }); }
                    setTimeout(()=>{ idx++; render(); }, 700);
                };
            });
        }
        render();
    }

    function startWorkCooldownTick() {
        if (extState.workCooldownTimer) clearInterval(extState.workCooldownTimer);
        extState.workCooldownTimer = setInterval(() => {
            if (!getUser()) { clearInterval(extState.workCooldownTimer); return; }
            renderWorkTab();
            if (getWorkCooldownRemaining() <= 0) clearInterval(extState.workCooldownTimer);
        }, 1000);
    }

    /* ────────────────────────────────────────────────────── */
    /*  BANK SYSTEM                                           */
    /* ────────────────────────────────────────────────────── */
    const LOAN_RATE           = 0.05;   // 5% per week
    const LOAN_PENALTY        = 0.20;   // 20% penalty
    const BASE_BB_LOAN_LIMIT  = 500;
    const BASE_USDT_LOAN_LIMIT = 200;
    const BB_LOAN_LIMIT_STEP  = 250;
    const USDT_LOAN_LIMIT_STEP = 100;
    const BANK_HISTORY_LIMIT  = 200;
    const BANK_STATS_ALL_WINDOW = 20;

    function getBankLoanCount(items = extState.bank.history) {
        return items.reduce((count, entry) => count + (entry?.type === 'loan' ? 1 : 0), 0);
    }

    function getLoanLimits(extraLoans = 0, loanCount = getBankLoanCount()) {
        const creditLevel = Math.max(0, loanCount + extraLoans);
        return {
            bb: BASE_BB_LOAN_LIMIT + (creditLevel * BB_LOAN_LIMIT_STEP),
            usdt: BASE_USDT_LOAN_LIMIT + (creditLevel * USDT_LOAN_LIMIT_STEP),
            level: creditLevel + 1
        };
    }

    function getCurrencyTotals(items, type, amountSelector = entry => n(entry.amount)) {
        return items
            .filter(entry => entry?.type === type)
            .reduce((acc, entry) => {
                const currency = entry.currency === 'usdt' ? 'usdt' : 'bb';
                acc[currency] += amountSelector(entry);
                return acc;
            }, { bb: 0, usdt: 0 });
    }

    function formatBankValue(bbValue, usdtValue, bbDigits = 2, usdtDigits = 2) {
        return `<span style="display:block;">BB ${n(bbValue).toFixed(bbDigits)}</span><span style="display:block; color:#26A17B;">USDT ${n(usdtValue).toFixed(usdtDigits)}</span>`;
    }

    function getLoanIssuedAmount(entry) {
        return n(entry?.issuedAmount ?? entry?.amount);
    }

    async function loadBankData() {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/bankData`).once('value');
        const raw = snap.val() || {};
        extState.bank.loans = raw.loans || {};
        extState.bank.history = Object.values(raw.history || {}).sort((a, b) => n(b.ts) - n(a.ts));
        extState.bank.bootstrapped = true;
        await checkOverdueLoans();
    }

    async function saveBankData() {
        const u = getUser(); if (!u) return;
        const histObj = {};
        extState.bank.history.forEach(h => { histObj[h.id || uid('bh')] = h; });
        await db().ref(`users/${u}/bankData`).set({ loans: extState.bank.loans, history: histObj });
    }

    async function appendBankRecord(entry) {
        if (!extState.bank.bootstrapped) return;
        const id = uid('bh');
        extState.bank.history.unshift({ id, ...entry });
        if (extState.bank.history.length > BANK_HISTORY_LIMIT) extState.bank.history = extState.bank.history.slice(0, BANK_HISTORY_LIMIT);
        await saveBankData();
    }

    window.recordBankHistoryEntry = async function(entry = {}) {
        const u = getUser();
        if (!u) return false;
        if (!extState.bank.bootstrapped) await loadBankData();
        const normalized = {
            type: entry.type || 'other',
            currency: entry.currency === 'usdt' ? 'usdt' : 'bb',
            amount: Math.max(0, n(entry.amount)),
            note: String(entry.note || 'Операція'),
            ts: n(entry.ts, Date.now()),
            meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : null
        };
        await appendBankRecord(normalized);
        if (document.getElementById('bank-panel-history')?.classList.contains('active')) window.renderBankHistory();
        if (document.getElementById('bank-panel-stats')?.classList.contains('active')) window.renderBankStats();
        return true;
    };

    async function checkOverdueLoans() {
        const u = getUser(); if (!u) return;
        const now = Date.now();
        const today = dateKey(now);
        let changed = false;
        for (const lid of Object.keys(extState.bank.loans)) {
            const loan = extState.bank.loans[lid];
            if (loan.status !== 'active') continue;
            if (now <= loan.dueAt) continue;
            if (loan.lastPenaltyDate !== today) {
                const penalty = round2(loan.remaining * LOAN_PENALTY);
                loan.remaining = round2(loan.remaining + penalty);
                loan.lastPenaltyDate = today;
                await appendBankRecord({
                    type: 'penalty',
                    currency: loan.currency,
                    amount: penalty,
                    note: `Щоденний штраф по кредиту #${lid.slice(-4)}`,
                    ts: now
                });
                showGN(`⚠️ Щоденний штраф: +${penalty.toFixed(2)} ${loan.currency.toUpperCase()} по кредиту`);
                changed = true;
            }
            if (loan.lastAutoRepayDate !== today) {
                const paid = await autoRepayLoan(lid, null, 'Щоденне авто-списання');
                loan.lastAutoRepayDate = today;
                if (paid <= 0) {
                    await appendBankRecord({
                        type: 'repay_attempt',
                        currency: loan.currency,
                        amount: 0,
                        note: `Авто-списання по кредиту #${lid.slice(-4)} не виконано (недостатньо коштів)`,
                        ts: now
                    });
                }
                changed = true;
            }
        }
        if (changed) await saveBankData();
    }

    async function autoRepayLoan(lid, maxAmount = null, notePrefix = 'Авто-погашення') {
        const u = getUser(); if (!u) return;
        const loan = extState.bank.loans[lid];
        if (!loan || loan.status !== 'active') return 0;
        const maxAllowed = maxAmount == null ? loan.remaining : maxAmount;
        const amount = Math.max(0, Math.min(n(loan.remaining, 0), n(maxAllowed, 0)));
        if (amount <= 0) return 0;
        let paid = 0;
        if (loan.currency === 'bb') {
            const available = getBalance();
            paid = Math.min(available, amount);
            if (paid <= 0) return 0;
            const r = await adjustUserBalanceFirebase(u, -paid);
            if (!r?.success) return 0;
            if (typeof gameState !== 'undefined') gameState.balance = r.balance;
        } else {
            const cur = await loadUsdt(u);
            paid = Math.min(cur, amount);
            if (paid <= 0) return 0;
            await saveUsdt(u, cur - paid);
        }
        loan.remaining = Math.max(0, round2(loan.remaining - paid));
        if (loan.remaining <= 0) {
            loan.status = 'repaid';
            loan.repaidAt = Date.now();
        }
        await appendBankRecord({
            type: 'repay',
            currency: loan.currency,
            amount: paid,
            note: `${notePrefix} кредиту #${lid.slice(-4)}${loan.status === 'repaid' ? ' (повністю)' : ' (частково)'}`,
            ts: Date.now()
        });
        showGN(`✅ ${notePrefix}: -${paid.toFixed(2)} ${loan.currency.toUpperCase()}${loan.status === 'repaid' ? ' (кредит закрито)' : ''}`);
        if (typeof updateHeader === 'function') updateHeader();
        return paid;
    }

    window.takeLoan = async function() {
        if (!extState.bank.bootstrapped) await loadBankData();
        const u = getUser(); if (!u) { showGN('❌ Не залогінено'); return; }
        const currency = document.getElementById('loan-currency')?.value || 'bb';
        const amount   = n(document.getElementById('loan-amount')?.value, 0);
        const dateStr  = document.getElementById('loan-return-date')?.value;
        const limits = getLoanLimits(0);

        if (amount <= 0) { showGN('❌ Вкажіть суму'); return; }
        const limit = currency === 'bb' ? limits.bb : limits.usdt;
        if (amount > limit) { showGN(`❌ Ліміт: ${limit} ${currency.toUpperCase()}`); return; }
        if (!dateStr) { showGN('❌ Оберіть дату повернення'); return; }
        const dueAt = new Date(dateStr).getTime();
        if (dueAt <= Date.now()) { showGN('❌ Дата повинна бути в майбутньому'); return; }

        // Check existing debt limit
        const totalDebt = Object.values(extState.bank.loans)
            .filter(l => l.status === 'active' && l.currency === currency)
            .reduce((s, l) => s + n(l.remaining), 0);
        if (totalDebt + amount > limit) { showGN(`❌ Перевищено ліміт. Борг: ${totalDebt.toFixed(2)}`); return; }

        const weeks = Math.max(1, Math.ceil((dueAt - Date.now()) / (7 * 24 * 3600 * 1000)));
        const totalDue = Math.round(amount * (1 + LOAN_RATE * weeks) * 100) / 100;
        const lid = uid('loan');
        extState.bank.loans[lid] = { currency, amount, remaining: totalDue, dueAt, weeks, rate: LOAN_RATE, status: 'active', takenAt: Date.now(), penaltyApplied: false };
        await saveBankData();

        if (currency === 'bb') {
            const r = await adjustUserBalanceFirebase(u, amount);
            if (r?.success && typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        } else {
            await adjustUsdt(u, amount);
        }
        await appendBankRecord({ type: 'loan', currency, amount: totalDue, issuedAmount: amount, note: `Кредит: ${amount.toFixed(2)} ${currency.toUpperCase()} → погасити ${totalDue.toFixed(2)}`, ts: Date.now() });
        showGN(`✅ Отримано ${amount.toFixed(2)} ${currency.toUpperCase()}! Погасити: ${totalDue.toFixed(2)}`);
        renderBankTab();
    };

    window.repayLoan = async function(lid) {
        if (!extState.bank.bootstrapped) await loadBankData();
        const u = getUser(); if (!u) return;
        const loan = extState.bank.loans[lid];
        if (!loan || loan.status !== 'active') { showGN('Кредит не активний'); return; }
        const amount = loan.remaining;
        if (loan.currency === 'bb') {
            if (getBalance() < amount) { showGN(`❌ Не вистачає BB. Борг: ${amount.toFixed(4)}`); return; }
            const r = await adjustUserBalanceFirebase(u, -amount);
            if (!r?.success) { showGN('❌ Помилка списання'); return; }
            if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        } else {
            const cur = await loadUsdt(u);
            if (cur < amount) { showGN(`❌ Не вистачає USDT. Борг: ${amount.toFixed(2)}`); return; }
            await saveUsdt(u, cur - amount);
        }
        loan.status = 'repaid';
        loan.repaidAt = Date.now();
        await appendBankRecord({ type: 'repay', currency: loan.currency, amount, note: `Погашення кредиту #${lid.slice(-4)}`, ts: Date.now() });
        showGN(`✅ Кредит погашено! -${amount.toFixed(2)} ${loan.currency.toUpperCase()}`);
        renderBankTab();
    };

    window.switchBankTab = function(panel) {
        document.querySelectorAll('.bank-subtab').forEach(t => {
            const key = panel === 'loans' ? 'кредит' : panel === 'history' ? 'історі' : panel === 'taxes' ? 'податк' : 'статистик';
            t.classList.toggle('active', t.textContent.toLowerCase().includes(key));
        });
        document.querySelectorAll('.bank-panel').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(`bank-panel-${panel}`);
        if (el) el.classList.add('active');
        if (panel === 'history') renderBankHistory();
        if (panel === 'stats')   renderBankStats();
        if (panel === 'taxes')   renderTaxNotifications();
    };

    function renderBankTab() {
        const loans = Object.entries(extState.bank.loans || {}).filter(([, l]) => l.status === 'active');
        const limits = getLoanLimits(0);
        const nextLimits = getLoanLimits(1);
        const countEl = document.getElementById('bank-active-loans-count');
        if (countEl) countEl.textContent = loans.length;
        const debtEl = document.getElementById('bank-total-debt');
        if (debtEl) {
            const total = loans.reduce((s, [, l]) => s + n(l.remaining), 0);
            debtEl.textContent = `${total.toFixed(2)}`;
        }
        const bbLimitEl = document.getElementById('bank-bb-limit');
        if (bbLimitEl) {
            bbLimitEl.innerHTML = `${limits.bb.toFixed(0)} BB<span class="bank-upgrade-note">наступний: ${nextLimits.bb.toFixed(0)} BB</span>`;
        }
        const usdtLimitEl = document.getElementById('bank-usdt-limit');
        if (usdtLimitEl) {
            usdtLimitEl.innerHTML = `${limits.usdt.toFixed(0)} USDT<span class="bank-upgrade-note">наступний: ${nextLimits.usdt.toFixed(0)} USDT</span>`;
        }
        const listEl = document.getElementById('active-loans-list');
        if (!listEl) return;
        if (!loans.length) { listEl.innerHTML = '<div style="color:var(--text2); font-size:13px; text-align:center; padding:12px;">Немає активних кредитів</div>'; return; }
        const now = Date.now();
        listEl.innerHTML = loans.map(([lid, loan]) => {
            const overdue = now > loan.dueAt;
            const dueDate = new Date(loan.dueAt).toLocaleDateString('uk-UA');
            return `<div class="loan-card ${overdue ? 'overdue' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <b style="color:${overdue ? 'var(--r)' : 'var(--p)'};">${loan.currency.toUpperCase()} кредит</b>
                        ${overdue ? '<span class="pill sell" style="margin-left:6px;">ПРОСТРОЧЕНО</span>' : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:15px; font-weight:900; color:${overdue ? 'var(--r)' : 'var(--gold)'};">${n(loan.remaining).toFixed(2)}</div>
                        <div style="font-size:10px; color:var(--text2);">залишок</div>
                    </div>
                </div>
                <div style="font-size:11px; color:var(--text2);">
                    Взято: ${n(loan.amount).toFixed(2)} • Відсоток: ${(loan.rate * 100).toFixed(0)}%/тиж •
                    Дата: <b style="color:${overdue ? 'var(--r)' : 'var(--text)'};">${dueDate}</b>
                </div>
                <button class="btn" style="margin-top:8px; padding:8px; font-size:11px;" onclick="repayLoan('${esc(lid)}')">💳 ПОГАСИТИ ${n(loan.remaining).toFixed(2)} ${loan.currency.toUpperCase()}</button>
            </div>`;
        }).join('');
    }

    /* ── TAX NOTIFICATION SYSTEM ──
       Generates a tax bill every 2 real days based on the player's real estate.
       Bills are stored in Firebase and shown in Bank → Податки tab.
       Each bill has a "Pay" button that deducts the amount from the player's balance.
    ── */
    const TAX_INTERVAL_MS      = 2 * 24 * 60 * 60 * 1000; // 2 real-world days (not game time)
    // Balance target: a single level-1 apartment should stay around 0.44 USDT, while large upgraded portfolios
    // should generate clearly heavier recurring taxes from property count, value, and level.
    const TAX_BILL_BASE        = 0.12;   // flat tax per owned property
    const TAX_LEVEL_EXPONENT   = 1.25;   // levels grow faster than linearly so upgraded estates get taxed harder
    const TAX_LEVEL_FACTOR     = 0.28;   // progressive extra tax from property level
    const TAX_PRICE_FACTOR     = 0.0020; // property market value contribution to tax amount
    const TAX_COUNT_FACTOR     = 0.10;   // multiplier increase per extra property
    const TAX_PORTFOLIO_FACTOR = 0.00012; // total estate portfolio multiplier based on overall value

    function getTaxablePropertyValue(definition, level) {
        const basePrice = Math.max(0, n(definition?.price, 0));
        const upgradeBase = Math.max(0, n(definition?.upgradeBase, 0));
        return basePrice + (upgradeBase * Math.max(0, level - 1));
    }

    function calcTaxBillAmount() {
        const catalog = typeof realEstateCatalog === 'undefined' ? [] : realEstateCatalog;
        const state   = typeof realEstateState   === 'undefined' ? { properties: {} } : realEstateState;
        const ownedProperties = catalog.filter(def => !!state.properties?.[def.id]);
        if (!ownedProperties.length) return 0;
        let total = 0;
        let portfolioValue = 0;
        ownedProperties.forEach(def => {
            const level = Math.max(1, n(state.properties[def.id]?.level, 1));
            const propertyValue = getTaxablePropertyValue(def, level);
            portfolioValue += propertyValue;
            total += TAX_BILL_BASE + (Math.pow(level, TAX_LEVEL_EXPONENT) * TAX_LEVEL_FACTOR) + (propertyValue * TAX_PRICE_FACTOR);
        });
        const quantityMultiplier = 1 + Math.max(0, ownedProperties.length - 1) * TAX_COUNT_FACTOR;
        const portfolioMultiplier = 1 + (portfolioValue * TAX_PORTFOLIO_FACTOR);
        return Math.round(total * quantityMultiplier * portfolioMultiplier * 100) / 100;
    }

    async function checkAndGenerateTaxBill() {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/taxBills`).once('value');
        const bills = snap.val() || {};
        const now = Date.now();
        const lastBillTs = Object.values(bills).reduce((mx, b) => Math.max(mx, n(b.createdAt)), 0);
        if (now - lastBillTs < TAX_INTERVAL_MS) return; // too soon

        const amount = calcTaxBillAmount();
        if (amount <= 0) return;
        const billId = uid('tax');
        const bill = {
            id: billId,
            amount,
            currency: 'usdt',
            status: 'pending',
            createdAt: now,
            dueAt: now + TAX_INTERVAL_MS,
            note: `Податок на нерухомість (${new Date(now).toLocaleDateString('uk-UA')})`
        };
        await db().ref(`users/${u}/taxBills/${billId}`).set(bill);

        // Show a toast notification
        showGameNotification(`🏛️ Нове податкове повідомлення: ${amount.toFixed(2)} USDT`);

        // Badge the bank taxes tab
        const badge = document.getElementById('bank-taxes-badge');
        if (badge) { badge.style.display = 'block'; badge.textContent = `⚠️ Є несплачені податки!`; }
        const taxTab = document.getElementById('bank-taxes-tab');
        if (taxTab && !taxTab.querySelector('.tax-badge')) {
            const dot = document.createElement('span');
            dot.className = 'tax-badge';
            dot.style.cssText = 'display:inline-block;width:8px;height:8px;background:var(--r);border-radius:50%;margin-left:4px;vertical-align:middle;';
            taxTab.appendChild(dot);
        }
    }

    async function loadTaxBills() {
        const u = getUser(); if (!u) return [];
        const snap = await db().ref(`users/${u}/taxBills`).once('value');
        return Object.values(snap.val() || {}).sort((a, b) => n(b.createdAt) - n(a.createdAt));
    }

    window.payTaxBill = async function(billId) {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/taxBills/${billId}`).once('value');
        const bill = snap.val();
        if (!bill || bill.status !== 'pending') { showGameNotification('❌ Рахунок вже сплачено або не знайдено'); return; }

        const currentUsdt = await loadUsdt(u);
        if (currentUsdt < bill.amount) {
            showGameNotification(`❌ Недостатньо USDT! Потрібно ${bill.amount.toFixed(2)}, є ${currentUsdt.toFixed(2)}`);
            return;
        }
        await adjustUsdt(u, -bill.amount);
        await db().ref(`users/${u}/taxBills/${billId}/status`).set('paid');
        await appendBankRecord({ type: 'tax', currency: 'usdt', amount: bill.amount, note: bill.note, ts: Date.now() });
        showGameNotification(`✅ Податок ${bill.amount.toFixed(2)} USDT сплачено!`);
        renderTaxNotifications();
    };

    function renderTaxNotifications() {
        const listEl = document.getElementById('bank-taxes-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;text-align:center;padding:20px;">⏳ Завантаження...</div>';
        loadTaxBills().then(bills => {
            const badge = document.getElementById('bank-taxes-badge');
            const pending = bills.filter(b => b.status === 'pending');
            if (badge) {
                if (pending.length) { badge.style.display = 'block'; badge.textContent = `⚠️ Несплачено рахунків: ${pending.length}`; }
                else badge.style.display = 'none';
            }
            // Clear dot badge if no pending
            if (!pending.length) {
                const taxTab = document.getElementById('bank-taxes-tab');
                taxTab?.querySelector('.tax-badge')?.remove();
            }
            if (!bills.length) {
                listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;text-align:center;padding:20px;">Податкових повідомлень поки немає.<br>Вони надходять кожні 2 дні.</div>';
                return;
            }
            listEl.innerHTML = bills.map(b => {
                const isPending = b.status === 'pending';
                const overdue   = isPending && Date.now() > n(b.dueAt);
                const dueDate   = new Date(n(b.dueAt)).toLocaleDateString('uk-UA');
                return `<div style="background:var(--card);border:1px solid ${isPending ? (overdue ? 'var(--r)' : 'rgba(240,185,11,0.4)') : 'var(--border)'};border-radius:14px;padding:14px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                        <div style="display:flex;gap:10px;align-items:center;">
                            <span style="font-size:28px;">🏛️</span>
                            <div>
                                <div style="font-weight:800;font-size:13px;color:${isPending ? 'var(--p)' : 'var(--text2)'};">${esc(b.note)}</div>
                                <div style="font-size:11px;color:var(--text2);">Термін: ${dueDate}${overdue ? ' <b style="color:var(--r);">ПРОСТРОЧЕНО</b>' : ''}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:18px;font-weight:900;color:${isPending ? 'var(--r)' : 'var(--text2)'};">${n(b.amount).toFixed(2)} USDT</div>
                            <div style="font-size:11px;color:${isPending ? 'var(--g)' : 'var(--text2)'};">${isPending ? '⏳ Очікує оплати' : '✅ Сплачено'}</div>
                        </div>
                    </div>
                    ${isPending ? `<button class="btn" style="padding:10px;font-size:12px;" onclick="payTaxBill('${esc(b.id)}')">💳 ОПЛАТИТИ ${n(b.amount).toFixed(2)} USDT</button>` : ''}
                </div>`;
            }).join('');
        });
    }

    window.renderBankHistory = function() {
        const listEl = document.getElementById('bank-history-list');
        if (!listEl) return;
        const search = (document.getElementById('bank-history-search')?.value || '').toLowerCase();
        const filter = document.getElementById('bank-history-filter')?.value || 'all';
        const items = extState.bank.history.filter(h => {
            if (filter !== 'all' && h.type !== filter) return false;
            if (search && !String(h.note || '').toLowerCase().includes(search)) return false;
            return true;
        });
        if (!items.length) { listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;">Немає записів</div>'; return; }
        listEl.innerHTML = items.slice(0, 50).map(h => {
            const isIncome = h.type === 'loan' || h.type === 'work' || h.type === 'market_sell';
            const marketMeta = h.meta && (h.type === 'market_buy' || h.type === 'market_sell') ? h.meta : null;
            const marketDetails = marketMeta ? `<div class="transaction-meta" style="margin-top:4px;"><span>Пара: ${(marketMeta.pair || '—')}</span><span>Курс: ${n(marketMeta.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT</span></div><div class="transaction-meta"><span>Кількість: ${n(marketMeta.quantity).toFixed(6)}</span><span>${h.type === 'market_buy' ? 'Сплачено' : 'Отримано'}: ${n(marketMeta.total).toFixed(2)} USDT</span></div>` : '';
            return `<div class="transaction-item">
                <div class="transaction-head">
                    <div><b style="font-size:12px;">${esc(h.note || h.type)}</b></div>
                    <span class="transaction-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${n(h.amount).toFixed(2)} ${(h.currency || 'bb').toUpperCase()}</span>
                </div>
                <div class="transaction-meta"><span>${new Date(n(h.ts, Date.now())).toLocaleString('uk-UA')}</span></div>
                ${marketDetails}
            </div>`;
        }).join('');
    };

    window.renderBankStats = function() {
        const statsEl = document.getElementById('bank-stats-grid');
        const chartEl = document.getElementById('bank-stats-chart');
        const period = document.getElementById('bank-stats-period')?.value || '7';
        const isAllPeriod = period === 'all';
        const days = isAllPeriod ? 0 : n(period, 7);
        const since = isAllPeriod ? 0 : Date.now() - days * 24 * 3600 * 1000;
        const items = extState.bank.history.filter(h => n(h.ts, 0) >= since);
        const loanCountAll = getBankLoanCount();
        const currentLimits = getLoanLimits(0, loanCountAll);
        const nextLimits = getLoanLimits(1, loanCountAll);
        const loanCount = items.filter(h => h?.type === 'loan').length;
        const repaidCount = items.filter(h => h?.type === 'repay').length;
        const penaltyCount = items.filter(h => h?.type === 'penalty').length;
        const activeDebt = Object.values(extState.bank.loans || {}).reduce((acc, loan) => {
            if (loan?.status !== 'active') return acc;
            const currency = loan.currency === 'usdt' ? 'usdt' : 'bb';
            acc[currency] += n(loan.remaining);
            return acc;
        }, { bb: 0, usdt: 0 });
        const issuedTotals = getCurrencyTotals(items, 'loan', getLoanIssuedAmount);
        const repaidTotals = getCurrencyTotals(items, 'repay');
        const penaltyTotals = getCurrencyTotals(items, 'penalty');
        const totalWork = items.filter(h => h?.type === 'work').reduce((s, h) => s + n(h.amount), 0);

        if (statsEl) statsEl.innerHTML = [
            ['Видано кредитів', `${loanCount}`, `рівень ліміту ${currentLimits.level}`],
            ['Погашено / штрафи', `${repaidCount} / ${penaltyCount}`, 'кількість операцій'],
            ['Поточний ліміт', formatBankValue(currentLimits.bb, currentLimits.usdt, 0, 0), 'доступно зараз'],
            ['Наступний ліміт', formatBankValue(nextLimits.bb, nextLimits.usdt, 0, 0), 'після нового кредиту'],
            ['Видано за період', formatBankValue(issuedTotals.bb, issuedTotals.usdt)],
            ['Активний борг', formatBankValue(activeDebt.bb, activeDebt.usdt)],
            ['Погашено за період', formatBankValue(repaidTotals.bb, repaidTotals.usdt)],
            ['Штрафи / робота', formatBankValue(penaltyTotals.bb, penaltyTotals.usdt), `робота: ${totalWork.toFixed(2)} USDT`]
        ].map(([label, val, note = '']) => `<div class="market-stat"><div class="market-stat-label">${label}</div><div class="market-stat-value">${val}</div>${note ? `<div class="bank-upgrade-note">${note}</div>` : ''}</div>`).join('');

        if (!chartEl) return;
        const activityItems = items.filter(h => h?.type === 'loan' || h?.type === 'repay' || h?.type === 'penalty');
        if (!activityItems.length) {
            chartEl.innerHTML = '<div style="color:var(--text2); font-size:12px;">Немає даних для статистики банку</div>';
            return;
        }

        const currencyCards = ['bb', 'usdt'].map(currency => {
            const perDay = {};
            activityItems.filter(h => (h.currency || 'bb') === currency).forEach(entry => {
                const key = dateKey(n(entry.ts));
                if (!perDay[key]) perDay[key] = { loan: 0, repay: 0, penalty: 0 };
                const amount = entry.type === 'loan' ? getLoanIssuedAmount(entry) : n(entry.amount);
                perDay[key][entry.type] += amount;
            });
            const chartWindowSize = isAllPeriod ? BANK_STATS_ALL_WINDOW : Math.max(days, 7);
            const rows = Object.entries(perDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-chartWindowSize);
            if (!rows.length) {
                return `<div class="bank-chart-card"><div class="bank-chart-title">${currency === 'bb' ? 'BB Coin' : 'USDT'}</div><div style="color:var(--text2); font-size:12px;">Немає операцій</div></div>`;
            }
            const max = Math.max(...rows.flatMap(([, values]) => [values.loan, values.repay, values.penalty]), 1);
            return `<div class="bank-chart-card">
                <div class="bank-chart-title">
                    <span>${currency === 'bb' ? 'BB Coin' : 'USDT'}</span>
                    <span style="font-size:10px; color:${currency === 'bb' ? 'var(--p)' : '#26A17B'};">макс. ${max.toFixed(2)}</span>
                </div>
                <div class="bank-chart-legend">
                    <span><i style="background:rgba(14,203,129,0.95);"></i> Видано</span>
                    <span><i style="background:rgba(240,185,11,0.95);"></i> Погашено</span>
                    <span><i style="background:rgba(246,70,93,0.95);"></i> Штрафи</span>
                </div>
                ${rows.map(([day, values]) => `
                    <div class="bank-chart-row">
                        <div class="bank-chart-day">${day.slice(5)}</div>
                        <div class="bank-chart-bars">
                            <div class="bank-chart-bar loan" style="height:${Math.max(4, Math.round((values.loan / max) * 44))}px;"></div>
                            <div class="bank-chart-bar repay" style="height:${Math.max(4, Math.round((values.repay / max) * 44))}px;"></div>
                            <div class="bank-chart-bar penalty" style="height:${Math.max(4, Math.round((values.penalty / max) * 44))}px;"></div>
                        </div>
                        <div class="bank-chart-values">+${values.loan.toFixed(2)}<br>-${values.repay.toFixed(2)}<br>⚠ ${values.penalty.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>`;
        }).join('');

        chartEl.innerHTML = `<div class="bank-chart-stack">${currencyCards}</div>`;
    };

    /* ────────────────────────────────────────────────────── */
    /*  MINES GAME                                            */
    /* ────────────────────────────────────────────────────── */
    const minesState = { active: false, mines: [], revealed: [], bet: 0 };

    window.initMinesGame = function() {
        if (!minesState.active) renderMinesGrid(false);
    };

    window.startMinesGame = async function() {
        const bet = n(document.getElementById('mines-bet')?.value, 0);
        if (bet <= 0) { showGN('❌ Вкажіть ставку'); return; }
        if (bet > getBalance()) { showGN('❌ Недостатньо BB'); return; }

        minesState.bet = bet;
        minesState.active = true;
        minesState.revealed = Array(9).fill(false);

        // place 3 random mines
        const positions = Array.from({length: 9}, (_, i) => i);
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        minesState.mines = positions.slice(0, 3);

        // deduct bet
        if (typeof adjustUserBalanceFirebase === 'function') {
            const r = await adjustUserBalanceFirebase(getUser(), -bet);
            if (!r?.success) { showGN('❌ Помилка списання'); minesState.active = false; return; }
            if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        } else {
            if (typeof gameState !== 'undefined') { gameState.balance -= bet; updateHeader(); }
        }

        document.getElementById('mines-start-btn').disabled = true;
        document.getElementById('mines-bet').disabled = true;
        document.getElementById('mines-result').textContent = '';
        document.getElementById('mines-status').textContent = `💎 Відкрий всі 6 алмазів, уникаючи 3 мін! Ставка: ${bet.toFixed(4)} BB`;
        renderMinesGrid(true);
    };

    window.minesReveal = async function(index) {
        if (!minesState.active) return;
        if (minesState.revealed[index]) return;
        minesState.revealed[index] = true;

        const cells = document.querySelectorAll('.mine-cell');
        if (!cells[index]) return;

        if (minesState.mines.includes(index)) {
            // Boom! lose
            cells[index].textContent = '💥';
            cells[index].classList.add('revealed-mine');
            minesState.active = false;
            // show all mines
            minesState.mines.forEach(mi => {
                if (mi !== index && cells[mi]) { cells[mi].textContent = '💣'; cells[mi].classList.add('revealed-mine'); }
            });
            document.querySelectorAll('.mine-cell').forEach(c => c.setAttribute('disabled', 'true'));
            document.getElementById('mines-result').innerHTML = `<span style="color:var(--r);">💥 МІНА! Ставку ${minesState.bet.toFixed(4)} BB знято!</span>`;
            document.getElementById('mines-status').textContent = '';
            document.getElementById('mines-start-btn').disabled = false;
            document.getElementById('mines-bet').disabled = false;
        } else {
            cells[index].textContent = '💎';
            cells[index].classList.add('revealed-gem');
            const revealed = minesState.revealed.filter((r, i) => r && !minesState.mines.includes(i)).length;
            if (revealed === 6) {
                // WIN! x10
                minesState.active = false;
                const win = minesState.bet * 10;
                if (typeof adjustUserBalanceFirebase === 'function') {
                    const r = await adjustUserBalanceFirebase(getUser(), win);
                    if (r?.success && typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
                } else if (typeof gameState !== 'undefined') {
                    gameState.balance += win; updateHeader();
                }
                document.querySelectorAll('.mine-cell').forEach(c => c.setAttribute('disabled', 'true'));
                document.getElementById('mines-result').innerHTML = `<span style="color:var(--g);">💎 ДЖЕКПОТ! +${win.toFixed(4)} BB (x10)!</span>`;
                document.getElementById('mines-status').textContent = '';
                document.getElementById('mines-start-btn').disabled = false;
                document.getElementById('mines-bet').disabled = false;
                showGN(`🎉 Міни! Виграш x10: +${win.toFixed(4)} BB!`);
            } else {
                document.getElementById('mines-status').textContent = `💎 ${revealed}/6 алмазів відкрито`;
            }
        }
    };

    function renderMinesGrid(clickable) {
        const grid = document.getElementById('mines-grid');
        if (!grid) return;
        grid.innerHTML = Array.from({length: 9}, (_, i) => {
            const rev = minesState.revealed[i];
            const isMine = minesState.mines.includes(i);
            let icon = '❓', cls = '';
            if (rev) { icon = isMine ? '💣' : '💎'; cls = isMine ? 'revealed-mine' : 'revealed-gem'; }
            const dis = !clickable || !minesState.active || rev ? 'disabled' : '';
            return `<button class="mine-cell ${cls}" ${dis} onclick="minesReveal(${i})">${icon}</button>`;
        }).join('');
    }

    /* ────────────────────────────────────────────────────── */
    /*  TOURNAMENT RPS                                        */
    /* ────────────────────────────────────────────────────── */
    const MAX_PLAYERS = 16;
    const tournamentState = { activeTournamentId: null, myMatchId: null, chatGroupId: null, drawPromptKey: null };
    let _tourneyListenerRef = null;
    let _tourneyListenerTid = null;
    let _startWatcherRef = null;
    let _startWatcherTid = null;

    function formatPlayerList(players) {
        return Object.keys(players || {}).map(p => esc(p)).join(' • ');
    }

    function cleanupTournamentListener() {
        if (_tourneyListenerRef) {
            _tourneyListenerRef.off('value');
            _tourneyListenerRef = null;
            _tourneyListenerTid = null;
        }
    }

    function cleanupTournamentChatListener() {
        if (!tournamentState.chatGroupId || typeof removeGroupChatListener !== 'function') return;
        removeGroupChatListener(tournamentState.chatGroupId);
        tournamentState.chatGroupId = null;
    }

    /* ── Mystery Box prize table + top-3 rarity mapping ── */
    const TOURNAMENT_TOP3_BOX_RARITY = { '1': 'legendary', '2': 'epic', '3': 'rare' };
    const MYSTERY_BOX_PRIZES = [
        // ── RARE (3rd place) ──────────────────────────────────────────
        { type: 'coins', label: '25 BB Монет',          amount: 25,  rarity: 'rare',      weight: 20 },
        { type: 'coins', label: '50 BB Монет',          amount: 50,  rarity: 'rare',      weight: 18 },
        { type: 'coins', label: '100 BB Монет',         amount: 100, rarity: 'rare',      weight: 12 },
        { type: 'usdt',  label: '1 USDT',               amount: 1,   rarity: 'rare',      weight: 20 },
        { type: 'usdt',  label: '2 USDT',               amount: 2,   rarity: 'rare',      weight: 10 },
        { type: 'frame', label: 'Неонова рамка',        itemId: 'frame_neon',    rarity: 'rare',      weight: 10 },
        { type: 'frame', label: 'Червона рамка',        itemId: 'frame_red',     rarity: 'rare',      weight: 8 },
        { type: 'bg',    label: 'Фон Космос',           itemId: 'bg_space',      rarity: 'rare',      weight: 8 },
        { type: 'bg',    label: 'Фіолетова галактика',  itemId: 'bg_purple',     rarity: 'rare',      weight: 7 },
        { type: 'bg',    label: 'Захід сонця (фон)',    itemId: 'bg_sunset',     rarity: 'rare',      weight: 7 },
        // ── EPIC (2nd place) ─────────────────────────────────────────
        { type: 'coins', label: '250 BB Монет',         amount: 250, rarity: 'epic',      weight: 16 },
        { type: 'coins', label: '500 BB Монет',         amount: 500, rarity: 'epic',      weight: 8 },
        { type: 'usdt',  label: '3 USDT',               amount: 3,   rarity: 'epic',      weight: 14 },
        { type: 'usdt',  label: '5 USDT',               amount: 5,   rarity: 'epic',      weight: 8 },
        { type: 'frame', label: 'Золота рамка',         itemId: 'frame_gold',    rarity: 'epic',      weight: 12 },
        { type: 'frame', label: 'Кіберпанк рамка',     itemId: 'frame_cyan',    rarity: 'epic',      weight: 10 },
        { type: 'frame', label: 'Обсидіанова рамка',   itemId: 'frame_obsidian',rarity: 'epic',      weight: 8 },
        { type: 'bg',    label: 'Неоновий Мегаполіс',  itemId: 'bg_neon',       rarity: 'epic',      weight: 10 },
        { type: 'bg',    label: 'Крипто темрява (фон)', itemId: 'bg_crypto',    rarity: 'epic',      weight: 8 },
        { type: 'bg',    label: 'Матриця (фон)',        itemId: 'bg_matrix',     rarity: 'epic',      weight: 8 },
        { type: 'title', label: 'Титул "ІНВЕСТОР"',    itemId: 'title_investor', rarity: 'epic',     weight: 10 },
        { type: 'title', label: 'Титул "КРИПТО БОС"',  itemId: 'title_boss',    rarity: 'epic',      weight: 8 },
        // ── LEGENDARY (1st place) ────────────────────────────────────
        { type: 'coins', label: '1000 BB Монет',        amount: 1000, rarity: 'legendary', weight: 14 },
        { type: 'coins', label: '2500 BB Монет',        amount: 2500, rarity: 'legendary', weight: 6 },
        { type: 'usdt',  label: '10 USDT',              amount: 10,   rarity: 'legendary', weight: 12 },
        { type: 'usdt',  label: '25 USDT',              amount: 25,   rarity: 'legendary', weight: 5 },
        { type: 'frame', label: 'Діамантова рамка',     itemId: 'frame_diamond', rarity: 'legendary', weight: 14 },
        { type: 'frame', label: 'Binance рамка',        itemId: 'frame_binance', rarity: 'legendary', weight: 12 },
        { type: 'bg',    label: 'Лава (фон)',           itemId: 'bg_lava',       rarity: 'legendary', weight: 12 },
        { type: 'bg',    label: 'Кібер-Океан (фон)',    itemId: 'bg_ocean',      rarity: 'legendary', weight: 10 },
        { type: 'title', label: 'Титул "КИТ"',         itemId: 'title_whale',   rarity: 'legendary', weight: 12 },
        { type: 'title', label: 'Титул "ДІАМАНТ"',     itemId: 'title_diamond', rarity: 'legendary', weight: 10 },
        { type: 'title', label: 'Титул "ЛЕГЕНДА"',     itemId: 'title_legend',  rarity: 'legendary', weight: 8 },
    ];

    function pickPrize(rarity = null) {
        const pool = rarity
            ? MYSTERY_BOX_PRIZES.filter(p => p.rarity === rarity)
            : MYSTERY_BOX_PRIZES;
        const source = pool.length ? pool : MYSTERY_BOX_PRIZES;
        const total = source.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total;
        for (const p of source) { r -= p.weight; if (r <= 0) return p; }
        return source[0];
    }

    async function awardMysteryBox(username, options = {}) {
        const rarity = options?.rarity || null;
        const prize = pickPrize(rarity);
        if (prize.type === 'coins') {
            await db().ref(`users/${username}/balance`).transaction(v => n(v, 0) + prize.amount);
        } else if (prize.type === 'usdt') {
            await db().ref(`users/${username}/usdt`).transaction(v => parseFloat((n(v, 0) + prize.amount).toFixed(2)));
        } else {
            // frame, bg, title → add to shopData.owned
            await db().ref(`users/${username}/shopData/owned`).transaction(owned => {
                const arr = Array.isArray(owned) ? [...owned] : [];
                if (!arr.includes(prize.itemId)) arr.push(prize.itemId);
                return arr;
            });
        }
        await db().ref(`users/${username}/pendingMysteryBox`).set({
            prize,
            awardedAt: Date.now(),
            tournamentId: options?.tournamentId || null,
            place: options?.place || null
        });
        return prize;
    }

    async function checkPendingMysteryBox() {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/pendingMysteryBox`).once('value');
        const box = snap.val();
        if (!box) return;
        await db().ref(`users/${u}/pendingMysteryBox`).remove();
        showMysteryBoxReveal(box.prize, box.place);
    }

    function showMysteryBoxReveal(prize, place = null) {
        const existing = document.getElementById('mystery-box-overlay');
        if (existing) existing.remove();
        const placeText = ['1', '2', '3'].includes(String(place)) ? ` за ${place} місце` : '';
        const ov = document.createElement('div');
        ov.id = 'mystery-box-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;';
        const typeIcons = { coins: '🪙', usdt: '💵', frame: '🖼️', bg: '🎨', title: '👑' };
        ov.innerHTML = `
            <div style="text-align:center;">
                <div class="loot-open-anim revealed" style="font-size:5rem;">🎁</div>
                <div style="font-size:20px;font-weight:900;color:var(--gold);margin:16px 0 8px;">🏆 ВИ ВИГРАЛИ ТУРНІР!</div>
                <div style="font-size:13px;color:var(--text2);margin-bottom:20px;">Ваш приз — Містері Бокс${placeText}</div>
                <div style="font-size:3rem;margin:12px 0;">${typeIcons[prize.type] || '🎁'}</div>
                <div style="font-size:22px;font-weight:900;color:var(--p);margin-bottom:6px;">${esc(prize.label)}</div>
                <button class="btn" style="margin-top:16px;background:var(--gold);color:#000;padding:12px 32px;font-size:14px;" onclick="document.getElementById('mystery-box-overlay').remove()">ЗАБРАТИ 🎉</button>
            </div>`;
        document.body.appendChild(ov);
        if (prize.type === 'coins' && typeof gameState !== 'undefined') {
            gameState.balance = (gameState.balance || 0) + prize.amount;
            if (typeof updateHeader === 'function') updateHeader();
        } else if (prize.type === 'usdt' && typeof gameState !== 'undefined') {
            gameState.usdt = parseFloat(((gameState.usdt || 0) + prize.amount).toFixed(2));
            if (typeof updateHeader === 'function') updateHeader();
        }
    }

    /* ── Normalize Firebase bracket (object → array) ── */
    function normalizeBracket(bracket) {
        if (!bracket) return [];
        const toArr = o => Array.isArray(o) ? o : Object.keys(o).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(k => o[k]);
        return toArr(bracket).map(round => toArr(round).map(m => m || {}));
    }

    function openTournamentRoom(tid) {
        if (!tid) return;
        const nav = document.querySelector('nav');
        if (nav) nav.style.display = '';
        if (typeof switchTab === 'function') switchTab(3);
        if (typeof switchCasinoTab === 'function') switchCasinoTab('tournament');
        viewTournamentBracket(tid);
    }

    window.createTournament = async function() {
        const u = getUser(); if (!u) { showGN('❌ Не залогінено'); return; }
        const name = document.getElementById('tournament-name-input')?.value.trim();
        const pass = document.getElementById('tournament-pass-input')?.value.trim();
        if (!name) { showGN('❌ Введіть назву'); return; }
        const tid = uid('tour');
        const tournamentData = {
            id: tid, name: esc(name), password: pass || '',
            host: u, status: 'waiting',
            players: { [u]: { name: u, joinedAt: Date.now() } },
            createdAt: Date.now()
        };
        await db().ref(`tournaments/${tid}`).set(tournamentData);
        await ensureTournamentGroupChat(tid, tournamentData, [u]);
        tournamentState.activeTournamentId = tid;
        // Save to user profile so we can recover on page reload
        await db().ref(`users/${u}/activeTournamentId`).set(tid);
        showGN(`✅ Турнір "${name}" створено!`);
        document.getElementById('tournament-name-input').value = '';
        document.getElementById('tournament-pass-input').value = '';
        watchTournamentStart(tid);
        openTournamentRoom(tid);
    };

    window.loadTournaments = async function(skipAutoOpen = false) {
        const u = getUser();
        const listEl = document.getElementById('tournament-list');
        if (!listEl) return;

        // First check if this user has an active tournament they should be watching
        if (u && !skipAutoOpen) {
            const activeTidSnap = await db().ref(`users/${u}/activeTournamentId`).once('value');
            const activeTid = activeTidSnap.val();
            if (activeTid) {
                const tSnap = await db().ref(`tournaments/${activeTid}`).once('value');
                const t = tSnap.val();
                if (t && t.players?.[u] && (t.status === 'waiting' || t.status === 'active')) {
                    viewTournamentBracket(activeTid);
                    return;
                } else if (!t || t.status === 'completed' || t.status === 'cancelled') {
                    // Stale reference — clean up
                    await db().ref(`users/${u}/activeTournamentId`).remove();
                } else if (t && t.status === 'waiting') {
                    // Still waiting — make sure we are watching for start
                    watchTournamentStart(activeTid);
                }
            }
        }

        const snap = await db().ref('tournaments').orderByChild('status').equalTo('waiting').limitToLast(20).once('value');
        const raw = snap.val() || {};
        const tours = Object.values(raw).sort((a, b) => n(b.createdAt) - n(a.createdAt));
        if (!tours.length) { listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;">Немає відкритих турнірів</div>'; return; }
        listEl.innerHTML = tours.map(t => {
            const pCount = Object.keys(t.players || {}).length;
            const hasPass = !!t.password;
            const isHost = t.host === getUser();
            const joined = !!(t.players || {})[getUser()];
            const playerNames = formatPlayerList(t.players);
            return `<div class="tournament-item ${isHost || joined ? 'my-tournament' : ''}">
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:900; color:var(--p);">${esc(t.name)}</div>
                    <div style="font-size:11px; color:var(--text2);">Хост: ${esc(t.host)} • ${pCount}/${MAX_PLAYERS} ${hasPass ? '🔒' : ''}</div>
                    <div style="font-size:10px; color:#555; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">👥 ${playerNames}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    ${!joined && pCount < MAX_PLAYERS ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto;" onclick="joinTournament('${esc(t.id)}', ${hasPass})">ПРИЄДНАТИСЬ</button>` : ''}
                    ${(isHost || joined) && pCount >= 2 ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto; background:var(--g); color:#000;" onclick="viewTournamentBracket('${esc(t.id)}')">СІТКА</button>` : ''}
                    ${isHost && t.status === 'waiting' ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto; background:var(--gold); color:#000;" onclick="startTournament('${esc(t.id)}')">СТАРТ</button>` : ''}
                </div>
            </div>`;
        }).join('');
        // Show mystery box if winner just returned to lobby
        checkPendingMysteryBox();
    };

    window.joinTournament = async function(tid, hasPass) {
        const u = getUser(); if (!u) return;
        let pass = '';
        if (hasPass) { pass = prompt('Введіть пароль турніру:') || ''; }
        const tx = await db().ref(`tournaments/${tid}`).transaction(current => {
            if (current === null) return null;
            if (current.status !== 'waiting') return;
            if (current.password && current.password !== pass) return;
            const players = current.players && typeof current.players === 'object' ? current.players : {};
            if (!players[u] && Object.keys(players).length >= MAX_PLAYERS) return;
            players[u] = players[u] || { name: u, joinedAt: Date.now() };
            current.players = players;
            return current;
        });
        const t = tx.snapshot.val();
        if (!tx.committed || !t) {
            showGN('❌ Неможливо приєднатися (турнір вже стартував/заповнений/пароль невірний)');
            return;
        }
        showGN(`✅ Ви приєдналися до турніру "${t.name || ''}"`);
        tournamentState.activeTournamentId = tid;
        await db().ref(`users/${u}/activeTournamentId`).set(tid);
        await ensureTournamentGroupChat(tid, t, Object.keys(t.players || {}));
        watchTournamentStart(tid);
        openTournamentRoom(tid);
    };

    function watchTournamentStart(tid) {
        if (!tid) return;
        if (_startWatcherTid === tid) return;
        if (_startWatcherRef) { _startWatcherRef.off('value'); _startWatcherRef = null; }
        _startWatcherTid = tid;
        _startWatcherRef = db().ref(`tournaments/${tid}/status`);
        _startWatcherRef.on('value', snap => {
            const status = snap.val();
            if (status === 'active') {
                openTournamentRoom(tid);
                showGN('🏆 Турнір розпочато!');
            } else if (status === 'completed' || status === 'cancelled') {
                _startWatcherRef.off('value');
                _startWatcherRef = null;
                _startWatcherTid = null;
                const user = getUser();
                if (user) db().ref(`users/${user}/activeTournamentId`).remove();
                if (status === 'cancelled') showGN('🛑 Турнір скасовано організатором');
            }
        });
    }

    async function syncGroupChatMembers(groupId, members = []) {
        if (!groupId || !members.length) return;
        const uniqueMembers = [...new Set(members)];
        const updates = {};
        uniqueMembers.forEach(member => {
            updates[`users/${member}/groups/${groupId}`] = true;
        });
        await db().ref().update(updates);
        await db().ref(`groupChats/${groupId}/info/members`).set(uniqueMembers);
    }

    async function ensureTournamentGroupChat(tid, tournament, players) {
        if (!tid || !tournament || !players?.length) return null;
        const groupName = `🏆 Турнір: ${tournament.name || tid}`;
        if (tournament.groupChatId) {
            await syncGroupChatMembers(tournament.groupChatId, players);
            return tournament.groupChatId;
        }
        if (typeof createGroupChatFirebase !== 'function') return null;
        const creator = tournament.host || players[0];
        const res = await createGroupChatFirebase(creator, groupName, players);
        if (!res?.success || !res.groupId) return null;
        await db().ref(`tournaments/${tid}/groupChatId`).set(res.groupId);
        return res.groupId;
    }

    function canUserStartTournament(tournament, user) {
        if (!tournament || !user) return false;
        return tournament.host === user
            || !!tournament.startInitiators?.[user]
            || !!tournament.moderators?.[user]
            || !!tournament.admins?.[user];
    }

    window.startTournament = async function(tid) {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        // Support repository-specific delegated starter roles if they are configured on tournament object.
        const canStart = canUserStartTournament(t, u);
        if (!canStart) { showGN('❌ Тільки хост/уповноважений ініціатор може запустити'); return; }
        if (t.status !== 'waiting') { showGN('❌ Турнір уже запущено або завершено'); return; }
        const players = Object.keys(t.players || {});
        if (players.length < 2) { showGN('❌ Потрібно мінімум 2 гравці'); return; }
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        const bracket = buildBracket(shuffled);
        await db().ref(`tournaments/${tid}`).update({ status: 'active', bracket, bracketPlayers: shuffled, startedAt: Date.now() });
        await ensureTournamentGroupChat(tid, t, shuffled);
        await db().ref('newsPosts').push({
            title: `🏆 Турнір "${esc(t.name)}" розпочато!`,
            text: `Організатор: ${esc(u)} • Гравці: ${players.length} • Переможець отримає 🎁 Містері Бокс з призами!`,
            type: 'tournament',
            createdAt: Date.now(),
            author: u
        });
        showGN(`🏆 Турнір "${t.name}" розпочато!`);
        openTournamentRoom(tid);
    };

    window.cancelTournament = async function(tid) {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t) { showGN('❌ Турнір не знайдено'); return; }
        if (t.host !== u) { showGN('❌ Скасувати може лише організатор'); return; }
        if (t.status !== 'waiting' && t.status !== 'active') { showGN('❌ Турнір вже завершено'); return; }
        if (!confirm(`Скасувати турнір "${t.name}"?`)) return;
        const players = Object.keys(t.players || {});
        const updates = {
            [`tournaments/${tid}/status`]: 'cancelled',
            [`tournaments/${tid}/cancelledAt`]: Date.now(),
            [`tournaments/${tid}/cancelledBy`]: u
        };
        players.forEach(player => {
            updates[`users/${player}/activeTournamentId`] = null;
        });
        await db().ref().update(updates);
        showGN(`🛑 Турнір "${t.name}" скасовано`);
    };

    function buildBracket(players) {
        const rounds = [];
        // Round 1: actual match-ups between real players
        const r1 = [];
        let pendingAssigned = false;
        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 < players.length) {
                r1.push({ p1: players[i], p2: players[i + 1], winner: null, status: pendingAssigned ? 'queued' : 'pending' });
                pendingAssigned = true;
            } else {
                // Odd player out gets a bye (auto-advance)
                r1.push({ p1: players[i], p2: null, winner: players[i], status: 'bye' });
            }
        }
        rounds.push(r1);
        // Future rounds: empty placeholders – filled in as winners advance
        let matchCount = Math.ceil(players.length / 2);
        while (matchCount > 1) {
            matchCount = Math.ceil(matchCount / 2);
            const round = [];
            for (let i = 0; i < matchCount; i++) {
                round.push({ p1: null, p2: null, winner: null, status: 'waiting' });
            }
            rounds.push(round);
        }
        let changed = true;
        let guard = 0;
        while (changed && guard < 16) {
            changed = advanceBracket(rounds);
            guard++;
        }
        activateNextPendingMatch(rounds);
        return rounds;
    }

    window.viewTournamentBracket = async function(tid) {
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t) return;
        tournamentState.activeTournamentId = tid;
        const lobbySection = document.getElementById('tournament-lobby-section');
        if (lobbySection) lobbySection.style.display = 'none';
        const bracketSection = document.getElementById('tournament-bracket-section');
        if (bracketSection) bracketSection.style.display = 'block';
        const titleEl = document.getElementById('tournament-title-display');
        if (titleEl) titleEl.textContent = `🏆 ${t.name}`;
        const playersEl = document.getElementById('tournament-players-display');
        if (playersEl) playersEl.textContent = `👥 Гравці: ${formatPlayerList(t.players)}`;
        updateTournamentRoomControls(tid, t);
        updateTournamentInfoNote(t);
        bindTournamentChat(t.groupChatId);
        const normalized = { ...t, bracket: normalizeBracket(t.bracket) };
        renderBracketUI(normalized);
        checkMyTournamentMatch(normalized);
        setupTournamentListener(tid);
    };

    window.closeTournamentBracket = function() {
        const lobbySection = document.getElementById('tournament-lobby-section');
        if (lobbySection) lobbySection.style.display = 'block';
        const bracketSection = document.getElementById('tournament-bracket-section');
        if (bracketSection) bracketSection.style.display = 'none';
        cleanupTournamentListener();
        cleanupTournamentChatListener();
        tournamentState.activeTournamentId = null;
        tournamentState.myMatchId = null;
        tournamentState.drawPromptKey = null;
        loadTournaments(true);
    };

    function updateTournamentRoomControls(tid, tournament) {
        const u = getUser();
        const playerCount = Object.keys(tournament?.players || {}).length;
        const canStart = canUserStartTournament(tournament, u) && tournament?.status === 'waiting' && playerCount >= 2;
        const canCancel = tournament?.host === u && (tournament?.status === 'waiting' || tournament?.status === 'active');
        const startBtn = document.getElementById('tournament-start-btn');
        const cancelBtn = document.getElementById('tournament-cancel-btn');
        if (startBtn) {
            startBtn.style.display = canStart ? 'inline-flex' : 'none';
            startBtn.setAttribute('data-tid', tid || '');
        }
        if (cancelBtn) {
            cancelBtn.style.display = canCancel ? 'inline-flex' : 'none';
            cancelBtn.setAttribute('data-tid', tid || '');
        }
    }

    function updateTournamentInfoNote(tournament) {
        const noteEl = document.getElementById('tournament-info-note');
        if (!noteEl) return;
        if (tournament?.status === 'waiting') {
            noteEl.style.display = 'block';
            noteEl.innerHTML = '⏳ Очікуємо старт від організатора. Тут же доступний чат та актуальний список учасників.';
            return;
        }
        if (tournament?.status === 'active') {
            noteEl.style.display = 'block';
            noteEl.innerHTML = '🔥 Турнір активний! Грайте матчі, спілкуйтесь у чаті та стежте за сіткою в реальному часі.';
            return;
        }
        if (tournament?.status === 'cancelled') {
            noteEl.style.display = 'block';
            noteEl.innerHTML = '🛑 Турнір скасовано організатором.';
            return;
        }
        noteEl.style.display = 'none';
    }

    function renderTournamentChatMessages(messages = []) {
        const box = document.getElementById('tournament-chat-messages');
        if (!box) return;
        if (!messages.length) {
            box.innerHTML = '<div class="tournament-chat-empty">Поки що без повідомлень. Почніть розмову 👋</div>';
            return;
        }
        const me = getUser();
        box.innerHTML = messages.map(msg => {
            const isMe = msg.sender === me;
            const text = esc(msg.text || '');
            const sender = esc(msg.sender || '---');
            const rawSender = msg.sender || '';
            const users = typeof allUsers !== 'undefined' ? allUsers : {};
            const avatarUrl = (users[rawSender] || {}).avatar || '';
            const initials = esc(rawSender.length >= 2 ? rawSender.slice(0, 2).toUpperCase() : rawSender.toUpperCase() || '?');
            const avatarHtml = `<div class="t-avatar">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${sender}">` : initials}</div>`;
            return `<div class="tournament-chat-row ${isMe ? 'me' : ''}">
                ${avatarHtml}
                <div class="bubble">
                    ${!isMe ? `<div class="author">${sender}</div>` : ''}
                    ${text}
                </div>
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    }

    function bindTournamentChat(groupId) {
        const input = document.getElementById('tournament-chat-input');
        if (input) input.value = '';
        if (!groupId) {
            cleanupTournamentChatListener();
            renderTournamentChatMessages([]);
            if (input) input.disabled = true;
            return;
        }
        if (tournamentState.chatGroupId && tournamentState.chatGroupId !== groupId) {
            cleanupTournamentChatListener();
        }
        tournamentState.chatGroupId = groupId;
        if (input) input.disabled = false;
        if (typeof setupGroupChatListener === 'function') {
            setupGroupChatListener(groupId, (messages) => renderTournamentChatMessages(messages));
        } else {
            renderTournamentChatMessages([]);
        }
    }

    window.sendTournamentChatMsg = async function() {
        const groupId = tournamentState.chatGroupId;
        const u = getUser();
        const input = document.getElementById('tournament-chat-input');
        if (!groupId || !u || !input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        if (typeof sendGroupMessageFirebase === 'function') {
            await sendGroupMessageFirebase(groupId, u, text);
        }
    };

    window.handleTournamentChatKeypress = function(event) {
        if (event.key === 'Enter') window.sendTournamentChatMsg();
    };

    window.startTournamentFromRoom = function() {
        const tid = document.getElementById('tournament-start-btn')?.getAttribute('data-tid') || tournamentState.activeTournamentId;
        if (tid) startTournament(tid);
    };

    window.cancelTournamentFromRoom = function() {
        const tid = document.getElementById('tournament-cancel-btn')?.getAttribute('data-tid') || tournamentState.activeTournamentId;
        if (tid) cancelTournament(tid);
    };

    function setupTournamentListener(tid) {
        if (_tourneyListenerRef && _tourneyListenerTid !== tid) {
            cleanupTournamentListener();
        }
        if (_tourneyListenerRef) return; // Already listening to same tid
        _tourneyListenerTid = tid;
        _tourneyListenerRef = db().ref(`tournaments/${tid}`);
        _tourneyListenerRef.on('value', snap => {
            const raw = snap.val();
            if (!raw) return;
            const t = { ...raw, bracket: normalizeBracket(raw.bracket) };
            renderBracketUI(t);
            updateTournamentRoomControls(tid, raw);
            updateTournamentInfoNote(raw);
            bindTournamentChat(raw.groupChatId);

            const playersEl = document.getElementById('tournament-players-display');
            if (playersEl) playersEl.textContent = `👥 Гравці: ${formatPlayerList(raw.players)}`;

            const m = tournamentState.myMatchId;
            if (m && m.tid === tid) {
                const bracket = t.bracket;
                const me = getUser();
                for (let ri = 0; ri < bracket.length; ri++) {
                    for (let mi = 0; mi < bracket[ri].length; mi++) {
                        const match = bracket[ri][mi];
                        if (match.p1 === m.p1 && match.p2 === m.p2) {
                            const resEl = document.getElementById('tournament-match-result');
                            const waitEl = document.getElementById('tournament-wait-msg');
                            const btns = document.querySelectorAll('#tournament-match-area .rps-choice-btn');
                            if (match.status === 'done') {
                                if (waitEl) waitEl.style.display = 'none';
                                const icons = { rock: '✊', scissors: '✌️', paper: '🖐️' };
                                if (resEl && match.p1Choice && match.p2Choice) {
                                    const myChoice = me === m.p1 ? match.p1Choice : match.p2Choice;
                                    const oppChoice = me === m.p1 ? match.p2Choice : match.p1Choice;
                                    const won = match.winner === me;
                                    resEl.innerHTML = `${icons[myChoice] || '?'} vs ${icons[oppChoice] || '?'} → ${won
                                        ? '<span style="color:var(--g);">✅ Ви виграли!</span>'
                                        : '<span style="color:var(--r);">❌ Ви програли</span>'}`;
                                }
                                tournamentState.myMatchId = null;
                                tournamentState.drawPromptKey = null;
                                if (t.status === 'completed') {
                                    const u2 = getUser();
                                    if (u2) db().ref(`users/${u2}/activeTournamentId`).remove();
                                    cleanupTournamentListener();
                                    setTimeout(() => {
                                        if (t.winner === getUser()) checkPendingMysteryBox();
                                        else viewTournamentBracket(tid);
                                    }, 2500);
                                } else {
                                    setTimeout(() => viewTournamentBracket(tid), 2000);
                                }
                                return;
                            }
                            if (match.status === 'pending') {
                                const choiceKey = `${ri}_${mi}`;
                                const alreadyChose = !!raw.choices?.[choiceKey]?.[me];
                                if (alreadyChose) {
                                    btns.forEach(b => b.disabled = true);
                                    if (waitEl) waitEl.style.display = 'block';
                                } else {
                                    btns.forEach(b => b.disabled = false);
                                    if (waitEl) waitEl.style.display = 'none';
                                }
                                const drawRound = n(match.drawRound, 0);
                                const drawKey = `${tid}_${ri}_${mi}_${drawRound}`;
                                if (resEl && drawRound > 0 && tournamentState.drawPromptKey !== drawKey) {
                                    tournamentState.drawPromptKey = drawKey;
                                    resEl.innerHTML = `<span style="color:var(--gold);">🤝 Нічия! Раунд ${drawRound + 1}</span>`;
                                } else if (resEl && drawRound <= 0) {
                                    resEl.textContent = '';
                                }
                                return;
                            }
                            if (match.status === 'resolving') {
                                if (waitEl) waitEl.style.display = 'block';
                                btns.forEach(b => b.disabled = true);
                                return;
                            }
                            if (resEl) resEl.textContent = '';
                            if (waitEl) waitEl.style.display = 'none';
                            btns.forEach(b => b.disabled = false);
                            return;
                        }
                    }
                }
            } else if (!tournamentState.myMatchId) {
                checkMyTournamentMatch(t);
            }

            if (raw.status === 'completed' || raw.status === 'cancelled') {
                const u = getUser();
                if (u) db().ref(`users/${u}/activeTournamentId`).remove();
            }
            if (raw.status === 'cancelled') {
                tournamentState.myMatchId = null;
                cleanupTournamentListener();
                cleanupTournamentChatListener();
                showGN('🛑 Турнір скасовано організатором');
                setTimeout(() => {
                    closeTournamentBracket();
                }, 1200);
                return;
            }
        });
    }

    function renderBracketUI(t) {
        const el = document.getElementById('tournament-bracket');
        if (!el) return;
        const bracket = t.bracket || [];
        const u = getUser();
        if (!bracket.length) {
            const playersCount = Object.keys(t.players || {}).length;
            el.innerHTML = `<div class="glass" style="text-align:center; border-color:rgba(240,185,11,0.35);">
                <div style="font-size:1.4rem; margin-bottom:6px;">🏟️</div>
                <div style="font-size:13px; color:var(--gold); font-weight:900;">Сітка з'явиться після старту</div>
                <div style="font-size:11px; color:var(--text2); margin-top:4px;">Зараз у кімнаті: ${playersCount} гравців</div>
            </div>`;
            return;
        }
        // Stage names: computed relative to the end of the bracket so the last round is always "Фінал"
        const stageNamesFromEnd = ['Фінал', 'Півфінал', '1/4 Фінал', '1/8', '1/16', '1/32'];
        const totalRounds = bracket.length;
        const getChoiceEmoji = (choice) => ({ rock: '✊', scissors: '✌️', paper: '🖐️' }[choice] || '❔');
        const renderMatchMeta = (match) => {
            if (match.status === 'done') {
                const resultLine = `<div style="font-size:9px;color:var(--text2);text-align:center;">🏆 ${esc(match.winner)}</div>`;
                const choicesLine = (match.p1Choice && match.p2Choice)
                    ? `<div style="font-size:9px;color:var(--text2);text-align:center;">${esc(match.p1)} ${getChoiceEmoji(match.p1Choice)} vs ${getChoiceEmoji(match.p2Choice)} ${esc(match.p2 || '')}</div>`
                    : '';
                return `${resultLine}${choicesLine}`;
            }
            if (match.status === 'pending' && match.p1 && match.p2) {
                const roundText = n(match.drawRound, 0) > 0 ? `Раунд ${n(match.drawRound, 0) + 1}` : 'Раунд 1';
                return `<div style="font-size:9px;color:var(--gold);text-align:center;font-weight:900;">⚔️ Триває... ${roundText}</div>`;
            }
            if (match.status === 'queued' && match.p1 && match.p2) {
                return `<div style="font-size:9px;color:var(--text2);text-align:center;">⏳ Очікує черги</div>`;
            }
            return '';
        };

        // Spectator live-match banner (shows who is playing but NOT their choice)
        const activeMatches = [];
        for (const round of bracket) {
            for (const m of round) {
                if (m.status === 'pending' && m.p1 && m.p2) activeMatches.push(m);
            }
        }
        const isSpectator = u && !activeMatches.find(m => m.p1 === u || m.p2 === u);
        let spectatorBanner = '';
        if (activeMatches.length > 0 && isSpectator) {
            spectatorBanner = `<div style="background:rgba(240,185,11,0.1);border:1px solid rgba(240,185,11,0.3);border-radius:8px;padding:10px;margin-bottom:12px;">
                <div style="font-size:11px;color:var(--gold);font-weight:900;margin-bottom:6px;">⚔️ ЗАРАЗ ГРАЮТЬ:</div>
                ${activeMatches.map(m => `<div style="font-size:12px;color:var(--text2);margin-bottom:3px;">${esc(m.p1)} <span style="color:var(--p);">vs</span> ${esc(m.p2)}</div>`).join('')}
            </div>`;
        }

        el.innerHTML = spectatorBanner + bracket.map((round, ri) => {
            const stageName = stageNamesFromEnd[totalRounds - 1 - ri] || `Раунд ${ri + 1}`;
            return `<div style="margin-bottom:14px;">
                <div class="bracket-stage-label">${stageName}</div>
                ${round.map(m => {
                    const isMyMatch = m.p1 === u || m.p2 === u;
                    const borderStyle = isMyMatch && m.status === 'pending' ? 'border-color:rgba(240,185,11,0.5);' : '';
                    return `<div class="bracket-match" style="${borderStyle}">
                        <div class="bracket-player ${m.winner === m.p1 ? 'winner' : (m.winner && m.p2 ? 'loser' : '')}">${esc(m.p1 || '—')}</div>
                        <div style="font-size:10px;color:#555;text-align:center;margin:2px 0;">vs</div>
                        <div class="bracket-player ${m.winner === m.p2 ? 'winner' : (m.winner && m.p2 ? 'loser' : '')}">${esc(m.p2 || (m.status === 'waiting' ? '?' : 'BYE'))}</div>
                        ${renderMatchMeta(m)}
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');

        if (t.status === 'completed' && t.winner) {
            el.innerHTML += `<div class="glass" style="text-align:center; border-color:var(--gold); margin-top:12px;">
                <div style="font-size:1.6rem; margin-bottom:6px;">🏆</div>
                <div style="font-size:14px; font-weight:900; color:var(--gold);">Переможець: ${esc(t.winner)}</div>
                <div style="font-size:11px;color:var(--text2);margin-top:4px;">🎁 Нагороджений Містері Боксом!</div>
                <button class="btn" onclick="closeTournamentBracket()" style="margin-top:12px; background:var(--gold); color:#000; font-size:11px;">← ДО СПИСКУ</button>
            </div>`;
        }
    }

    function checkMyTournamentMatch(t) {
        const u = getUser(); if (!u || !t.bracket) return;
        const matchArea = document.getElementById('tournament-match-area');
        const matchVs = document.getElementById('tournament-match-vs');
        if (!matchArea || !matchVs) return;
        const bracket = t.bracket;
        for (let ri = 0; ri < bracket.length; ri++) {
            for (let mi = 0; mi < bracket[ri].length; mi++) {
                const match = bracket[ri][mi];
                if (match.status === 'pending' && match.p1 && match.p2 && (match.p1 === u || match.p2 === u)) {
                    const opp = match.p1 === u ? match.p2 : match.p1;
                    tournamentState.myMatchId = { tid: t.id, ri, mi, p1: match.p1, p2: match.p2 };
                    matchArea.style.display = 'block';
                    matchVs.textContent = `Ваш суперник: ${opp}`;
                    const resEl = document.getElementById('tournament-match-result');
                    if (resEl) {
                        const drawRound = n(match.drawRound, 0);
                        resEl.innerHTML = drawRound > 0
                            ? `<span style="color:var(--gold);">🤝 Нічия! Раунд ${drawRound + 1}</span>`
                            : '';
                    }
                    const waitEl = document.getElementById('tournament-wait-msg');
                    if (waitEl) waitEl.style.display = 'none';
                    // Re-enable choice buttons in case this is a reload
                    document.querySelectorAll('#tournament-match-area .rps-choice-btn').forEach(b => b.disabled = false);
                    // If we already submitted our choice, restore waiting state
                    checkIfAlreadyChose(t.id, ri, mi, match.p1, match.p2);
                    return;
                }
            }
        }
        matchArea.style.display = 'none';
    }

    async function checkIfAlreadyChose(tid, ri, mi, p1, p2) {
        const u = getUser(); if (!u) return;
        const choiceKey = `${ri}_${mi}`;
        const snap = await db().ref(`tournaments/${tid}/choices/${choiceKey}/${u}`).once('value');
        if (snap.val()) {
            // We already chose – show waiting state
            document.querySelectorAll('#tournament-match-area .rps-choice-btn').forEach(b => b.disabled = true);
            const waitEl = document.getElementById('tournament-wait-msg');
            if (waitEl) waitEl.style.display = 'block';
        }
    }

    window.tournamentChoose = async function(choice) {
        const u = getUser(); if (!u) return;
        const m = tournamentState.myMatchId;
        if (!m) return;
        const { tid, ri, mi, p1, p2 } = m;
        if (u !== p1 && u !== p2) { showGN('❌ Ви не є учасником цього матчу'); return; }

        // Immediately lock UI – prevent double-clicks
        document.querySelectorAll('#tournament-match-area .rps-choice-btn').forEach(b => b.disabled = true);
        const waitEl = document.getElementById('tournament-wait-msg');
        if (waitEl) waitEl.style.display = 'block';

        // Persist our choice to Firebase
        const choiceKey = `${ri}_${mi}`;
        await db().ref(`tournaments/${tid}/choices/${choiceKey}/${u}`).set(choice);

        // Check if opponent already chose
        const allSnap = await db().ref(`tournaments/${tid}/choices/${choiceKey}`).once('value');
        const all = allSnap.val() || {};
        if (all[p1] && all[p2]) {
            // Both players have chosen – try to resolve
            await tryResolveTournamentMatch(tid, ri, mi, p1, p2, all[p1], all[p2]);
        }
        // Either way the setupTournamentListener will catch updates in real-time
    };

    async function tryResolveTournamentMatch(tid, ri, mi, p1, p2, p1Choice, p2Choice) {
        // Use a transaction to ensure exactly one client resolves the match
        const statusRef = db().ref(`tournaments/${tid}/bracket/${ri}/${mi}/status`);
        const txResult = await statusRef.transaction(status => {
            if (status !== 'pending') return undefined; // Abort – already resolved
            return 'resolving';
        });
        if (!txResult.committed) {
            // Another client already resolved this match — the real-time listener will show the result
            return;
        }

        const winner = rpsWinnerCheck(p1Choice, p2Choice);

        // Load current bracket to propagate advancement
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const raw = snap.val();
        if (!raw) return;
        const bracket = normalizeBracket(raw.bracket);

        if (winner === 0) {
            const currentDrawRound = n(bracket?.[ri]?.[mi]?.drawRound, 0);
            bracket[ri][mi].status = 'pending';
            bracket[ri][mi].winner = null;
            bracket[ri][mi].drawRound = currentDrawRound + 1;
            bracket[ri][mi].p1Choice = null;
            bracket[ri][mi].p2Choice = null;
            await db().ref(`tournaments/${tid}`).update({
                bracket,
                [`choices/${ri}_${mi}`]: null
            });
            return;
        }

        let matchWinner;
        if (winner === 1) matchWinner = p1;
        else matchWinner = p2;

        bracket[ri][mi].winner = matchWinner;
        bracket[ri][mi].status = 'done';
        bracket[ri][mi].p1Choice = p1Choice;
        bracket[ri][mi].p2Choice = p2Choice;

        let changed = true;
        let guard = 0;
        while (changed && guard < 16) {
            changed = advanceBracket(bracket);
            guard++;
        }
        activateNextPendingMatch(bracket);

        const lastRound = bracket[bracket.length - 1];
        const tournamentDone = lastRound.length === 1 && lastRound[0].winner;
        const updates = { bracket };

        if (tournamentDone) {
            const winnerUser = lastRound[0].winner;
            updates.status = 'completed';
            updates.winner = winnerUser;
            await db().ref(`users/${winnerUser}/tournamentsWon`).transaction(v => (n(v, 0) + 1));
            const top3 = getTournamentTop3Users(bracket);
            updates.top3 = top3;
            const awarded = await awardTournamentTop3(tid, raw, top3);
            const top3Text = Object.entries(top3)
                .sort((a, b) => n(a[0], 99) - n(b[0], 99))
                .map(([place, user]) => `${place}. ${esc(user)}${awarded?.[place]?.rarity ? ` — 🎁 ${awarded?.[place]?.rarity}` : ''}`)
                .join(' • ');
            await db().ref('newsPosts').push({
                title: `🏆 Турнір "${esc(raw.name)}" завершено!`,
                text: `Переможець: ${esc(winnerUser)} 🎊\nТоп-3: ${top3Text || esc(winnerUser)}`,
                type: 'tournament_result',
                createdAt: Date.now()
            });
        }

        await db().ref(`tournaments/${tid}`).update(updates);
    }

    function rpsWinnerCheck(c1, c2) {
        if (c1 === c2) return 0;
        if ((c1 === 'rock' && c2 === 'scissors') || (c1 === 'scissors' && c2 === 'paper') || (c1 === 'paper' && c2 === 'rock')) return 1;
        return 2;
    }

    function advanceBracket(bracket) {
        let changed = false;
        for (let ri = 0; ri < bracket.length - 1; ri++) {
            for (let mi = 0; mi < bracket[ri].length; mi++) {
                const m = bracket[ri][mi];
                if (!m.winner) continue;
                const nextMi = Math.floor(mi / 2);
                const nextMatch = bracket[ri + 1]?.[nextMi];
                if (!nextMatch) continue;
                if (mi % 2 === 0) {
                    if (!nextMatch.p1) {
                        nextMatch.p1 = m.winner;
                        changed = true;
                    }
                } else {
                    if (!nextMatch.p2) {
                        nextMatch.p2 = m.winner;
                        changed = true;
                    }
                }
                // Once both players are known, the match waits in queue
                if (nextMatch.p1 && nextMatch.p2 && nextMatch.status === 'waiting') {
                    nextMatch.status = 'queued';
                    changed = true;
                }
            }
        }
        return changed;
    }

    function activateNextPendingMatch(bracket) {
        for (const round of bracket) {
            for (const match of round) {
                if (match.status === 'pending') return false;
            }
        }
        for (const round of bracket) {
            for (const match of round) {
                if (match.status === 'queued' && match.p1 && match.p2) {
                    match.status = 'pending';
                    return true;
                }
            }
        }
        return false;
    }

    function getTournamentTop3Users(bracket) {
        const top = {};
        const finalRound = bracket?.[bracket.length - 1] || [];
        const final = finalRound[0];
        if (final?.winner) {
            top[1] = final.winner;
            if (final.p1 && final.p2) top[2] = final.winner === final.p1 ? final.p2 : final.p1;
        }
        const semiRound = bracket?.[bracket.length - 2] || [];
        const semiLosers = semiRound
            .filter(m => m?.status === 'done' && m.p1 && m.p2 && m.winner)
            .map(m => (m.winner === m.p1 ? m.p2 : m.p1))
            .filter(Boolean);
        if (semiLosers.length > 0) top[3] = semiLosers[0];
        return top;
    }

    async function awardTournamentTop3(tid, tournamentRaw, top3 = {}) {
        const lockRef = db().ref(`tournaments/${tid}/rewardsIssuedAt`);
        // Returning undefined aborts transaction when rewards were already issued (idempotent one-time awarding).
        const lock = await lockRef.transaction(v => (v ? undefined : Date.now()));
        if (!lock.committed) {
            if (tournamentRaw?.awardedRewards) return tournamentRaw.awardedRewards;
            const existingRewardsSnap = await db().ref(`tournaments/${tid}/awardedRewards`).once('value');
            return existingRewardsSnap.val() || {};
        }
        const awardedRewards = {};
        for (const place of [1, 2, 3]) {
            const user = top3[place];
            if (!user) continue;
            const rarity = TOURNAMENT_TOP3_BOX_RARITY[String(place)] || null;
            const prize = await awardMysteryBox(user, { rarity, tournamentId: tid, place });
            awardedRewards[place] = { user, rarity, prizeLabel: prize?.label || null, awardedAt: Date.now() };
        }
        await db().ref(`tournaments/${tid}/awardedRewards`).set(awardedRewards);
        return awardedRewards;
    }

    /* ────────────────────────────────────────────────────── */
    /*  WEEKLY QUEST + PROMO CODES                            */
    /* ────────────────────────────────────────────────────── */
    const WEEKLY_QUESTS_POOL = [
        { id: 'wq_work10',   title: 'Попрацюй 10 разів за тиждень',      key: 'weeklyWorkCount',    target: 10 },
        { id: 'wq_earn50',   title: 'Зароби 50 USDT за тиждень',          key: 'weeklyUsdtEarned',   target: 50 },
        { id: 'wq_trade5',   title: 'Зроби 5 угод на біржі',              key: 'weeklyTradeCount',   target: 5  },
        { id: 'wq_casino3',  title: 'Зіграй 3 рази в казино',             key: 'weeklyCasinoGames',  target: 3  },
        { id: 'wq_login7',   title: 'Заходь 7 днів поспіль',              key: 'weeklyLoginDays',    target: 7  }
    ];

    function getCurrentWeeklyQuest() {
        // Rotate weekly quest every Friday
        const now = new Date();
        const weekNum = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000));
        return WEEKLY_QUESTS_POOL[weekNum % WEEKLY_QUESTS_POOL.length];
    }

    function getWeekKey() {
        // Use the Monday date as a unique weekly key (YYYY-W-MM-DD)
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d);
        mon.setDate(diff);
        const y = mon.getFullYear();
        const m = String(mon.getMonth() + 1).padStart(2, '0');
        const dm = String(mon.getDate()).padStart(2, '0');
        return `${y}-W-${m}-${dm}`;
    }

    function isPermissionDenied(error) {
        const code = String(error?.code || '').toLowerCase();
        const msg = String(error?.message || '').toLowerCase();
        return code.includes('permission') || msg.includes('permission_denied');
    }

    async function readWeeklyProgressValue(username, wk, key) {
        try {
            const snap = await db().ref(`weeklyProgress/${wk}/${username}/${key}`).once('value');
            return n(snap.val(), 0);
        } catch (error) {
            if (!isPermissionDenied(error)) throw error;
            const fallbackSnap = await db().ref(`users/${username}/weeklyProgress/${wk}/${key}`).once('value');
            return n(fallbackSnap.val(), 0);
        }
    }

    async function getWeeklyQuestProgress(username) {
        if (!username) return 0;
        const wk = getWeekKey();
        const q = getCurrentWeeklyQuest();
        try {
            return await readWeeklyProgressValue(username, wk, q.key);
        } catch (error) {
            console.warn('⚠️ Не вдалося завантажити weeklyProgress:', error);
            return 0;
        }
    }

    async function incrementWeeklyProgress(username, key, delta = 1) {
        if (!username) return;
        const wk = getWeekKey();
        try {
            await db().ref(`weeklyProgress/${wk}/${username}/${key}`).transaction(v => n(v, 0) + delta);
        } catch (error) {
            if (!isPermissionDenied(error)) throw error;
            await db().ref(`users/${username}/weeklyProgress/${wk}/${key}`).transaction(v => n(v, 0) + delta);
        }
        try {
            // Check completion and promo assignment
            await checkWeeklyQuestCompletion(username);
        } catch (error) {
            console.warn('⚠️ Перевірка weekly-квесту недоступна:', error);
        }
    }

    async function checkWeeklyQuestCompletion(username) {
        if (!username) return;
        const q = getCurrentWeeklyQuest();
        const wk = getWeekKey();
        const progress = await getWeeklyQuestProgress(username);
        if (progress < q.target) return;
        try {
            // Check if already completed
            const doneSnap = await db().ref(`weeklyCompleted/${wk}/${username}`).once('value');
            if (doneSnap.val()) return;

            // Check top-3 slots
            const topSnap = await db().ref(`weeklyTop3/${wk}`).once('value');
            const top3 = topSnap.val() || {};
            if (Object.keys(top3).length >= 3) return; // already 3 winners

            // Mark completed
            await db().ref(`weeklyCompleted/${wk}/${username}`).set(Date.now());

            // Generate unique promo code with collision checking
            let promoCode;
            let attempts = 0;
            do {
                const part1 = Math.random().toString(36).toUpperCase().slice(2, 6);
                const part2 = Math.random().toString(36).toUpperCase().slice(2, 6);
                promoCode = `WEEKLY-${wk}-${part1}${part2}`;
                const existing = await db().ref(`promoCodes/${promoCode}`).once('value');
                if (!existing.exists()) break;
                attempts++;
            } while (attempts < 5);
            const rewards = ['10 BB', '50 USDT', '20 BB', '100 BB', 'Рамка золота'];
            const reward = rewards[Math.floor(Math.random() * rewards.length)];
            await db().ref(`weeklyTop3/${wk}/${username}`).set({ promoCode, reward, completedAt: Date.now() });
            await db().ref(`promoCodes/${promoCode}`).set({ code: promoCode, owner: username, reward, used: false, weekKey: wk, createdAt: Date.now() });
            // Notify user
            await db().ref(`users/${username}/weeklyPromo`).set({ code: promoCode, reward, weekKey: wk });
            showGN(`🎉 Тижневий квест! Ваш промокод: ${promoCode} (${reward})`);
            renderWeeklyQuest();
        } catch (error) {
            if (!isPermissionDenied(error)) throw error;
            const doneRef = db().ref(`users/${username}/weeklyCompleted/${wk}`);
            const doneSnap = await doneRef.once('value');
            if (doneSnap.val()) return;
            await doneRef.set(Date.now());
            showGN('🎉 Тижневий квест виконано!');
            renderWeeklyQuest();
        }
    }

    async function renderWeeklyQuest() {
        const root = document.getElementById('weekly-quest-container');
        if (!root) return;
        const u = getUser();
        const q = getCurrentWeeklyQuest();
        const progress = u ? await getWeeklyQuestProgress(u) : 0;
        const wk = getWeekKey();
        const pct = Math.min(100, (progress / q.target) * 100);

        let promoHtml = '';
        if (u) {
            const promoSnap = await db().ref(`users/${u}/weeklyPromo`).once('value');
            const promoData = promoSnap.val();
            if (promoData && promoData.weekKey === wk) {
                promoHtml = `<div style="margin-top:10px;">🎁 Ваш промокод: <span class="promo-badge">${esc(promoData.code)}</span> → <b style="color:var(--gold);">${esc(promoData.reward)}</b></div>`;
            }
        }

        const topSnap = await db().ref(`weeklyTop3/${wk}`).once('value');
        const top3 = topSnap.val() || {};
        const topHtml = Object.keys(top3).length
            ? `<div style="font-size:11px; color:var(--text2); margin-top:8px;">🏅 Топ-3 виконавці цього тижня: ${Object.keys(top3).map(esc).join(', ')}</div>`
            : '';

        root.innerHTML = `<div class="weekly-quest-card">
            <div style="font-size:12px; color:var(--gold); font-weight:900; margin-bottom:4px;">📅 ${wk}</div>
            <div style="font-size:14px; font-weight:900; margin-bottom:4px;">${esc(q.title)}</div>
            <div style="font-size:12px; color:var(--text2);">Прогрес: ${progress} / ${q.target}</div>
            <div style="height:6px; background:#111; border-radius:999px; margin:8px 0; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:var(--gold);"></div>
            </div>
            <div style="font-size:11px; color:var(--text2);">Перші 3 виконавці отримають унікальний одноразовий промокод!</div>
            ${promoHtml}
            ${topHtml}
        </div>`;
    }

    /* ── Use promo code ── */
    window.usePromoCode = async function(code) {
        const u = getUser(); if (!u) return;
        const codeKey = String(code || '').trim().toUpperCase();
        if (!codeKey) { showGN('❌ Введіть код'); return; }
        const snap = await db().ref(`promoCodes/${codeKey}`).once('value');
        const promo = snap.val();
        if (!promo) { showGN('❌ Промокод не знайдено'); return; }
        if (promo.used) { showGN('❌ Промокод вже використано'); return; }
        if (promo.owner !== u) { showGN('❌ Цей промокод не для вас'); return; }
        await db().ref(`promoCodes/${codeKey}/used`).set(true);
        await db().ref(`promoCodes/${codeKey}/usedAt`).set(Date.now());
        // Apply reward
        const reward = promo.reward || '';
        let applied = reward;
        const bbMatch = reward.match(/^(\d+)\s*BB$/i);
        const usdtMatch = reward.match(/^(\d+)\s*USDT$/i);
        if (bbMatch) {
            const amt = n(bbMatch[1]);
            const r = await adjustUserBalanceFirebase(u, amt);
            if (r?.success && typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
            applied = `+${amt} BB`;
        } else if (usdtMatch) {
            const amt = n(usdtMatch[1]);
            await adjustUsdt(u, amt);
            applied = `+${amt} USDT`;
        }
        showGN(`🎁 Промокод застосовано: ${applied}`);
    };

    /* ────────────────────────────────────────────────────── */
    /*  STOCKS & BUSINESS                                     */
    /* ────────────────────────────────────────────────────── */
    const STOCKS_CATALOG = [
        { id: 'BBEX', name: 'BB Exchange',  icon: '💹', sector: 'Крипто',    basePrice: 10,  volatility: 0.12, dividendRate: 0.0008 },
        { id: 'MINE', name: 'MineCore',     icon: '⛏️', sector: 'Майнінг',   basePrice: 5,   volatility: 0.15, dividendRate: 0.0006 },
        { id: 'HOTR', name: 'HotelGroup',   icon: '🏨', sector: 'Туризм',    basePrice: 22,  volatility: 0.08, dividendRate: 0.0010 },
        { id: 'TECH', name: 'TechVenture',  icon: '🖥️', sector: 'Технології',basePrice: 35,  volatility: 0.18, dividendRate: 0.0005 },
        { id: 'AUTO', name: 'AutoDrive',    icon: '🚗', sector: 'Авто',      basePrice: 18,  volatility: 0.10, dividendRate: 0.0007 },
        { id: 'FOOD', name: 'FoodChain',    icon: '🍔', sector: 'Харчування',basePrice: 8,   volatility: 0.06, dividendRate: 0.0012 },
        { id: 'BANK', name: 'BB Bank',      icon: '🏦', sector: 'Фінанси',   basePrice: 45,  volatility: 0.07, dividendRate: 0.0015 },
        { id: 'GAME', name: 'GameStudio',   icon: '🎮', sector: 'Розваги',   basePrice: 12,  volatility: 0.20, dividendRate: 0.0004 },
        { id: 'REAL', name: 'RealtyMax',    icon: '🏠', sector: 'Нерухомість',basePrice: 28, volatility: 0.09, dividendRate: 0.0011 },
        { id: 'ENRG', name: 'EnergyPlus',   icon: '⚡', sector: 'Енергія',   basePrice: 15,  volatility: 0.11, dividendRate: 0.0009 }
    ];
    // Stock prices update every 15 minutes to make gains/losses noticeable.
    const STOCK_PRICE_INTERVAL_MS = 15 * 60 * 1000;
    // Fraction of original purchase price returned when selling a business.
    const BUSINESS_SELL_RATE = 0.75;

    const BUSINESS_CATALOG = [
        { id: 'cafe',       name: 'Кафе',            icon: '☕', price: 100,  dailyIncome: 5,   maxLevel: 10 },
        { id: 'barbershop', name: 'Перукарня',        icon: '💈', price: 200,  dailyIncome: 10,  maxLevel: 10 },
        { id: 'pharmacy',   name: 'Аптека',           icon: '💊', price: 400,  dailyIncome: 20,  maxLevel: 10 },
        { id: 'carwash',    name: 'Автомийка',        icon: '🚿', price: 350,  dailyIncome: 18,  maxLevel: 10 },
        { id: 'gym',        name: 'Спортзал',         icon: '🏋️', price: 600,  dailyIncome: 30,  maxLevel: 10 },
        { id: 'cinema',     name: 'Кінотеатр',        icon: '🎬', price: 1000, dailyIncome: 55,  maxLevel: 10 },
        { id: 'restaurant', name: 'Ресторан',         icon: '🍽️', price: 800,  dailyIncome: 45,  maxLevel: 10 },
        { id: 'supermarket',name: 'Супермаркет',      icon: '🛒', price: 1500, dailyIncome: 80,  maxLevel: 10 },
        { id: 'nightclub',  name: 'Нічний клуб',      icon: '🎧', price: 2000, dailyIncome: 110, maxLevel: 10 },
        { id: 'bank_biz',   name: 'Мікрофінансова',   icon: '🏦', price: 3000, dailyIncome: 160, maxLevel: 10 }
    ];

    function getBusinessDailyIncome(business, level, count = 1) {
        return Math.round(n(business?.dailyIncome, 0) * Math.max(1, n(level, 0)) * Math.max(1, n(count, 1)) * 100) / 100;
    }

    function getBusinessPendingIncome(business, owned, now = Date.now()) {
        if (!business || !owned) return 0;
        const level = Math.max(1, n(owned.level, 1));
        const count = Math.max(1, n(owned.count, 1));
        const storedIncome = n(owned.pendingIncome, 0);
        const lastCollectedAt = n(owned.lastCollectedAt, now);
        const elapsedDays = Math.max(0, now - lastCollectedAt) / (24 * 3600 * 1000);
        const generatedIncome = getBusinessDailyIncome(business, level, count) * elapsedDays;
        return Math.round((storedIncome + generatedIncome) * 10000) / 10000;
    }

    function getStockDividendPending(stockId, now = Date.now()) {
        const stock = STOCKS_CATALOG.find(s => s.id === stockId);
        const portfolio = extState.stocks.portfolio[stockId];
        if (!stock || !portfolio?.shares) return 0;
        // No dividends when price is zero or negative
        const price = Math.max(0, getStockPrice(stockId, now));
        const value = price * n(portfolio.shares, 0);
        const lastDividendAt = n(portfolio.lastDividendAt, n(portfolio.boughtAt, now));
        const elapsedDays = Math.max(0, now - lastDividendAt) / (24 * 3600 * 1000);
        return Math.round(value * n(stock.dividendRate, 0) * elapsedDays * 10000) / 10000;
    }

    // Minimum amount (in BB) that must accumulate before it can be collected.
    const MIN_COLLECTIBLE_AMOUNT = 0.0001;

    async function loadStocksData() {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`users/${u}/stocksData`).once('value');
        const raw = snap.val() || {};
        extState.stocks.portfolio = raw.portfolio || {};
        extState.stocks.businesses = raw.businesses || {};
    }

    async function saveStocksData() {
        const u = getUser(); if (!u) return;
        await db().ref(`users/${u}/stocksData`).set({ portfolio: extState.stocks.portfolio, businesses: extState.stocks.businesses });
    }

    function getStockPrice(stockId, time = Date.now()) {
        const stock = STOCKS_CATALOG.find(s => s.id === stockId);
        if (!stock) return 0;
        // Pseudo-random price that changes every 15 minutes. Uses an additive
        // formula so that volatile stocks can fall below zero (into the red).
        // seed = current interval as integer; two large co-prime multipliers mix
        // the seed with each character of the stock ID so every stock follows a
        // distinct price path.
        const seed = Math.floor(time / STOCK_PRICE_INTERVAL_MS);
        // Amplitude multiplier: keeps volatile stocks (e.g. GAME vol=0.20) in a range
        // where prices can drop below zero while stable stocks (e.g. BANK vol=0.07) remain
        // mostly positive. With 4-char IDs and this multiplier the swing is ±(3×vol×base).
        const PRICE_SWING_FACTOR = 6;
        let offset = 0;
        for (let i = 0; i < stockId.length; i++) {
            const h = (seed * 1000003 + stockId.charCodeAt(i) * 9999991) % 10000;
            offset += stock.volatility * (h / 10000 - 0.5) * stock.basePrice * PRICE_SWING_FACTOR;
        }
        return Math.round((stock.basePrice + offset) * 100) / 100;
    }

    function getStockTrend(stockId, time = Date.now()) {
        const current = getStockPrice(stockId, time);
        const previous = getStockPrice(stockId, time - STOCK_PRICE_INTERVAL_MS);
        const delta = Math.round((current - previous) * 100) / 100;
        const deltaPct = previous > 0 ? (delta / previous) * 100 : 0;
        return { current, previous, delta, deltaPct };
    }

    function formatSigned(value, digits = 2) {
        const amount = n(value, 0);
        return `${amount >= 0 ? '+' : ''}${amount.toFixed(digits)}`;
    }

    function renderStocksFeatureViews() {
        renderStocksTab();
        renderBusinessTab();
        renderPortfolioTab();
    }

    window.switchStocksTab = function(panel) {
        document.querySelectorAll('.stocks-subtab').forEach((t, i) => {
            const panels = ['stocks', 'business', 'portfolio'];
            t.classList.toggle('active', panels[i] === panel);
        });
        document.querySelectorAll('.stocks-panel').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(`stocks-panel-${panel}`);
        if (el) el.classList.add('active');
        if (panel === 'stocks') renderStocksTab();
        if (panel === 'business') renderBusinessTab();
        if (panel === 'portfolio') renderPortfolioTab();
    };

    function renderStocksTab() {
        const listEl = document.getElementById('stocks-list');
        if (!listEl) return;
        const now = Date.now();
        listEl.innerHTML = STOCKS_CATALOG.map(s => {
            const { current: price, delta, deltaPct } = getStockTrend(s.id, now);
            const owned = n(extState.stocks.portfolio[s.id]?.shares, 0);
            const avgBuy = n(extState.stocks.portfolio[s.id]?.avgPrice, 0);
            const pnl = owned > 0 ? (price - avgBuy) * owned : 0;
            const dividend = owned > 0 ? getStockDividendPending(s.id, now) : 0;
            const divRatePct = (n(s.dividendRate, 0) * 100).toFixed(2);
            const deltaColor = delta >= 0 ? 'var(--g)' : 'var(--r)';
            const deltaLabel = `${formatSigned(delta)} BB (${formatSigned(deltaPct)}%)`;
            const dividendRow = owned > 0
                ? `<div style="font-size:11px; color:var(--g); margin-bottom:8px;">💰 Дивіденди: ${dividend.toFixed(4)} BB (${divRatePct}%/добу)</div>`
                : `<div style="font-size:11px; color:var(--text2); margin-bottom:8px;">💰 Дивіденд: ${divRatePct}%/добу від вартості</div>`;
            return `<div class="stock-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div><span style="font-size:1.4rem;">${esc(s.icon)}</span> <b style="color:var(--p);">${esc(s.id)}</b><br><span style="font-size:11px; color:var(--text2);">${esc(s.name)} • ${esc(s.sector)}</span></div>
                    <div style="text-align:right;"><div style="font-size:16px; font-weight:900;">${price.toFixed(2)} BB</div><div style="font-size:11px; color:${deltaColor};">${deltaLabel}</div>${owned > 0 ? `<div style="font-size:11px; color:${pnl >= 0 ? 'var(--g)' : 'var(--r)'};">${formatSigned(pnl)} BB</div>` : ''}</div>
                </div>
                ${owned > 0 ? `<div style="font-size:11px; color:var(--text2); margin-bottom:4px;">Моє: ${owned} акцій • Сер. купівля: ${avgBuy.toFixed(2)}</div>` : ''}
                ${dividendRow}
                <div style="display:flex; gap:6px;">
                    <input type="number" id="stock-qty-${esc(s.id)}" placeholder="К-сть" min="1" step="1" style="flex:1; padding:8px; font-size:12px;">
                    <button class="btn" style="width:auto; padding:8px 12px; font-size:11px; background:var(--g); color:#000;" onclick="buyStock('${esc(s.id)}')">КУПИТИ</button>
                    ${owned > 0 ? `<button class="btn" style="width:auto; padding:8px 12px; font-size:11px; background:var(--r); color:#fff;" onclick="sellStock('${esc(s.id)}')">ПРОДАТИ</button>` : ''}
                </div>
            </div>`;
        }).join('');
        // Update portfolio value and dividends
        let totalValue = 0, totalPnl = 0, totalDividends = 0;
        STOCKS_CATALOG.forEach(s => {
            const p = extState.stocks.portfolio[s.id];
            if (!p?.shares) return;
            const price = getStockPrice(s.id, now);
            totalValue += price * p.shares;
            totalPnl += (price - n(p.avgPrice)) * p.shares;
            totalDividends += getStockDividendPending(s.id, now);
        });
        totalDividends = Math.round(totalDividends * 10000) / 10000;
        const valEl = document.getElementById('stocks-portfolio-value');
        const pnlEl = document.getElementById('stocks-portfolio-pnl');
        if (valEl) valEl.textContent = `${totalValue.toFixed(2)} BB`;
        if (pnlEl) {
            pnlEl.textContent = `${formatSigned(totalPnl)} BB`;
            pnlEl.style.color = totalPnl >= 0 ? 'var(--g)' : 'var(--r)';
        }
        // Inject/update dividends collect row
        let divRow = document.getElementById('stocks-dividends-row');
        const panel = document.getElementById('stocks-panel-stocks');
        if (panel && !divRow) {
            divRow = document.createElement('div');
            divRow.id = 'stocks-dividends-row';
            divRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 14px; margin-bottom:12px;';
            panel.insertBefore(divRow, listEl);
        }
        if (divRow) {
            divRow.innerHTML = `<div><span style="font-size:13px; color:var(--text2);">💰 Накопичені дивіденди:</span> <b style="color:var(--g);">${totalDividends.toFixed(4)} BB</b></div><button class="btn" style="width:auto; padding:8px 14px; font-size:12px; background:var(--g); color:#000;" onclick="collectAllDividends()">ЗІБРАТИ ДИВІДЕНДИ</button>`;
        }
    }

    window.buyStock = async function(stockId) {
        const u = getUser(); if (!u) return;
        const qty = n(document.getElementById(`stock-qty-${stockId}`)?.value, 0);
        if (qty <= 0) { showGN('❌ Вкажіть кількість'); return; }
        const price = getStockPrice(stockId);
        if (price <= 0) { showGN('❌ Ціна акції від\'ємна — купівля недоступна'); return; }
        const total = Math.round(price * qty * 100) / 100;
        if (getBalance() < total) { showGN(`❌ Потрібно ${total.toFixed(2)} BB`); return; }
        const r = await adjustUserBalanceFirebase(u, -total);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        const now = Date.now();
        const cur = extState.stocks.portfolio[stockId] || { shares: 0, avgPrice: 0 };
        const newShares = cur.shares + qty;
        const newAvg = ((cur.avgPrice * cur.shares) + (price * qty)) / newShares;
        extState.stocks.portfolio[stockId] = {
            shares: newShares,
            avgPrice: Math.round(newAvg * 100) / 100,
            lastDividendAt: cur.lastDividendAt || now,
            boughtAt: cur.boughtAt || now
        };
        await saveStocksData();
        showGN(`✅ Куплено ${qty} акцій ${stockId} за ${total.toFixed(2)} BB`);
        renderStocksFeatureViews();
    };

    window.sellStock = async function(stockId) {
        const u = getUser(); if (!u) return;
        const qty = n(document.getElementById(`stock-qty-${stockId}`)?.value, 0);
        const owned = n(extState.stocks.portfolio[stockId]?.shares, 0);
        if (qty <= 0 || qty > owned) { showGN(`❌ У вас є ${owned} акцій`); return; }
        const price = getStockPrice(stockId);
        // If price is negative the seller receives nothing (loss already taken)
        const total = Math.max(0, Math.round(price * qty * 100) / 100);
        const r = await adjustUserBalanceFirebase(u, total);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        const remaining = owned - qty;
        if (remaining <= 0) delete extState.stocks.portfolio[stockId];
        else extState.stocks.portfolio[stockId].shares = remaining;
        await saveStocksData();
        showGN(`✅ Продано ${qty} акцій ${stockId}: +${total.toFixed(2)} BB`);
        renderStocksFeatureViews();
    };

    window.collectAllDividends = async function() {
        const u = getUser(); if (!u) return;
        const now = Date.now();
        let totalDividends = 0;
        STOCKS_CATALOG.forEach(s => {
            const pending = getStockDividendPending(s.id, now);
            if (pending > 0) {
                totalDividends += pending;
                if (extState.stocks.portfolio[s.id]) {
                    extState.stocks.portfolio[s.id].lastDividendAt = now;
                }
            }
        });
        totalDividends = Math.round(totalDividends * 10000) / 10000;
        if (totalDividends < MIN_COLLECTIBLE_AMOUNT) { showGN('❌ Дивіденди ще не накопичились'); return; }
        const r = await adjustUserBalanceFirebase(u, totalDividends);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        await saveStocksData();
        showGN(`✅ Дивіденди зібрано: +${totalDividends.toFixed(4)} BB`);
        renderStocksFeatureViews();
    };

    function renderBusinessTab() {
        const listEl = document.getElementById('business-list');
        if (!listEl) return;
        const now = Date.now();

        // Inject/update "collect all" header
        let bizHeader = document.getElementById('business-header-row');
        const panel = document.getElementById('stocks-panel-business');
        if (panel && !bizHeader) {
            bizHeader = document.createElement('div');
            bizHeader.id = 'business-header-row';
            bizHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 14px; margin-bottom:12px;';
            panel.insertBefore(bizHeader, listEl);
        }
        if (bizHeader) {
            const totalPending = BUSINESS_CATALOG.reduce((sum, b) => {
                const ow = extState.stocks.businesses[b.id];
                return sum + (ow ? getBusinessPendingIncome(b, ow, now) : 0);
            }, 0);
            bizHeader.innerHTML = `<div><span style="font-size:13px; color:var(--text2);">💵 Загальний прибуток:</span> <b style="color:var(--g);">${totalPending.toFixed(4)} BB</b></div><button class="btn" style="width:auto; padding:8px 14px; font-size:12px; background:var(--g); color:#000;" onclick="collectAllBusinessIncome()">ЗІБРАТИ ВСЕ</button>`;
        }

        listEl.innerHTML = BUSINESS_CATALOG.map(b => {
            const owned = extState.stocks.businesses[b.id];
            const isOwned = !!owned;
            const ownedLevel = Math.max(1, n(owned?.level, 1));
            const ownedCount = Math.max(1, n(owned?.count, 1));
            const upgradePrice = isOwned ? Math.round(b.price * ownedLevel * 0.5) : b.price;
            const income = isOwned ? getBusinessDailyIncome(b, ownedLevel, ownedCount) : b.dailyIncome;
            const pending = isOwned ? getBusinessPendingIncome(b, owned, now) : 0;
            const sellBizPrice = Math.round(b.price * ownedCount * BUSINESS_SELL_RATE);
            return `<div class="business-card ${isOwned ? 'owned' : ''}">
                <div style="font-size:2rem; margin-bottom:6px;">${esc(b.icon)}</div>
                <div style="font-size:13px; font-weight:900; color:var(--p); margin-bottom:4px;">${esc(b.name)}</div>
                ${isOwned ? `<div style="margin-bottom:6px; display:flex; gap:4px; flex-wrap:wrap;"><span class="pill success">Рівень ${ownedLevel}</span><span class="pill" style="background:rgba(240,185,11,0.15); color:var(--p);">×${ownedCount} шт.</span></div>` : ''}
                <div style="font-size:11px; color:var(--text2);">💰 Дохід: ${income.toFixed(2)} BB/добу</div>
                ${isOwned && pending > 0 ? `<div style="font-size:12px; color:var(--g); margin-top:4px;">💵 Накопичено: ${pending.toFixed(4)} BB</div>` : ''}
                <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
                    ${isOwned
                        ? `<button class="btn secondary-btn" style="padding:8px; font-size:11px;" onclick="collectBusinessIncome('${esc(b.id)}')">📥 ЗІБРАТИ</button>
                           <button class="btn" style="padding:8px; font-size:11px;" onclick="buyBusiness('${esc(b.id)}')">КУПИТИ ЩЕ ${b.price} BB</button>
                           ${ownedLevel < b.maxLevel ? `<button class="btn" style="padding:8px; font-size:11px; background:var(--gold); color:#000;" onclick="upgradeBusiness('${esc(b.id)}')">⬆ ${upgradePrice} BB</button>` : '<span class="pill success" style="font-size:10px;">MAX</span>'}
                           <button class="btn" style="padding:8px; font-size:11px; background:var(--r); color:#fff;" onclick="sellBusiness('${esc(b.id)}')">🏷 ПРОДАТИ (${sellBizPrice} BB)</button>`
                        : `<button class="btn" style="padding:8px; font-size:11px;" onclick="buyBusiness('${esc(b.id)}')">КУПИТИ ${b.price} BB</button>`
                    }
                </div>
            </div>`;
        }).join('');
    }

    window.buyBusiness = async function(bId) {
        const u = getUser(); if (!u) return;
        const b = BUSINESS_CATALOG.find(x => x.id === bId);
        if (!b) return;
        if (getBalance() < b.price) { showGN(`❌ Потрібно ${b.price} BB`); return; }
        const r = await adjustUserBalanceFirebase(u, -b.price);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        const now = Date.now();
        if (extState.stocks.businesses[bId]) {
            const existing = extState.stocks.businesses[bId];
            // Save pending income before adding new unit to keep accounting correct
            existing.pendingIncome = getBusinessPendingIncome(b, existing, now);
            existing.lastCollectedAt = now;
            existing.count = Math.max(1, n(existing.count, 1)) + 1;
            const newCount = existing.count;
            await saveStocksData();
            showGN(`✅ ${b.icon} ${b.name} ще один куплено! (Всього: ${newCount})`);
        } else {
            extState.stocks.businesses[bId] = { count: 1, level: 1, boughtAt: now, lastCollectedAt: now, pendingIncome: 0 };
            await saveStocksData();
            showGN(`✅ ${b.icon} ${b.name} куплено!`);
        }
        renderStocksFeatureViews();
    };

    window.collectAllBusinessIncome = async function() {
        const u = getUser(); if (!u) return;
        const now = Date.now();
        let totalIncome = 0;
        const collectedIds = [];
        BUSINESS_CATALOG.forEach(b => {
            const owned = extState.stocks.businesses[b.id];
            if (!owned) return;
            const pending = getBusinessPendingIncome(b, owned, now);
            if (pending >= MIN_COLLECTIBLE_AMOUNT) {
                totalIncome += pending;
                collectedIds.push(b.id);
            }
        });
        totalIncome = Math.round(totalIncome * 10000) / 10000;
        if (totalIncome < MIN_COLLECTIBLE_AMOUNT) { showGN('❌ Ще немає прибутку для збору'); return; }
        const r = await adjustUserBalanceFirebase(u, totalIncome);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        collectedIds.forEach(bId => {
            if (extState.stocks.businesses[bId]) {
                extState.stocks.businesses[bId].lastCollectedAt = now;
                extState.stocks.businesses[bId].pendingIncome = 0;
            }
        });
        await saveStocksData();
        showGN(`✅ Зібрано з усього бізнесу: +${totalIncome.toFixed(4)} BB`);
        renderStocksFeatureViews();
    };

    window.upgradeBusiness = async function(bId) {
        const u = getUser(); if (!u) return;
        const b = BUSINESS_CATALOG.find(x => x.id === bId);
        const owned = extState.stocks.businesses[bId];
        if (!b || !owned) return;
        const level = n(owned.level, 1);
        if (level >= b.maxLevel) { showGN('Максимальний рівень'); return; }
        const upgradePrice = Math.round(b.price * level * 0.5);
        if (getBalance() < upgradePrice) { showGN(`❌ Потрібно ${upgradePrice} BB`); return; }
        const r = await adjustUserBalanceFirebase(u, -upgradePrice);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        const now = Date.now();
        owned.pendingIncome = getBusinessPendingIncome(b, owned, now);
        owned.lastCollectedAt = now;
        owned.level = level + 1;
        await saveStocksData();
        showGN(`⬆ ${b.name} покращено до рівня ${level + 1}!`);
        renderStocksFeatureViews();
    };

    window.sellBusiness = async function(bId) {
        const u = getUser(); if (!u) return;
        const b = BUSINESS_CATALOG.find(x => x.id === bId);
        const owned = extState.stocks.businesses[bId];
        if (!b || !owned) return;
        const count = Math.max(1, n(owned.count, 1));
        const now = Date.now();
        // Collect pending income and return 75% of base purchase price per unit
        const pendingIncome = getBusinessPendingIncome(b, owned, now);
        const sellPrice = Math.round(b.price * count * BUSINESS_SELL_RATE * 100) / 100;
        const total = Math.round((sellPrice + pendingIncome) * 100) / 100;
        const r = await adjustUserBalanceFirebase(u, total);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        delete extState.stocks.businesses[bId];
        await saveStocksData();
        showGN(`🏷 ${b.icon} ${b.name} продано за ${sellPrice.toFixed(2)} BB + ${pendingIncome.toFixed(4)} BB доходу`);
        renderStocksFeatureViews();
    };

    window.collectBusinessIncome = async function(bId) {
        const u = getUser(); if (!u) return;
        const b = BUSINESS_CATALOG.find(x => x.id === bId);
        const owned = extState.stocks.businesses[bId];
        if (!b || !owned) return;
        const now = Date.now();
        const pendingIncome = getBusinessPendingIncome(b, owned, now);
        if (pendingIncome < MIN_COLLECTIBLE_AMOUNT) { showGN('❌ Ще мало накопичено'); return; }
        const r = await adjustUserBalanceFirebase(u, pendingIncome);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        owned.lastCollectedAt = now;
        owned.pendingIncome = 0;
        await saveStocksData();
        showGN(`✅ Зібрано: +${pendingIncome.toFixed(4)} BB з ${b.name}`);
        renderStocksFeatureViews();
    };

    function renderPortfolioTab() {
        const portEl = document.getElementById('my-portfolio-list');
        const bizEl = document.getElementById('my-business-list');
        if (portEl) {
            const entries = STOCKS_CATALOG.filter(s => n(extState.stocks.portfolio[s.id]?.shares, 0) > 0);
            if (!entries.length) { portEl.innerHTML = '<div style="color:var(--text2); font-size:13px;">Немає акцій</div>'; }
            else portEl.innerHTML = entries.map(s => {
                const p = extState.stocks.portfolio[s.id];
                const price = getStockPrice(s.id);
                const pnl = (price - n(p.avgPrice)) * n(p.shares);
                return `<div class="activity-card"><b style="color:var(--p);">${esc(s.icon)} ${esc(s.id)}</b> — ${n(p.shares)} акцій • ${price.toFixed(2)} BB <span style="color:${pnl >= 0 ? 'var(--g)' : 'var(--r)'};">${formatSigned(pnl)} BB</span></div>`;
            }).join('');
        }
        if (bizEl) {
            const bizEntries = BUSINESS_CATALOG.filter(b => extState.stocks.businesses[b.id]);
            if (!bizEntries.length) { bizEl.innerHTML = '<div style="color:var(--text2); font-size:13px;">Немає бізнесу</div>'; }
            else bizEl.innerHTML = bizEntries.map(b => {
                const ow = extState.stocks.businesses[b.id];
                const pending = getBusinessPendingIncome(b, ow);
                const count = Math.max(1, n(ow.count, 1));
                return `<div class="activity-card"><b style="color:var(--p);">${esc(b.icon)} ${esc(b.name)}</b> ×${count} • Рівень ${n(ow.level,1)} | Дохід: ${getBusinessDailyIncome(b, n(ow.level,1), count).toFixed(2)} BB/добу | Накопичено: ${pending.toFixed(4)} BB</div>`;
            }).join('');
        }
    }

    /* ────────────────────────────────────────────────────── */
    /*  UTILS                                                 */
    /* ────────────────────────────────────────────────────── */
    function showGN(msg) {
        if (typeof showGameNotification === 'function') showGameNotification(msg);
        else console.log('[GN]', msg);
    }

    /* ────────────────────────────────────────────────────── */
    /*  BOOTSTRAP — hook into existing auth lifecycle         */
    /* ────────────────────────────────────────────────────── */
    async function onExtLogin() {
        const u = getUser(); if (!u) return;
        gameState.usdt = await loadUsdt(u);
        if (typeof updateHeader === 'function') updateHeader();
        await loadWorkState();
        await loadBankData();
        await loadStocksData();
        renderWorkTab();
        renderBankTab();
        renderStocksFeatureViews();
        try {
            await renderWeeklyQuest();
        } catch (error) {
            console.warn('⚠️ Weekly quest тимчасово недоступний:', error);
        }
        // Track daily login for weekly quest (once per calendar day)
        try {
            const todayKey = new Date().toISOString().slice(0, 10);
            const lastLoginKey = `wq_lastlogin_${u}`;
            const lastLogin = localStorage.getItem(lastLoginKey);
            if (lastLogin !== todayKey) {
                localStorage.setItem(lastLoginKey, todayKey);
                await incrementWeeklyProgress(u, 'weeklyLoginDays');
            }
        } catch (error) {
            console.warn('⚠️ Weekly login tracking failed:', error);
        }
        startWorkCooldownTick();
        if (extState.debtProcessingTimer) clearInterval(extState.debtProcessingTimer);
        extState.debtProcessingTimer = setInterval(() => { checkOverdueLoans(); }, 60 * 60 * 1000);
        checkOverdueLoans();
        // Check and generate a tax bill if 2+ days have passed since the last one
        setTimeout(() => checkAndGenerateTaxBill(), 3000);
    }

    function onExtLogout() {
        extState.work = { jobId: 'freelancer', xp: 0, lastWorkAt: 0, totalEarned: 0 };
        extState.bank = { loans: {}, history: [], bootstrapped: false };
        extState.stocks = { portfolio: {}, businesses: {} };
        if (extState.workCooldownTimer) { clearInterval(extState.workCooldownTimer); extState.workCooldownTimer = null; }
        if (extState.debtProcessingTimer) { clearInterval(extState.debtProcessingTimer); extState.debtProcessingTimer = null; }
        minesState.active = false;
        cleanupTournamentChatListener();
        tournamentState.activeTournamentId = null;
        tournamentState.myMatchId = null;
        tournamentState.chatGroupId = null;
        tournamentState.drawPromptKey = null;
        if (_startWatcherRef) { _startWatcherRef.off('value'); _startWatcherRef = null; _startWatcherTid = null; }
        cleanupTournamentListener();
    }

    /* Extend handleExtendedTabOpen for new tabs */
    const origHandleTabOpen = window.handleExtendedTabOpen;
    window.handleExtendedTabOpen = function(tabNum) {
        if (typeof origHandleTabOpen === 'function') origHandleTabOpen(tabNum);
        if (tabNum === 16) { renderWorkTab(); }
        if (tabNum === 17) { renderBankTab(); }
        if (tabNum === 18) { renderStocksFeatureViews(); }
        if (tabNum === 14) { renderWeeklyQuest(); }
    };

    /* Hook into auth */
    const _origAuth = window.auth;
    if (typeof _origAuth === 'function') {
        window.auth = async function(...args) {
            const result = await _origAuth.apply(this, args);
            if (typeof gameState !== 'undefined' && gameState.user) await onExtLogin();
            return result;
        };
    }

    const _origLogout = window.logout;
    if (typeof _origLogout === 'function') {
        window.logout = function(...args) {
            onExtLogout();
            return _origLogout.apply(this, args);
        };
    }

    /* Increment weekly casino games on casino play */
    const _origSpinSlots = window.spinSlots;
    if (typeof _origSpinSlots === 'function') {
        window.spinSlots = async function(...args) {
            const r = await _origSpinSlots.apply(this, args);
            if (getUser()) await incrementWeeklyProgress(getUser(), 'weeklyCasinoGames');
            return r;
        };
    }

    /* Increment weekly work count wrapped in doWork already */

    /* Profile: add USDT and profession to the profile stats */
    const _origRenderProfileHub = window.bbFeatures?.renderProfileHub
        ? null /* We extend via updateHeader instead */
        : null;

    /* Export */
    window.extFeatures = {
        onExtLogin, onExtLogout, loadWorkState, loadBankData, loadStocksData,
        renderWorkTab, renderBankTab, renderStocksTab, renderWeeklyQuest,
        adjustUsdt, loadUsdt, saveUsdt,
        incrementWeeklyProgress, checkWeeklyQuestCompletion,
        getCurrentProfession
    };

})();
