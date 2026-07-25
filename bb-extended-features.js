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
        { id: 'entrepreneur',name: 'Підприємець',  icon: '🤵', reward: 8.00, cooldown: 480,   xpGain: 40, xpRequired: 1500,desc: 'Потрібно 1500 XP. Максимальна виплата.' }
    ];

    const extState = {
        work: { jobId: null, xp: 0, lastWorkAt: 0, totalEarned: 0 },
        bank: { loans: {}, history: [], bootstrapped: false },
        stocks: { portfolio: {}, businesses: {} },
        workCooldownTimer: null,
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

    window.doWork = async function() {
        if (getWorkCooldownRemaining() > 0) { showGN('⏳ Ще рано!'); return; }
        const u = getUser(); if (!u) return;
        const prof = getCurrentProfession();
        extState.work.xp += prof.xpGain;
        extState.work.lastWorkAt = Date.now();
        extState.work.totalEarned = n(extState.work.totalEarned, 0) + prof.reward;
        await saveWorkState();
        const newUsdt = await adjustUsdt(u, prof.reward);
        await appendBankRecord({ type: 'work', currency: 'usdt', amount: prof.reward, note: `Робота: ${prof.name}`, ts: Date.now() });
        showGN(`💵 +${prof.reward.toFixed(2)} USDT за роботу ${prof.icon}`);
        renderWorkTab();
        startWorkCooldownTick();
    };

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
    const LOAN_RATE      = 0.05;   // 5% per week
    const LOAN_PENALTY   = 0.20;   // 20% penalty
    const BB_LOAN_LIMIT  = 500;
    const USDT_LOAN_LIMIT = 200;

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
        if (extState.bank.history.length > 200) extState.bank.history = extState.bank.history.slice(0, 200);
        await saveBankData();
    }

    async function checkOverdueLoans() {
        const u = getUser(); if (!u) return;
        const now = Date.now();
        let changed = false;
        for (const lid of Object.keys(extState.bank.loans)) {
            const loan = extState.bank.loans[lid];
            if (loan.status !== 'active') continue;
            if (now > loan.dueAt && !loan.penaltyApplied) {
                const penalty = Math.round(loan.remaining * LOAN_PENALTY * 100) / 100;
                loan.remaining = Math.round((loan.remaining + penalty) * 100) / 100;
                loan.penaltyApplied = true;
                await appendBankRecord({ type: 'penalty', currency: loan.currency, amount: penalty, note: `Штраф по кредиту #${lid.slice(-4)}`, ts: now });
                showGN(`⚠️ Штраф: +${penalty.toFixed(2)} ${loan.currency.toUpperCase()} по кредиту!`);
                // Try auto-repay
                if ((loan.currency === 'bb' && getBalance() >= loan.remaining) ||
                    (loan.currency === 'usdt' && getUsdt() >= loan.remaining)) {
                    await autoRepayLoan(lid);
                }
                changed = true;
            }
        }
        if (changed) await saveBankData();
    }

    async function autoRepayLoan(lid) {
        const u = getUser(); if (!u) return;
        const loan = extState.bank.loans[lid];
        if (!loan || loan.status !== 'active') return;
        const amount = loan.remaining;
        if (loan.currency === 'bb') {
            if (getBalance() < amount) return;
            const r = await adjustUserBalanceFirebase(u, -amount);
            if (!r?.success) return;
            if (typeof gameState !== 'undefined') gameState.balance = r.balance;
        } else {
            const cur = await loadUsdt(u);
            if (cur < amount) return;
            await saveUsdt(u, cur - amount);
        }
        loan.status = 'repaid';
        loan.repaidAt = Date.now();
        await appendBankRecord({ type: 'repay', currency: loan.currency, amount, note: `Авто-погашення кредиту #${lid.slice(-4)}`, ts: Date.now() });
        showGN(`✅ Кредит авто-погашено: -${amount.toFixed(2)} ${loan.currency.toUpperCase()}`);
        if (typeof updateHeader === 'function') updateHeader();
    }

    window.takeLoan = async function() {
        if (!extState.bank.bootstrapped) await loadBankData();
        const u = getUser(); if (!u) { showGN('❌ Не залогінено'); return; }
        const currency = document.getElementById('loan-currency')?.value || 'bb';
        const amount   = n(document.getElementById('loan-amount')?.value, 0);
        const dateStr  = document.getElementById('loan-return-date')?.value;

        if (amount <= 0) { showGN('❌ Вкажіть суму'); return; }
        const limit = currency === 'bb' ? BB_LOAN_LIMIT : USDT_LOAN_LIMIT;
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
        await appendBankRecord({ type: 'loan', currency, amount: totalDue, note: `Кредит: ${amount.toFixed(2)} ${currency.toUpperCase()} → погасити ${totalDue.toFixed(2)}`, ts: Date.now() });
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
        document.querySelectorAll('.bank-subtab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(panel === 'loans' ? 'кредит' : panel === 'history' ? 'історі' : 'статистик')));
        document.querySelectorAll('.bank-panel').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(`bank-panel-${panel}`);
        if (el) el.classList.add('active');
        if (panel === 'history') renderBankHistory();
        if (panel === 'stats')   renderBankStats();
    };

    function renderBankTab() {
        const loans = Object.entries(extState.bank.loans || {}).filter(([, l]) => l.status === 'active');
        const countEl = document.getElementById('bank-active-loans-count');
        if (countEl) countEl.textContent = loans.length;
        const debtEl = document.getElementById('bank-total-debt');
        if (debtEl) {
            const total = loans.reduce((s, [, l]) => s + n(l.remaining), 0);
            debtEl.textContent = `${total.toFixed(2)}`;
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
            const isIncome = h.type === 'loan' || h.type === 'work';
            return `<div class="transaction-item">
                <div class="transaction-head">
                    <div><b style="font-size:12px;">${esc(h.note || h.type)}</b></div>
                    <span class="transaction-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${n(h.amount).toFixed(2)} ${(h.currency || 'bb').toUpperCase()}</span>
                </div>
                <div class="transaction-meta"><span>${new Date(n(h.ts, Date.now())).toLocaleString('uk-UA')}</span></div>
            </div>`;
        }).join('');
    };

    window.renderBankStats = function() {
        const statsEl = document.getElementById('bank-stats-grid');
        const chartEl = document.getElementById('bank-stats-chart');
        const days = n(document.getElementById('bank-stats-period')?.value, 7);
        const since = days === 'all' ? 0 : Date.now() - days * 24 * 3600 * 1000;
        const items = extState.bank.history.filter(h => n(h.ts, 0) >= since);

        const totalLoans   = items.filter(h => h.type === 'loan').reduce((s, h) => s + n(h.amount), 0);
        const totalRepaid  = items.filter(h => h.type === 'repay').reduce((s, h) => s + n(h.amount), 0);
        const totalPenalty = items.filter(h => h.type === 'penalty').reduce((s, h) => s + n(h.amount), 0);
        const totalWork    = items.filter(h => h.type === 'work').reduce((s, h) => s + n(h.amount), 0);

        if (statsEl) statsEl.innerHTML = [
            ['Кредитів', totalLoans.toFixed(2)],
            ['Погашено',  totalRepaid.toFixed(2)],
            ['Штрафи',    totalPenalty.toFixed(2)],
            ['Зароблено (робота)', totalWork.toFixed(2) + ' USDT']
        ].map(([label, val]) => `<div class="market-stat"><div class="market-stat-label">${label}</div><div class="market-stat-value">${val}</div></div>`).join('');

        if (chartEl) {
            const byDay = {};
            items.filter(h => h.type === 'repay' || h.type === 'loan').forEach(h => {
                const dk = dateKey(n(h.ts));
                byDay[dk] = (byDay[dk] || 0) + n(h.amount);
            });
            const rows = Object.entries(byDay).sort().slice(-14);
            if (!rows.length) { chartEl.innerHTML = '<div style="color:var(--text2); font-size:12px;">Немає даних</div>'; return; }
            const max = Math.max(...rows.map(([, v]) => v), 1);
            chartEl.innerHTML = `<div style="display:flex; gap:4px; align-items:flex-end; height:80px; padding:0 4px;">${
                rows.map(([dk, v]) => `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;">
                    <div style="width:100%; height:${Math.max(4, Math.round((v/max)*64))}px; background:var(--p); border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:8px; color:var(--text2); writing-mode:vertical-rl; transform:rotate(180deg);">${dk.slice(5)}</div>
                </div>`).join('')
            }</div>`;
        }
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
    const MAX_PLAYERS = 15;
    const tournamentState = { activeTournamentId: null, myMatchId: null, bracket: null };

    window.createTournament = async function() {
        const u = getUser(); if (!u) { showGN('❌ Не залогінено'); return; }
        const name = document.getElementById('tournament-name-input')?.value.trim();
        const pass = document.getElementById('tournament-pass-input')?.value.trim();
        if (!name) { showGN('❌ Введіть назву'); return; }
        const tid = uid('tour');
        await db().ref(`tournaments/${tid}`).set({
            id: tid, name: esc(name), password: pass || '',
            host: u, status: 'waiting',
            players: { [u]: { name: u, joinedAt: Date.now() } },
            createdAt: Date.now()
        });
        tournamentState.activeTournamentId = tid;
        showGN(`✅ Турнір "${name}" створено! Код: ${tid.slice(-6)}`);
        document.getElementById('tournament-name-input').value = '';
        document.getElementById('tournament-pass-input').value = '';
        loadTournaments();
    };

    window.loadTournaments = async function() {
        const listEl = document.getElementById('tournament-list');
        if (!listEl) return;
        const snap = await db().ref('tournaments').orderByChild('status').equalTo('waiting').limitToLast(20).once('value');
        const raw = snap.val() || {};
        const tours = Object.values(raw).sort((a, b) => n(b.createdAt) - n(a.createdAt));
        if (!tours.length) { listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;">Немає відкритих турнірів</div>'; return; }
        listEl.innerHTML = tours.map(t => {
            const pCount = Object.keys(t.players || {}).length;
            const hasPass = !!t.password;
            const isHost = t.host === getUser();
            const joined = !!(t.players || {})[getUser()];
            return `<div class="tournament-item ${isHost || joined ? 'my-tournament' : ''}">
                <div>
                    <div style="font-size:13px; font-weight:900; color:var(--p);">${esc(t.name)}</div>
                    <div style="font-size:11px; color:var(--text2);">Хост: ${esc(t.host)} • ${pCount}/${MAX_PLAYERS} гравців ${hasPass ? '🔒' : ''}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    ${!joined && pCount < MAX_PLAYERS ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto;" onclick="joinTournament('${esc(t.id)}', ${hasPass})">ПРИЄДНАТИСЬ</button>` : ''}
                    ${(isHost || joined) && pCount >= 2 ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto; background:var(--g); color:#000;" onclick="viewTournamentBracket('${esc(t.id)}')">СІТКА</button>` : ''}
                    ${isHost && t.status === 'waiting' ? `<button class="btn" style="padding:8px 12px; font-size:11px; width:auto; background:var(--gold); color:#000;" onclick="startTournament('${esc(t.id)}')">СТАРТ</button>` : ''}
                </div>
            </div>`;
        }).join('');
    };

    window.joinTournament = async function(tid, hasPass) {
        const u = getUser(); if (!u) return;
        let pass = '';
        if (hasPass) {
            pass = prompt('Введіть пароль турніру:') || '';
        }
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t) { showGN('❌ Турнір не знайдено'); return; }
        if (t.password && t.password !== pass) { showGN('❌ Невірний пароль'); return; }
        const pCount = Object.keys(t.players || {}).length;
        if (pCount >= MAX_PLAYERS) { showGN('❌ Турнір заповнений'); return; }
        await db().ref(`tournaments/${tid}/players/${u}`).set({ name: u, joinedAt: Date.now() });
        showGN(`✅ Ви приєдналися до турніру "${t.name}"`);
        loadTournaments();
    };

    window.startTournament = async function(tid) {
        const u = getUser(); if (!u) return;
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t || t.host !== u) { showGN('❌ Тільки хост може запустити'); return; }
        const players = Object.keys(t.players || {});
        if (players.length < 2) { showGN('❌ Потрібно мінімум 2 гравці'); return; }
        // Build bracket
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        const bracket = buildBracket(shuffled);
        await db().ref(`tournaments/${tid}`).update({ status: 'active', bracket, bracketPlayers: shuffled });
        // Post to news
        if (typeof db !== 'undefined') {
            await db().ref('newsPosts').push({
                title: `🏆 Турнір "${esc(t.name)}" розпочато!`,
                text: `Організатор: ${esc(u)} • Гравці: ${players.length} • Переможець буде визначений після завершення турніру`,
                type: 'tournament',
                createdAt: Date.now(),
                author: u
            });
        }
        showGN(`🏆 Турнір "${t.name}" розпочато!`);
        viewTournamentBracket(tid);
    };

    function buildBracket(players) {
        // Single-elimination bracket rounds
        const rounds = [];
        let current = [...players];
        while (current.length > 1) {
            const round = [];
            for (let i = 0; i < current.length; i += 2) {
                if (i + 1 < current.length) {
                    round.push({ p1: current[i], p2: current[i+1], winner: null, status: 'pending' });
                } else {
                    round.push({ p1: current[i], p2: null, winner: current[i], status: 'bye' });
                }
            }
            rounds.push(round);
            current = round.map(m => m.winner || m.p1);
        }
        return rounds;
    }

    window.viewTournamentBracket = async function(tid) {
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t) return;
        tournamentState.activeTournamentId = tid;
        const bracketSection = document.getElementById('tournament-bracket-section');
        if (bracketSection) bracketSection.style.display = 'block';
        const titleEl = document.getElementById('tournament-title-display');
        if (titleEl) titleEl.textContent = `🏆 ${t.name}`;
        renderBracketUI(t);
        // Check if current user has a pending match
        checkMyTournamentMatch(t);
    };

    function renderBracketUI(t) {
        const el = document.getElementById('tournament-bracket');
        if (!el) return;
        const bracket = t.bracket || [];
        const stageNames = ['1/8', 'Чвертьфінал', 'Півфінал', 'Фінал'];
        el.innerHTML = bracket.map((round, ri) => {
            return `<div style="margin-bottom:14px;">
                <div class="bracket-stage-label">${stageNames[ri] || `Раунд ${ri+1}`}</div>
                ${round.map(m => `<div class="bracket-match">
                    <div class="bracket-player ${m.winner === m.p1 ? 'winner' : (m.winner ? 'loser' : '')}">${esc(m.p1 || '—')}</div>
                    <div style="font-size:10px; color:#555; text-align:center; margin:2px 0;">vs</div>
                    <div class="bracket-player ${m.winner === m.p2 ? 'winner' : (m.winner && m.p2 ? 'loser' : '')}">${esc(m.p2 || 'BYE')}</div>
                </div>`).join('')}
            </div>`;
        }).join('');

        // Check winner
        if (t.status === 'completed' && t.winner) {
            el.innerHTML += `<div class="glass" style="text-align:center; border-color:var(--gold); margin-top:12px;">
                <div style="font-size:1.6rem; margin-bottom:6px;">🏆</div>
                <div style="font-size:14px; font-weight:900; color:var(--gold);">Переможець: ${esc(t.winner)}</div>
            </div>`;
        }
    }

    function checkMyTournamentMatch(t) {
        const u = getUser(); if (!u || !t.bracket) return;
        const matchArea = document.getElementById('tournament-match-area');
        const matchVs = document.getElementById('tournament-match-vs');
        if (!matchArea || !matchVs) return;
        const bracket = t.bracket;
        for (const round of bracket) {
            for (const match of round) {
                if (match.status === 'pending' && (match.p1 === u || match.p2 === u)) {
                    const opp = match.p1 === u ? match.p2 : match.p1;
                    tournamentState.myMatchId = { tid: t.id, p1: match.p1, p2: match.p2 };
                    matchArea.style.display = 'block';
                    matchVs.textContent = `Ваш суперник: ${opp}`;
                    document.getElementById('tournament-match-result').textContent = '';
                    return;
                }
            }
        }
        matchArea.style.display = 'none';
    }

    window.tournamentChoose = async function(choice) {
        const u = getUser(); if (!u) return;
        const m = tournamentState.myMatchId;
        if (!m) return;
        const tid = m.tid;
        const snap = await db().ref(`tournaments/${tid}`).once('value');
        const t = snap.val();
        if (!t) return;
        const bracket = t.bracket;
        let matchRef = null, matchData = null;
        for (let ri = 0; ri < bracket.length; ri++) {
            for (let mi = 0; mi < bracket[ri].length; mi++) {
                const mm = bracket[ri][mi];
                if (mm.p1 === m.p1 && mm.p2 === m.p2 && mm.status === 'pending') {
                    matchRef = { ri, mi };
                    matchData = mm;
                    break;
                }
            }
            if (matchRef) break;
        }
        if (!matchRef || !matchData) { showGN('Матч не знайдено'); return; }

        // Store choice and auto-resolve (in real impl: wait for opponent; here: simulate opponent)
        const oppChoice = ['rock','scissors','paper'][Math.floor(Math.random() * 3)];
        const myChoice = choice;
        const winner = rpsWinnerCheck(myChoice, oppChoice);
        let matchWinner = null;
        if (winner === 1)  matchWinner = u;
        else if (winner === 2) matchWinner = (matchData.p1 === u ? matchData.p2 : matchData.p1);
        else matchWinner = u; // draw → current player wins (simplification)

        bracket[matchRef.ri][matchRef.mi].winner = matchWinner;
        bracket[matchRef.ri][matchRef.mi].status = 'done';

        // Propagate winners to next round
        advanceBracket(bracket);

        // Check if tournament done
        const lastRound = bracket[bracket.length - 1];
        const tournamentDone = lastRound.length === 1 && lastRound[0].winner;
        const updates = { bracket };
        if (tournamentDone) {
            updates.status = 'completed';
            updates.winner = lastRound[0].winner;
            // Grant win stat
            if (typeof db !== 'undefined' && lastRound[0].winner) {
                const wUser = lastRound[0].winner;
                await db().ref(`users/${wUser}/tournamentsWon`).transaction(v => (n(v, 0) + 1));
                await db().ref('newsPosts').push({
                    title: `🏆 Турнір "${esc(t.name)}" завершено!`,
                    text: `Переможець: ${esc(wUser)} 🎊`,
                    type: 'tournament_result',
                    createdAt: Date.now()
                });
            }
        }
        await db().ref(`tournaments/${tid}`).update(updates);

        const resEl = document.getElementById('tournament-match-result');
        const icons = { rock: '✊', scissors: '✌️', paper: '🖐️' };
        resEl.innerHTML = `${icons[myChoice]} vs ${icons[oppChoice]} → ${matchWinner === u ? '<span style="color:var(--g);">✅ Ви виграли!</span>' : '<span style="color:var(--r);">❌ Ви програли</span>'}`;
        tournamentState.myMatchId = null;
        setTimeout(() => viewTournamentBracket(tid), 1500);
    };

    function rpsWinnerCheck(c1, c2) {
        if (c1 === c2) return 0;
        if ((c1 === 'rock' && c2 === 'scissors') || (c1 === 'scissors' && c2 === 'paper') || (c1 === 'paper' && c2 === 'rock')) return 1;
        return 2;
    }

    function advanceBracket(bracket) {
        for (let ri = 0; ri < bracket.length - 1; ri++) {
            const nextRound = bracket[ri + 1];
            let ni = 0;
            for (let mi = 0; mi < bracket[ri].length; mi++) {
                const m = bracket[ri][mi];
                if (m.winner) {
                    const nextMatch = nextRound[Math.floor(mi / 2)];
                    if (nextMatch && !nextMatch.status) {
                        if (mi % 2 === 0) nextMatch.p1 = m.winner;
                        else nextMatch.p2 = m.winner;
                    }
                }
            }
        }
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
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setDate(diff));
        return `${mon.getFullYear()}-W${String(Math.ceil(mon.getDate()/7)).padStart(2,'0')}`;
    }

    async function getWeeklyQuestProgress(username) {
        if (!username) return 0;
        const wk = getWeekKey();
        const q = getCurrentWeeklyQuest();
        const snap = await db().ref(`weeklyProgress/${wk}/${username}/${q.key}`).once('value');
        return n(snap.val(), 0);
    }

    async function incrementWeeklyProgress(username, key, delta = 1) {
        if (!username) return;
        const wk = getWeekKey();
        await db().ref(`weeklyProgress/${wk}/${username}/${key}`).transaction(v => n(v, 0) + delta);
        // Check completion and promo assignment
        await checkWeeklyQuestCompletion(username);
    }

    async function checkWeeklyQuestCompletion(username) {
        if (!username) return;
        const q = getCurrentWeeklyQuest();
        const wk = getWeekKey();
        const progress = await getWeeklyQuestProgress(username);
        if (progress < q.target) return;

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
        { id: 'BBEX', name: 'BB Exchange',  icon: '💹', sector: 'Крипто',    basePrice: 10,  volatility: 0.12 },
        { id: 'MINE', name: 'MineCore',     icon: '⛏️', sector: 'Майнінг',   basePrice: 5,   volatility: 0.15 },
        { id: 'HOTR', name: 'HotelGroup',   icon: '🏨', sector: 'Туризм',    basePrice: 22,  volatility: 0.08 },
        { id: 'TECH', name: 'TechVenture',  icon: '🖥️', sector: 'Технології',basePrice: 35,  volatility: 0.18 },
        { id: 'AUTO', name: 'AutoDrive',    icon: '🚗', sector: 'Авто',      basePrice: 18,  volatility: 0.10 },
        { id: 'FOOD', name: 'FoodChain',    icon: '🍔', sector: 'Харчування',basePrice: 8,   volatility: 0.06 },
        { id: 'BANK', name: 'BB Bank',      icon: '🏦', sector: 'Фінанси',   basePrice: 45,  volatility: 0.07 },
        { id: 'GAME', name: 'GameStudio',   icon: '🎮', sector: 'Розваги',   basePrice: 12,  volatility: 0.20 },
        { id: 'REAL', name: 'RealtyMax',    icon: '🏠', sector: 'Нерухомість',basePrice: 28, volatility: 0.09 },
        { id: 'ENRG', name: 'EnergyPlus',   icon: '⚡', sector: 'Енергія',   basePrice: 15,  volatility: 0.11 }
    ];
    const STOCK_PRICE_INTERVAL_MS = 15 * 60 * 1000;

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

    function getBusinessDailyIncome(business, level) {
        return Math.round(n(business?.dailyIncome, 0) * Math.max(1, n(level, 0)) * 100) / 100;
    }

    function getBusinessPendingIncome(business, owned, now = Date.now()) {
        if (!business || !owned) return 0;
        const level = Math.max(1, n(owned.level, 1));
        const storedIncome = n(owned.pendingIncome, 0);
        const lastCollectedAt = n(owned.lastCollectedAt, now);
        const elapsedDays = Math.max(0, now - lastCollectedAt) / (24 * 3600 * 1000);
        const generatedIncome = getBusinessDailyIncome(business, level) * elapsedDays;
        return Math.round((storedIncome + generatedIncome) * 10000) / 10000;
    }

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
        // Pseudo-random price that changes every 15 minutes.
        // seed = current interval as integer; two large co-prime multipliers (1_000_003 and
        // 9_999_991) mix the seed with each character of the stock ID so that each stock
        // follows a distinct price path. The modulus 10_000 normalises the result to a
        // [0, 1) range used to apply the stock's volatility factor.
        const seed = Math.floor(time / STOCK_PRICE_INTERVAL_MS);
        let price = stock.basePrice;
        for (let i = 0; i < stockId.length; i++) {
            const h = (seed * 1000003 + stockId.charCodeAt(i) * 9999991) % 10000;
            price *= (1 + stock.volatility * (h / 10000 - 0.5));
        }
        return Math.max(0.01, Math.round(price * 100) / 100);
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
            const deltaColor = delta >= 0 ? 'var(--g)' : 'var(--r)';
            const deltaLabel = `${formatSigned(delta)} BB (${formatSigned(deltaPct)}%)`;
            return `<div class="stock-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div><span style="font-size:1.4rem;">${esc(s.icon)}</span> <b style="color:var(--p);">${esc(s.id)}</b><br><span style="font-size:11px; color:var(--text2);">${esc(s.name)} • ${esc(s.sector)}</span></div>
                    <div style="text-align:right;"><div style="font-size:16px; font-weight:900;">${price.toFixed(2)} BB</div><div style="font-size:11px; color:${deltaColor};">${deltaLabel}</div>${owned > 0 ? `<div style="font-size:11px; color:${pnl >= 0 ? 'var(--g)' : 'var(--r)'};">${formatSigned(pnl)} BB</div>` : ''}</div>
                </div>
                ${owned > 0 ? `<div style="font-size:11px; color:var(--text2); margin-bottom:8px;">Моє: ${owned} акцій • Сер. купівля: ${avgBuy.toFixed(2)}</div>` : ''}
                <div style="display:flex; gap:6px;">
                    <input type="number" id="stock-qty-${esc(s.id)}" placeholder="К-сть" min="1" step="1" style="flex:1; padding:8px; font-size:12px;">
                    <button class="btn" style="width:auto; padding:8px 12px; font-size:11px; background:var(--g); color:#000;" onclick="buyStock('${esc(s.id)}')">КУПИТИ</button>
                    ${owned > 0 ? `<button class="btn" style="width:auto; padding:8px 12px; font-size:11px; background:var(--r); color:#fff;" onclick="sellStock('${esc(s.id)}')">ПРОДАТИ</button>` : ''}
                </div>
            </div>`;
        }).join('');
        // Update portfolio value
        let totalValue = 0, totalPnl = 0;
        STOCKS_CATALOG.forEach(s => {
            const p = extState.stocks.portfolio[s.id];
            if (!p?.shares) return;
            const price = getStockPrice(s.id, now);
            totalValue += price * p.shares;
            totalPnl += (price - n(p.avgPrice)) * p.shares;
        });
        const valEl = document.getElementById('stocks-portfolio-value');
        const pnlEl = document.getElementById('stocks-portfolio-pnl');
        if (valEl) valEl.textContent = `${totalValue.toFixed(2)} BB`;
        if (pnlEl) { pnlEl.textContent = `${formatSigned(totalPnl)} BB`; pnlEl.style.color = totalPnl >= 0 ? 'var(--g)' : 'var(--r)'; }
    }

    window.buyStock = async function(stockId) {
        const u = getUser(); if (!u) return;
        const qty = n(document.getElementById(`stock-qty-${stockId}`)?.value, 0);
        if (qty <= 0) { showGN('❌ Вкажіть кількість'); return; }
        const price = getStockPrice(stockId);
        const total = Math.round(price * qty * 100) / 100;
        if (getBalance() < total) { showGN(`❌ Потрібно ${total.toFixed(2)} BB`); return; }
        const r = await adjustUserBalanceFirebase(u, -total);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        const cur = extState.stocks.portfolio[stockId] || { shares: 0, avgPrice: 0 };
        const newShares = cur.shares + qty;
        const newAvg = ((cur.avgPrice * cur.shares) + (price * qty)) / newShares;
        extState.stocks.portfolio[stockId] = { shares: newShares, avgPrice: Math.round(newAvg * 100) / 100 };
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
        const total = Math.round(price * qty * 100) / 100;
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

    function renderBusinessTab() {
        const listEl = document.getElementById('business-list');
        if (!listEl) return;
        const now = Date.now();
        listEl.innerHTML = BUSINESS_CATALOG.map(b => {
            const owned = extState.stocks.businesses[b.id];
            const level = owned ? Math.max(1, n(owned.level, 1)) : 1;
            const isOwned = !!owned;
            const upgradePrice = isOwned ? Math.round(b.price * level * 0.5) : b.price;
            const income = isOwned ? getBusinessDailyIncome(b, level) : b.dailyIncome;
            const pending = isOwned ? getBusinessPendingIncome(b, owned, now) : 0;
            return `<div class="business-card ${isOwned ? 'owned' : ''}">
                <div style="font-size:2rem; margin-bottom:6px;">${esc(b.icon)}</div>
                <div style="font-size:13px; font-weight:900; color:var(--p); margin-bottom:4px;">${esc(b.name)}</div>
                ${isOwned ? `<div class="pill success" style="margin-bottom:6px;">Рівень ${level}</div>` : ''}
                <div style="font-size:11px; color:var(--text2);">💰 Дохід: ${income.toFixed(2)} BB/добу</div>
                ${isOwned && pending > 0 ? `<div style="font-size:12px; color:var(--g); margin-top:4px;">💵 Накопичено: ${pending.toFixed(4)} BB</div>` : ''}
                <div style="margin-top:10px; display:flex; gap:6px;">
                    ${isOwned
                        ? `<button class="btn secondary-btn" style="padding:8px; font-size:11px;" onclick="collectBusinessIncome('${esc(b.id)}')">📥 ЗІБРАТИ</button>
                           ${level < b.maxLevel ? `<button class="btn" style="padding:8px; font-size:11px; background:var(--gold); color:#000;" onclick="upgradeBusiness('${esc(b.id)}')">⬆ ${upgradePrice} BB</button>` : '<span class="pill success" style="font-size:10px;">MAX</span>'}`
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
        if (extState.stocks.businesses[bId]) { showGN('Вже куплено'); return; }
        if (getBalance() < b.price) { showGN(`❌ Потрібно ${b.price} BB`); return; }
        const r = await adjustUserBalanceFirebase(u, -b.price);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        extState.stocks.businesses[bId] = { level: 1, boughtAt: Date.now(), lastCollectedAt: Date.now(), pendingIncome: 0 };
        await saveStocksData();
        showGN(`✅ ${b.icon} ${b.name} куплено!`);
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

    window.collectBusinessIncome = async function(bId) {
        const u = getUser(); if (!u) return;
        const b = BUSINESS_CATALOG.find(x => x.id === bId);
        const owned = extState.stocks.businesses[bId];
        if (!b || !owned) return;
        const now = Date.now();
        const income = getBusinessPendingIncome(b, owned, now);
        if (income < 0.0001) { showGN('❌ Ще мало накопичено'); return; }
        const r = await adjustUserBalanceFirebase(u, income);
        if (!r?.success) { showGN('❌ Помилка'); return; }
        if (typeof gameState !== 'undefined') { gameState.balance = r.balance; updateHeader(); }
        owned.lastCollectedAt = now;
        owned.pendingIncome = 0;
        await saveStocksData();
        showGN(`✅ Зібрано: +${income.toFixed(4)} BB з ${b.name}`);
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
                return `<div class="activity-card"><b style="color:var(--p);">${esc(b.icon)} ${esc(b.name)}</b> Рівень ${n(ow.level,1)} | Дохід: ${getBusinessDailyIncome(b, n(ow.level,1)).toFixed(2)} BB/добу | Накопичено: ${pending.toFixed(4)} BB</div>`;
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
        renderWeeklyQuest();
        startWorkCooldownTick();
    }

    function onExtLogout() {
        extState.work = { jobId: 'freelancer', xp: 0, lastWorkAt: 0, totalEarned: 0 };
        extState.bank = { loans: {}, history: [], bootstrapped: false };
        extState.stocks = { portfolio: {}, businesses: {} };
        if (extState.workCooldownTimer) { clearInterval(extState.workCooldownTimer); extState.workCooldownTimer = null; }
        minesState.active = false;
        tournamentState.activeTournamentId = null;
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
