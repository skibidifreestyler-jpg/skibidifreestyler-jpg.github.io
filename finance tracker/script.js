// ==========================================
// 1. IMPORTS
// ==========================================

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    collection,
    onSnapshot,
    runTransaction,
    Timestamp,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
    $,
    round2,
    toast,
    initTheme,
    initMobileMenu,
    initProfileMenu,
    showProfile,
    formatMoney as formatMoneyIn,
    getLocalDateString,
    startOfDay,
    toDate
} from "./ui.js";

import { DEFAULT_CATEGORIES, findCategory } from "./categories.js";


// ==========================================
// 2. STATE & CONSTANTS
// ==========================================

let currentUser = null;
let dashboardStarted = false;

let userCurrency = "EUR";
let monthlyBudget = 0;

let accounts = [];
let transactions = [];
let categories = DEFAULT_CATEGORIES;

let selectedAccountId = "all";
let editingTransaction = null;

let transactionChart = null;
let categoryChart = null;

let unsubscribeListeners = [];

const DAY = 86400000;

const CHART_COLORS = [
    "#3165e8", "#49b99a", "#f0a45d", "#d8759b",
    "#9a8be8", "#65a7d9", "#e7c75b", "#8a93a6"
];

const GREEN = "#49b99a";
const PINK = "#d8759b";

const formatMoney = (amount) => formatMoneyIn(amount, userCurrency);

const effectOf = (type, amount) => (type === "income" ? amount : -amount);

const shortDate = (date) =>
    date.toLocaleDateString("en", { month: "short", day: "numeric" });


// ==========================================
// 3. ELEMENTS
// ==========================================

const welcomeTitle = $("welcomeTitle");

const accountFilter = $("accountFilter");
const periodFilter = $("periodFilter");

const transactionForm = $("transactionForm");
const transactionDescription = $("transactionDescription");
const transactionAmount = $("transactionAmount");
const transactionType = $("transactionType");
const transactionCategory = $("transactionCategory");
const transactionAccount = $("transactionAccount");
const transactionDate = $("transactionDate");
const transactionMessage = $("transactionMessage");
const addTransactionButton = $("addTransactionButton");
const addAccountShortcut = $("addAccountShortcut");
const transactionList = $("transactionList");

const searchInput = $("searchInput");
const typeFilter = $("typeFilter");
const resultCount = $("resultCount");

const transactionChartCanvas = $("transactionChart");
const categoryChartCanvas = $("categoryChart");
const transactionChartType = $("transactionChartType");
const categoryChartType = $("categoryChartType");
const categoryEmpty = $("categoryEmpty");

const accountsDialog = $("accountsDialog");
const accountsList = $("accountsList");
const accountForm = $("accountForm");
const accountName = $("accountName");
const accountBalance = $("accountBalance");
const saveAccount = $("saveAccount");

const budgetDialog = $("budgetDialog");
const budgetForm = $("budgetForm");
const budgetInput = $("budgetInput");

const editDialog = $("editDialog");
const editForm = $("editForm");
const editDescription = $("editDescription");
const editAmount = $("editAmount");
const editType = $("editType");
const editCategory = $("editCategory");
const editAccount = $("editAccount");
const editDate = $("editDate");
const saveEdit = $("saveEdit");

let period = periodFilter.value;

transactionDate.value = getLocalDateString();


// ==========================================
// 4. PAGE CHROME (theme, menu, profile)
// ==========================================

initTheme(() => {
    // Charts read their colors when created, so rebuild them.
    if (transactionChart) {
        createTransactionChart();
        createCategoryChart();
    }
});

initMobileMenu();

initProfileMenu(async () => {
    try {
        await signOut(auth);
        window.location.replace("auth.html");
    } catch (error) {
        console.error("Logout failed:", error);
        toast("Could not log out. Please try again.", "error");
    }
});

// Highlight the clicked in-page link (Accounts and Settings are not scroll links)
document.querySelectorAll('.navigation a[href^="#"]').forEach((link) => {
    if (link.id === "openAccounts") return;

    link.addEventListener("click", () => {
        document.querySelectorAll(".navigation a")
            .forEach((a) => a.classList.remove("active"));

        link.classList.add("active");
    });
});


// ==========================================
// 5. PERIODS
// ==========================================

function getRanges() {
    const today = startOfDay(new Date());
    const end = new Date(today.getTime() + DAY - 1);

    if (period === "7d" || period === "30d") {
        const days = period === "7d" ? 7 : 30;

        const start = new Date(today);
        start.setDate(start.getDate() - (days - 1));

        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - days);

        return {
            start, end, prevStart, prevEnd,
            label: `${shortDate(start)} – ${shortDate(today)}`
        };
    }

    if (period === "month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevEnd = new Date(start.getTime() - 1);

        return {
            start, end, prevStart, prevEnd,
            label: today.toLocaleDateString("en", { month: "long", year: "numeric" })
        };
    }

    return {
        start: null, end: null, prevStart: null, prevEnd: null,
        label: "All time"
    };
}

function inRange(transaction, start, end) {
    if (!transaction._d) return false;
    if (!start) return true;
    return transaction._d >= start && transaction._d <= end;
}


// ==========================================
// 6. VISIBLE DATA
// ==========================================

function getVisibleAccounts() {
    return selectedAccountId === "all"
        ? accounts
        : accounts.filter((a) => a.id === selectedAccountId);
}

function getVisibleTransactions() {
    return selectedAccountId === "all"
        ? transactions
        : transactions.filter((t) => t.accountId === selectedAccountId);
}

const sumOf = (list, type) =>
    list.filter((t) => t.type === type)
        .reduce((total, t) => total + t.amount, 0);


// ==========================================
// 7. DASHBOARD
// ==========================================

function renderDelta(element, current, previous, hasPrevious, goodWhenUp) {
    element.classList.remove("positive", "negative");

    if (!hasPrevious) {
        element.textContent = "All-time total";
        return;
    }

    if (previous === 0) {
        element.textContent = current === 0 ? "No change" : "New this period";
        return;
    }

    const pct = ((current - previous) / previous) * 100;

    if (Math.abs(pct) < 0.5) {
        element.textContent = "No change vs previous period";
        return;
    }

    element.textContent =
        `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs previous period`;

    element.classList.add((pct > 0) === goodWhenUp ? "positive" : "negative");
}

function updateStats() {
    const ranges = getRanges();
    const visible = getVisibleTransactions();

    const current = visible.filter((t) => inRange(t, ranges.start, ranges.end));
    const previous = ranges.prevStart
        ? visible.filter((t) => inRange(t, ranges.prevStart, ranges.prevEnd))
        : [];

    const hasPrevious = Boolean(ranges.prevStart);

    const income = sumOf(current, "income");
    const expenses = sumOf(current, "expense");

    const balance = getVisibleAccounts()
        .reduce((total, a) => total + Number(a.balance || 0), 0);

    $("remainingAmount").textContent = formatMoney(balance);

    $("remainingNote").textContent =
        selectedAccountId === "all"
            ? `Across ${accounts.length} account${accounts.length === 1 ? "" : "s"}`
            : (getVisibleAccounts()[0]?.name || "Account");

    document.querySelectorAll(".period-label")
        .forEach((el) => { el.textContent = ranges.label; });

    $("incomeAmount").textContent = formatMoney(income);
    $("expensesAmount").textContent = formatMoney(expenses);

    renderDelta($("incomeDelta"), income, sumOf(previous, "income"), hasPrevious, true);
    renderDelta($("expensesDelta"), expenses, sumOf(previous, "expense"), hasPrevious, false);

    // Savings rate
    const savingsRate = $("savingsRate");
    const savingsNote = $("savingsNote");

    savingsRate.classList.remove("positive", "negative");

    if (income > 0) {
        const rate = ((income - expenses) / income) * 100;

        savingsRate.textContent = `${rate.toFixed(0)}%`;
        savingsRate.classList.add(rate >= 0 ? "positive" : "negative");

        savingsNote.textContent = rate >= 0
            ? "of your income was kept"
            : "You spent more than you earned";
    } else {
        savingsRate.textContent = "–";
        savingsNote.textContent = "Add income to see this.";
    }

    // Top category
    const totals = {};

    current.filter((t) => t.type === "expense").forEach((t) => {
        const name = t.categoryName || "Other";
        totals[name] = (totals[name] || 0) + t.amount;
    });

    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];

    if (top && expenses > 0) {
        $("topCategory").textContent =
            `${findCategory(categories, top[0]).icon} ${top[0]}`;

        $("topCategoryNote").textContent =
            `${formatMoney(top[1])} · ${((top[1] / expenses) * 100).toFixed(0)}% of expenses`;
    } else {
        $("topCategory").textContent = "–";
        $("topCategoryNote").textContent = "No expenses in this period.";
    }

    updateBudget();
}

function updateBudget() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const spent = transactions
        .filter((t) => t.type === "expense" && t._d && t._d >= monthStart)
        .reduce((total, t) => total + t.amount, 0);

    const bar = $("budgetBar");
    const progress = $("budgetProgress");
    const note = $("budgetNote");

    progress.classList.remove("warn", "over");
    note.classList.remove("positive", "negative");

    if (monthlyBudget > 0) {
        const pct = (spent / monthlyBudget) * 100;

        $("budgetText").textContent = "Spent this month";
        $("budgetAmount").textContent =
            `${formatMoney(spent)} / ${formatMoney(monthlyBudget)}`;

        bar.style.width = `${Math.min(100, pct)}%`;

        if (pct >= 100) {
            progress.classList.add("over");
            note.classList.add("negative");
            note.textContent = `${formatMoney(spent - monthlyBudget)} over budget`;
        } else {
            if (pct >= 80) progress.classList.add("warn");
            note.textContent = `${formatMoney(monthlyBudget - spent)} left · ${pct.toFixed(0)}% used`;
        }

        $("budgetButton").textContent = "Edit budget";
    } else {
        $("budgetText").textContent = "No budget set";
        $("budgetAmount").textContent = "–";
        bar.style.width = "0";
        note.textContent = "Set a monthly limit to track your spending.";
        $("budgetButton").textContent = "Set budget";
    }
}

function updateDashboard() {
    updateStats();
    updateTransactionChart();
    updateCategoryChart();
    renderTransactions();
}


// ==========================================
// 8. CHARTS
// ==========================================

function applyChartDefaults() {
    const styles = getComputedStyle(document.documentElement);

    Chart.defaults.font.family = "'Nunito', sans-serif";
    Chart.defaults.color = styles.getPropertyValue("--muted").trim() || "#7a8398";
}

function chartColors() {
    const styles = getComputedStyle(document.documentElement);

    return {
        grid: styles.getPropertyValue("--border").trim() || "#e6e9f0",
        card: styles.getPropertyValue("--card").trim() || "#ffffff"
    };
}

function getBuckets() {
    const today = startOfDay(new Date());
    const buckets = [];

    if (period === "all") {
        let earliest = today;

        getVisibleTransactions().forEach((t) => {
            if (t._d && t._d < earliest) earliest = t._d;
        });

        let first = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
        const limit = new Date(today.getFullYear(), today.getMonth() - 11, 1);

        if (first < limit) first = limit;

        for (
            let d = new Date(first);
            d <= today;
            d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        ) {
            buckets.push({
                start: new Date(d),
                end: new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, -1),
                label: d.toLocaleDateString("en", { month: "short", year: "2-digit" })
            });
        }

        return buckets;
    }

    const { start } = getRanges();
    const weekdayLabels = period === "7d";

    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        buckets.push({
            start: new Date(d),
            end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
            label: weekdayLabels
                ? d.toLocaleDateString("en", { weekday: "short" })
                : shortDate(d)
        });
    }

    return buckets;
}

function updateTransactionChart() {
    if (!transactionChart) return;

    const buckets = getBuckets();
    const income = Array(buckets.length).fill(0);
    const expenses = Array(buckets.length).fill(0);

    getVisibleTransactions().forEach((t) => {
        if (!t._d) return;

        const index = buckets.findIndex((b) => t._d >= b.start && t._d <= b.end);
        if (index === -1) return;

        if (t.type === "income") income[index] += t.amount;
        if (t.type === "expense") expenses[index] += t.amount;
    });

    transactionChart.data.labels = buckets.map((b) => b.label);
    transactionChart.data.datasets[0].data = income;
    transactionChart.data.datasets[1].data = expenses;
    transactionChart.update();
}

function updateCategoryChart() {
    if (!categoryChart) return;

    const ranges = getRanges();
    const totals = {};

    getVisibleTransactions()
        .filter((t) => t.type === "expense" && inRange(t, ranges.start, ranges.end))
        .forEach((t) => {
            const name = t.categoryName || "Other";
            totals[name] = (totals[name] || 0) + t.amount;
        });

    const labels = Object.keys(totals);

    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = Object.values(totals);

    // Use each category's own color, with the palette as a fallback
    categoryChart.data.datasets[0].backgroundColor = labels.map((name, i) =>
        categories.find((c) => c.name === name)?.color ||
        CHART_COLORS[i % CHART_COLORS.length]
    );

    categoryChart.update();

    categoryEmpty.classList.toggle("hidden", labels.length > 0);
}

function createTransactionChart() {
    if (transactionChart) transactionChart.destroy();

    const kind = transactionChartType.value;
    const isBar = kind === "bar";
    const colors = chartColors();

    const dataset = (label, color, fill) => ({
        label,
        data: [],
        borderColor: color,
        backgroundColor: isBar ? color : fill,
        fill: kind === "area",
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: color,
        borderWidth: isBar ? 0 : 2,
        borderRadius: 6
    });

    transactionChart = new Chart(transactionChartCanvas, {
        type: isBar ? "bar" : "line",
        data: {
            labels: [],
            datasets: [
                dataset("Income", GREEN, "rgba(73,185,154,0.15)"),
                dataset("Expenses", PINK, "rgba(216,117,155,0.15)")
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "top",
                    align: "end",
                    labels: { usePointStyle: true, boxWidth: 8 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: colors.grid },
                    ticks: {
                        callback: (v) =>
                            new Intl.NumberFormat("en", { notation: "compact" }).format(v)
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                }
            }
        }
    });

    updateTransactionChart();
}

function createCategoryChart() {
    if (categoryChart) categoryChart.destroy();

    const kind = categoryChartType.value;
    const colors = chartColors();

    categoryChart = new Chart(categoryChartCanvas, {
        type: kind,
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: CHART_COLORS,
                borderWidth: 2,
                borderColor: colors.card
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: kind === "doughnut" ? "65%" : 0,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, boxWidth: 8, padding: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatMoney(ctx.parsed)}`
                    }
                }
            }
        }
    });

    updateCategoryChart();
}

function initializeCharts() {
    if (typeof Chart === "undefined") {
        console.error("Chart.js was not loaded.");
        return;
    }

    applyChartDefaults();
    createTransactionChart();
    createCategoryChart();
}

transactionChartType.addEventListener("change", () => {
    if (transactionChart) createTransactionChart();
});

categoryChartType.addEventListener("change", () => {
    if (categoryChart) createCategoryChart();
});


// ==========================================
// 9. FILTERS & ACCOUNT SELECTORS
// ==========================================

accountFilter.addEventListener("change", () => {
    selectedAccountId = accountFilter.value;
    updateDashboard();
});

periodFilter.addEventListener("change", () => {
    period = periodFilter.value;
    updateDashboard();
});

searchInput.addEventListener("input", renderTransactions);
typeFilter.addEventListener("change", renderTransactions);

function populateAccountSelectors() {
    const previousFilter = selectedAccountId;
    const previousFormAccount = transactionAccount.value;

    accountFilter.replaceChildren(new Option("All accounts", "all"));
    transactionAccount.replaceChildren();

    accounts.forEach((account) => {
        const name = account.name || "Unnamed account";

        accountFilter.appendChild(new Option(name, account.id));
        transactionAccount.appendChild(new Option(name, account.id));
    });

    selectedAccountId = accounts.some((a) => a.id === previousFilter)
        ? previousFilter
        : "all";

    accountFilter.value = selectedAccountId;

    if (accounts.some((a) => a.id === previousFormAccount)) {
        transactionAccount.value = previousFormAccount;
    } else if (accounts.length > 0) {
        transactionAccount.value = accounts[0].id;
    }

    const noAccounts = accounts.length === 0;

    addTransactionButton.disabled = noAccounts;
    addAccountShortcut.classList.toggle("hidden", !noAccounts);

    transactionMessage.textContent = noAccounts
        ? "Create a bank account before adding transactions."
        : "";
}


// ==========================================
// 10. CATEGORY SELECTS
// ==========================================

function categoriesOfType(type) {
    const list = categories.filter((c) => c.type === type);

    return list.length > 0
        ? list
        : DEFAULT_CATEGORIES.filter((c) => c.type === type);
}

// keepUnknown: keep a category that no longer exists (used when editing an old transaction)
function fillCategorySelect(select, type, selected = "", keepUnknown = false) {
    const items = categoriesOfType(type).map((c) => ({ name: c.name, icon: c.icon }));

    if (keepUnknown && selected && !items.some((i) => i.name === selected)) {
        items.push({ name: selected, icon: findCategory(categories, selected).icon });
    }

    select.replaceChildren(
        ...items.map((i) => new Option(`${i.icon} ${i.name}`, i.name))
    );

    if (items.some((i) => i.name === selected)) {
        select.value = selected;
    }
}

function refreshCategorySelects() {
    fillCategorySelect(
        transactionCategory,
        transactionType.value,
        transactionCategory.value
    );
}

transactionType.addEventListener("change", () => {
    fillCategorySelect(transactionCategory, transactionType.value);
});

editType.addEventListener("change", () => {
    fillCategorySelect(editCategory, editType.value);
});

refreshCategorySelects();


// ==========================================
// 11. TRANSACTION LIST
// ==========================================

function getFilteredTransactions() {
    const ranges = getRanges();
    const query = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;

    return getVisibleTransactions()
        .filter((t) => inRange(t, ranges.start, ranges.end))
        .filter((t) => type === "all" || t.type === type)
        .filter((t) => !query ||
            (t.description || "").toLowerCase().includes(query) ||
            (t.categoryName || "").toLowerCase().includes(query))
        .sort((a, b) => (b._d?.getTime() || 0) - (a._d?.getTime() || 0));
}

function renderTransactions() {
    transactionList.replaceChildren();

    const filtered = getFilteredTransactions();
    const shown = filtered.slice(0, 100);

    resultCount.textContent = filtered.length === 0
        ? ""
        : `Showing ${shown.length} of ${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;

    if (filtered.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-list";
        empty.textContent = transactions.length === 0
            ? "No transactions yet. Add your first one!"
            : "No transactions match your filters.";

        transactionList.appendChild(empty);
        return;
    }

    shown.forEach((t) => {
        const isIncome = t.type === "income";
        const account = accounts.find((a) => a.id === t.accountId);

        const row = document.createElement("div");
        row.className = "tx-row";

        const icon = document.createElement("div");
        icon.className = "tx-icon";
        icon.textContent = findCategory(categories, t.categoryName).icon;

        const details = document.createElement("div");
        details.className = "transaction-details";

        const title = document.createElement("strong");
        title.textContent = t.description || "Transaction";

        const meta = document.createElement("span");
        meta.textContent = [
            t.categoryName || "Other",
            account?.name || "Unknown account",
            t._d ? t._d.toLocaleDateString() : "Unknown date"
        ].join(" · ");

        details.append(title, meta);

        const amount = document.createElement("strong");
        amount.className = isIncome ? "transaction-income" : "transaction-expense";
        amount.textContent = `${isIncome ? "+" : "-"}${formatMoney(t.amount)}`;

        const actions = document.createElement("div");
        actions.className = "tx-actions";

        const edit = document.createElement("button");
        edit.className = "tx-edit";
        edit.type = "button";
        edit.textContent = "✎";
        edit.setAttribute("aria-label", `Edit ${t.description || "transaction"}`);
        edit.addEventListener("click", () => openEditDialog(t));

        const remove = document.createElement("button");
        remove.className = "tx-delete";
        remove.type = "button";
        remove.textContent = "✕";
        remove.setAttribute("aria-label", `Delete ${t.description || "transaction"}`);
        remove.addEventListener("click", () => deleteTransaction(t));

        actions.append(edit, remove);

        row.append(icon, details, amount, actions);
        transactionList.appendChild(row);
    });
}


// ==========================================
// 12. VALIDATION (shared by add + edit)
// ==========================================

function validateTransaction({ description, amount, type, categoryName, accountId, dateValue }) {
    description = description.trim();
    amount = round2(amount);

    if (!description || description.length > 100) {
        throw new Error("Enter a description of up to 100 characters.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter an amount greater than zero.");
    }

    if (!["income", "expense"].includes(type)) {
        throw new Error("Invalid transaction type.");
    }

    if (!accounts.some((a) => a.id === accountId)) {
        throw new Error("Please select a valid bank account.");
    }

    const when = new Date(`${dateValue}T12:00:00`);

    if (!dateValue || Number.isNaN(when.getTime())) {
        throw new Error("Invalid transaction date.");
    }

    return { description, amount, type, categoryName, accountId, when };
}


// ==========================================
// 13. ADD TRANSACTION
// ==========================================

transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
        toast("Please sign in first.", "error");
        return;
    }

    let data;

    try {
        data = validateTransaction({
            description: transactionDescription.value,
            amount: transactionAmount.value,
            type: transactionType.value,
            categoryName: transactionCategory.value,
            accountId: transactionAccount.value,
            dateValue: transactionDate.value
        });
    } catch (error) {
        toast(error.message, "error");
        return;
    }

    const accountRef = doc(db, "users", currentUser.uid, "accounts", data.accountId);
    const transactionRef = doc(collection(db, "users", currentUser.uid, "transactions"));

    addTransactionButton.disabled = true;
    addTransactionButton.textContent = "Saving...";

    try {
        await runTransaction(db, async (t) => {
            const snapshot = await t.get(accountRef);

            if (!snapshot.exists()) {
                throw new Error("The selected bank account does not exist.");
            }

            const balance = Number(snapshot.data().balance || 0);

            if (!Number.isFinite(balance)) {
                throw new Error("The account has an invalid balance.");
            }

            t.update(accountRef, {
                balance: round2(balance + effectOf(data.type, data.amount))
            });

            t.set(transactionRef, {
                description: data.description,
                amount: data.amount,
                type: data.type,
                categoryName: data.categoryName,
                accountId: data.accountId,
                date: Timestamp.fromDate(data.when),
                createdAt: serverTimestamp()
            });
        });

        const accountId = data.accountId;

        transactionForm.reset();
        transactionDate.value = getLocalDateString();
        fillCategorySelect(transactionCategory, transactionType.value);
        transactionAccount.value = accountId;

        toast("Transaction added.");

    } catch (error) {
        console.error("Transaction creation failed:", error);
        toast(error.message || "Could not save the transaction.", "error");

    } finally {
        addTransactionButton.disabled = accounts.length === 0;
        addTransactionButton.textContent = "Add transaction";
    }
});


// ==========================================
// 14. EDIT TRANSACTION
// ==========================================

function openEditDialog(transaction) {
    editingTransaction = transaction;

    editDescription.value = transaction.description || "";
    editAmount.value = transaction.amount;
    editType.value = transaction.type;

    fillCategorySelect(editCategory, transaction.type, transaction.categoryName, true);

    editAccount.replaceChildren(
        ...accounts.map((a) => new Option(a.name || "Unnamed account", a.id))
    );

    if (accounts.some((a) => a.id === transaction.accountId)) {
        editAccount.value = transaction.accountId;
    }

    editDate.value = getLocalDateString(transaction._d || new Date());

    editDialog.showModal();
}

async function updateTransaction(id, data) {
    const uid = currentUser.uid;

    const transactionRef = doc(db, "users", uid, "transactions", id);
    const newAccountRef = doc(db, "users", uid, "accounts", data.accountId);

    await runTransaction(db, async (t) => {

        // All reads first
        const transactionSnap = await t.get(transactionRef);

        if (!transactionSnap.exists()) {
            throw new Error("This transaction no longer exists.");
        }

        const old = transactionSnap.data();

        const oldEffect = effectOf(old.type, Number(old.amount || 0));
        const newEffect = effectOf(data.type, data.amount);

        const oldAccountRef = old.accountId
            ? doc(db, "users", uid, "accounts", old.accountId)
            : null;

        const sameAccount = oldAccountRef !== null && old.accountId === data.accountId;

        const newAccountSnap = await t.get(newAccountRef);

        if (!newAccountSnap.exists()) {
            throw new Error("The selected bank account does not exist.");
        }

        const oldAccountSnap = oldAccountRef && !sameAccount
            ? await t.get(oldAccountRef)
            : null;

        // Then writes
        const newBalance = Number(newAccountSnap.data().balance || 0);

        if (sameAccount) {
            t.update(newAccountRef, {
                balance: round2(newBalance - oldEffect + newEffect)
            });
        } else {
            t.update(newAccountRef, { balance: round2(newBalance + newEffect) });

            if (oldAccountSnap?.exists()) {
                t.update(oldAccountRef, {
                    balance: round2(Number(oldAccountSnap.data().balance || 0) - oldEffect)
                });
            }
        }

        t.update(transactionRef, {
            description: data.description,
            amount: data.amount,
            type: data.type,
            categoryName: data.categoryName,
            accountId: data.accountId,
            date: Timestamp.fromDate(data.when),
            updatedAt: serverTimestamp()
        });
    });
}

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !editingTransaction) return;

    let data;

    try {
        data = validateTransaction({
            description: editDescription.value,
            amount: editAmount.value,
            type: editType.value,
            categoryName: editCategory.value,
            accountId: editAccount.value,
            dateValue: editDate.value
        });
    } catch (error) {
        toast(error.message, "error");
        return;
    }

    saveEdit.disabled = true;

    try {
        await updateTransaction(editingTransaction.id, data);

        editDialog.close();
        editingTransaction = null;

        toast("Transaction updated.");

    } catch (error) {
        console.error("Edit failed:", error);
        toast(error.message || "Could not update the transaction.", "error");

    } finally {
        saveEdit.disabled = false;
    }
});

$("closeEdit").addEventListener("click", () => editDialog.close());


// ==========================================
// 15. DELETE + UNDO
// ==========================================

async function deleteTransaction(transaction) {
    if (!currentUser) return;

    const uid = currentUser.uid;

    const transactionRef = doc(db, "users", uid, "transactions", transaction.id);

    const accountRef = transaction.accountId
        ? doc(db, "users", uid, "accounts", transaction.accountId)
        : null;

    try {
        await runTransaction(db, async (t) => {
            let accountSnap = null;

            if (accountRef) accountSnap = await t.get(accountRef);

            if (accountSnap?.exists()) {
                const balance = Number(accountSnap.data().balance || 0);

                t.update(accountRef, {
                    balance: round2(balance - effectOf(transaction.type, transaction.amount))
                });
            }

            t.delete(transactionRef);
        });

        const { id, _d, ...saved } = transaction;

        toast("Transaction deleted.", "success", {
            label: "Undo",
            onClick: () => restoreTransaction(id, saved)
        });

    } catch (error) {
        console.error("Delete failed:", error);
        toast("Could not delete the transaction.", "error");
    }
}

async function restoreTransaction(id, saved) {
    if (!currentUser) return;

    const uid = currentUser.uid;

    const transactionRef = doc(db, "users", uid, "transactions", id);
    const accountRef = doc(db, "users", uid, "accounts", saved.accountId);

    try {
        await runTransaction(db, async (t) => {
            const accountSnap = await t.get(accountRef);

            if (!accountSnap.exists()) {
                throw new Error("The original account no longer exists.");
            }

            const balance = Number(accountSnap.data().balance || 0);

            t.update(accountRef, {
                balance: round2(balance + effectOf(saved.type, saved.amount))
            });

            t.set(transactionRef, saved);
        });

        toast("Transaction restored.");

    } catch (error) {
        console.error("Restore failed:", error);
        toast(error.message || "Could not restore the transaction.", "error");
    }
}


// ==========================================
// 16. EXPORT CSV
// ==========================================

function csvCell(value) {
    let text = String(value ?? "");

    // Stop spreadsheet apps from running text as a formula
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

    return `"${text.replace(/"/g, '""')}"`;
}

$("exportButton").addEventListener("click", () => {
    const rows = getFilteredTransactions();

    if (rows.length === 0) {
        toast("Nothing to export for the current filters.", "error");
        return;
    }

    const lines = [["Date", "Description", "Category", "Account", "Type", "Amount"]];

    rows.forEach((t) => {
        lines.push([
            t._d ? getLocalDateString(t._d) : "",
            t.description,
            t.categoryName,
            accounts.find((a) => a.id === t.accountId)?.name || "",
            t.type,
            (t.type === "income" ? "" : "-") + t.amount.toFixed(2)
        ]);
    });

    const csv = lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `vinance-transactions-${getLocalDateString()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} transactions.`);
});


// ==========================================
// 17. ACCOUNTS DIALOG
// ==========================================

function renderAccountsList() {
    accountsList.replaceChildren();

    if (accounts.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "No accounts yet. Add your first one below.";
        accountsList.appendChild(empty);
        return;
    }

    accounts.forEach((account) => {
        const item = document.createElement("li");

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = account.name || "Unnamed account";

        const balance = document.createElement("span");
        balance.textContent = ` · ${formatMoney(Number(account.balance || 0))}`;

        info.append(name, balance);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-danger btn-small";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteAccount(account));

        item.append(info, remove);
        accountsList.appendChild(item);
    });
}

async function deleteAccount(account) {
    if (transactions.some((t) => t.accountId === account.id)) {
        toast("Delete this account's transactions first.", "error");
        return;
    }

    if (!confirm(`Delete the account "${account.name}"?`)) return;

    try {
        await deleteDoc(doc(db, "users", currentUser.uid, "accounts", account.id));
        toast("Account deleted.");
    } catch (error) {
        console.error("Account delete failed:", error);
        toast("Could not delete the account.", "error");
    }
}

accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const name = accountName.value.trim();
    const balance = accountBalance.value === "" ? 0 : round2(accountBalance.value);

    if (!name || name.length > 40) {
        toast("Enter an account name of up to 40 characters.", "error");
        return;
    }

    if (!Number.isFinite(balance)) {
        toast("Enter a valid balance.", "error");
        return;
    }

    saveAccount.disabled = true;

    try {
        await addDoc(collection(db, "users", currentUser.uid, "accounts"), {
            name,
            balance,
            initialBalance: balance,
            createdAt: serverTimestamp()
        });

        accountForm.reset();
        toast("Account added.");

    } catch (error) {
        console.error("Account creation failed:", error);
        toast("Could not add the account.", "error");

    } finally {
        saveAccount.disabled = false;
    }
});

function openAccountsDialog() {
    renderAccountsList();
    accountsDialog.showModal();
}

$("openAccounts").addEventListener("click", (event) => {
    event.preventDefault();
    openAccountsDialog();
});

addAccountShortcut.addEventListener("click", openAccountsDialog);
$("closeAccounts").addEventListener("click", () => accountsDialog.close());


// ==========================================
// 18. BUDGET DIALOG
// ==========================================

$("budgetButton").addEventListener("click", () => {
    budgetInput.value = monthlyBudget > 0 ? monthlyBudget : "";
    budgetDialog.showModal();
});

$("closeBudget").addEventListener("click", () => budgetDialog.close());

async function saveBudget(value) {
    if (!currentUser) return;

    try {
        await setDoc(
            doc(db, "users", currentUser.uid),
            { monthlyBudget: value },
            { merge: true }
        );

        budgetDialog.close();
        toast(value > 0 ? "Budget saved." : "Budget removed.");

    } catch (error) {
        console.error("Budget save failed:", error);
        toast("Could not save the budget.", "error");
    }
}

budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const value = Number(budgetInput.value);

    if (!Number.isFinite(value) || value <= 0) {
        toast("Enter a budget greater than zero.", "error");
        return;
    }

    saveBudget(value);
});

$("clearBudget").addEventListener("click", () => saveBudget(0));

// Clicking the dark backdrop closes a dialog
[accountsDialog, budgetDialog, editDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
});


// ==========================================
// 19. REAL-TIME LISTENERS
// ==========================================

function applyProfile(data, user) {
    const username = data.username || user.email?.split("@")[0] || "User";

    const displayName = showProfile({
        username,
        email: user.email,
        photoURL: data.photoURL || user.photoURL || ""
    });

    welcomeTitle.textContent = `Welcome back, ${displayName}! 👋`;

    userCurrency = data.currency || "EUR";
    monthlyBudget = Number(data.monthlyBudget || 0);
}

function listenToFinancialData(user) {
    const unsubscribeProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
            if (!snapshot.exists()) return;

            applyProfile(snapshot.data(), user);

            updateDashboard();
            renderAccountsList();
        },
        (error) => console.error("Profile listener error:", error)
    );

    const unsubscribeCategories = onSnapshot(
        collection(db, "users", user.uid, "categories"),
        (snapshot) => {
            categories = snapshot.empty
                ? DEFAULT_CATEGORIES
                : snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

            refreshCategorySelects();
            updateDashboard();
        },
        (error) => console.error("Categories listener error:", error)
    );

    const unsubscribeAccounts = onSnapshot(
        collection(db, "users", user.uid, "accounts"),
        (snapshot) => {
            accounts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

            populateAccountSelectors();
            updateDashboard();
            renderAccountsList();
        },
        (error) => console.error("Accounts listener error:", error)
    );

    const unsubscribeTransactions = onSnapshot(
        collection(db, "users", user.uid, "transactions"),
        (snapshot) => {
            transactions = snapshot.docs.map((d) => {
                const data = d.data();

                return {
                    id: d.id,
                    ...data,
                    amount: Number(data.amount || 0),
                    _d: toDate(data.date)
                };
            });

            updateDashboard();
        },
        (error) => console.error("Transactions listener error:", error)
    );

    unsubscribeListeners = [
        unsubscribeProfile,
        unsubscribeCategories,
        unsubscribeAccounts,
        unsubscribeTransactions
    ];
}


// ==========================================
// 20. AUTHENTICATION
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        currentUser = null;

        unsubscribeListeners.forEach((unsubscribe) => unsubscribe());
        unsubscribeListeners = [];

        window.location.replace("auth.html");
        return;
    }

    currentUser = user;

    if (dashboardStarted) return;

    try {
        const snapshot = await getDoc(doc(db, "users", user.uid));

        if (!snapshot.exists() || snapshot.data().onboardingComplete !== true) {
            window.location.replace("onboarding.html");
            return;
        }

        dashboardStarted = true;

        applyProfile(snapshot.data(), user);

        initializeCharts();
        listenToFinancialData(user);

        // Arriving from Settings -> Accounts
        if (new URLSearchParams(window.location.search).has("accounts")) {
            history.replaceState(null, "", window.location.pathname);
            openAccountsDialog();
        }

    } catch (error) {
        console.error("Could not load dashboard:", error);

        welcomeTitle.textContent = "Welcome back! 👋";
        toast("Could not load your data. Try refreshing.", "error");
    }
});