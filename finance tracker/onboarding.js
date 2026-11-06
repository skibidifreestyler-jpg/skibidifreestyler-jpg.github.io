import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    doc,
    getDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
// ============================================
// DOM ELEMENTS
// ============================================

const form = document.getElementById("onboardingForm");

const incomeInput = document.getElementById("monthlyIncome");
const currencyInput = document.getElementById("currency");

const accountCountInput = document.getElementById("accountCount");
const accountsContainer = document.getElementById("accountsContainer");

const message = document.getElementById("onboardingMessage");

const finishButton = document.getElementById("finishOnboarding");
const skipButton = document.getElementById("skipOnboarding");


// ============================================
// APPLICATION STATE
// ============================================

let currentUser = null;
let saving = false;


// ============================================
// DEFAULT CATEGORIES
// ============================================

const defaultCategories = [
    {
        id: "food",
        name: "Food",
        icon: "🍔",
        color: "#f0a45d",
        type: "expense"
    },
    {
        id: "transport",
        name: "Transport",
        icon: "🚌",
        color: "#49b99a",
        type: "expense"
    },
    {
        id: "entertainment",
        name: "Entertainment",
        icon: "🎮",
        color: "#d8759b",
        type: "expense"
    },
    {
        id: "shopping",
        name: "Shopping",
        icon: "🛍️",
        color: "#9a8be8",
        type: "expense"
    },
    {
        id: "education",
        name: "Education",
        icon: "📚",
        color: "#477fe9",
        type: "expense"
    },
    {
        id: "subscriptions",
        name: "Subscriptions",
        icon: "📱",
        color: "#7e91b8",
        type: "expense"
    },
    {
        id: "travel",
        name: "Travel",
        icon: "✈️",
        color: "#51a9c5",
        type: "expense"
    },
    {
        id: "other",
        name: "Other",
        icon: "📦",
        color: "#9299a8",
        type: "expense"
    },
    {
        id: "salary",
        name: "Salary",
        icon: "💰",
        color: "#49b99a",
        type: "income"
    },
    {
        id: "other_income",
        name: "Other income",
        icon: "💵",
        color: "#477fe9",
        type: "income"
    }
];


// ============================================
// MESSAGE HANDLING
// ============================================

function showMessage(text, type = "error") {
    message.textContent = text;

    message.style.color =
        type === "success" ? "#22a06b" : "#d64545";
}

function clearMessage() {
    message.textContent = "";
}


// ============================================
// ACCOUNT INPUT GENERATION
// ============================================

function renderAccounts() {
    const count = Number(accountCountInput.value);

    // Preserve previously entered information.

    const previousAccounts = Array.from(
        accountsContainer.querySelectorAll(".account-card")
    ).map(card => ({
        name: card.querySelector(".account-name").value,
        balance: card.querySelector(".account-balance").value
    }));

    accountsContainer.innerHTML = "";

    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 10
    ) {
        showMessage("Choose between 1 and 10 accounts.");
        return;
    }

    clearMessage();

    for (let i = 0; i < count; i++) {

        const previous = previousAccounts[i];

        const card = document.createElement("div");
        card.className = "account-card";

        // ACCOUNT HEADING

        const heading = document.createElement("h3");
        heading.textContent = `Account ${i + 1}`;

        // ACCOUNT NAME

        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Account name";

        const nameInput = document.createElement("input");

        nameInput.type = "text";
        nameInput.className = "account-name";
        nameInput.placeholder = "e.g. Main Bank";
        nameInput.maxLength = 40;
        nameInput.required = true;
        nameInput.value = previous?.name || "";

        // ACCOUNT BALANCE

        const balanceLabel = document.createElement("label");
        balanceLabel.textContent = "Starting balance";

        const balanceInput = document.createElement("input");

        balanceInput.type = "number";
        balanceInput.className = "account-balance";
        balanceInput.placeholder = "e.g. 1000";
        balanceInput.min = "0";
        balanceInput.step = "0.01";
        balanceInput.required = true;

        balanceInput.value = previous?.balance ?? "0";

        // BUILD CARD

        card.append(
            heading,
            nameLabel,
            nameInput,
            balanceLabel,
            balanceInput
        );

        accountsContainer.appendChild(card);
    }
}

accountCountInput.addEventListener("input", renderAccounts);


// ============================================
// READ CHECKBOX SELECTIONS
// ============================================

function getSelections(name) {
    return Array.from(
        document.querySelectorAll(
            `input[name="${name}"]:checked`
        )
    ).map(input => input.value);
}


// ============================================
// VALIDATE AND READ ACCOUNTS
// ============================================

function getAccounts() {

    const names = Array.from(
        document.querySelectorAll(".account-name")
    );

    const balances = Array.from(
        document.querySelectorAll(".account-balance")
    );

    if (names.length === 0) {
        throw new Error("Please add at least one account.");
    }

    const accounts = [];

    for (let i = 0; i < names.length; i++) {

        const name = names[i].value.trim();
        const rawBalance = balances[i].value.trim();
        const balance = Number(rawBalance);

        if (!name) {
            throw new Error(
                `Please enter a name for Account ${i + 1}.`
            );
        }

        if (
            rawBalance === "" ||
            !Number.isFinite(balance) ||
            balance < 0
        ) {
            throw new Error(
                `Please enter a valid balance for ${name}.`
            );
        }

        accounts.push({
            id: `account_${i + 1}`,
            name,
            balance: Math.round(balance * 100) / 100
        });
    }

    // ACCOUNT NAMES MUST BE UNIQUE

    const normalizedNames = accounts.map(
        account => account.name.toLowerCase()
    );

    if (
        new Set(normalizedNames).size !== accounts.length
    ) {
        throw new Error(
            "Account names must be unique."
        );
    }

    return accounts;
}


// ============================================
// VALIDATE MONTHLY INCOME
// ============================================

function getMonthlyIncome(skip) {

    if (skip) return 0;

    const rawIncome = incomeInput.value.trim();

    if (rawIncome === "") return 0;

    const income = Number(rawIncome);

    if (
        !Number.isFinite(income) ||
        income < 0
    ) {
        throw new Error(
            "Please enter a valid monthly income."
        );
    }

    return Math.round(income * 100) / 100;
}


// ============================================
// SAVE USER PROFILE
// ============================================

function saveUserProfile(batch, skip) {

    const userRef = doc(
        db,
        "users",
        currentUser.uid
    );

    const profile = {
        onboardingComplete: true,

        currency: currencyInput.value,

        monthlyIncome: getMonthlyIncome(skip),

        spendingInterests: skip
            ? []
            : getSelections("spending"),

        financialGoals: skip
            ? []
            : getSelections("goals"),

        onboardingCompletedAt: serverTimestamp()
    };

    batch.set(userRef, profile, {
        merge: true
    });
}


// ============================================
// SAVE BANK ACCOUNTS
// ============================================

function saveAccounts(batch, accounts) {

    for (const account of accounts) {

        const accountRef = doc(
            db,
            "users",
            currentUser.uid,
            "accounts",
            account.id
        );

        batch.set(accountRef, {

            name: account.name,

            balance: account.balance,

            initialBalance: account.balance,

            currency: currencyInput.value,

            createdAt: serverTimestamp()

        });
    }
}


// ============================================
// SAVE DEFAULT CATEGORIES
// ============================================

function saveCategories(batch) {

    for (const category of defaultCategories) {

        const categoryRef = doc(
            db,
            "users",
            currentUser.uid,
            "categories",
            category.id
        );

        batch.set(categoryRef, {

            ...category,

            isDefault: true,

            createdAt: serverTimestamp()

        });
    }
}


// ============================================
// COMPLETE ONBOARDING
// ============================================

async function completeOnboarding(skip = false) {

    if (!currentUser || saving) return;

    saving = true;

    finishButton.disabled = true;
    skipButton.disabled = true;

    clearMessage();

    try {

        // COLLECT DATA

        const accounts = skip
            ? []
            : getAccounts();

        const batch = writeBatch(db);

        // SAVE PROFILE

        saveUserProfile(batch, skip);

        // SAVE ACCOUNTS

        saveAccounts(batch, accounts);

        // SAVE DEFAULT CATEGORIES

        saveCategories(batch);

        // COMMIT ALL FIRESTORE WRITES

        await batch.commit();

        showMessage(
            "Setup completed! Redirecting...",
            "success"
        );

        window.location.replace("index.html");

    } catch (error) {

        console.error(
            "Onboarding error:",
            error
        );

        showMessage(
            error.message ||
            "Something went wrong. Please try again."
        );

        saving = false;

        finishButton.disabled = false;
        skipButton.disabled = false;
    }
}


// ============================================
// FORM EVENTS
// ============================================

form.addEventListener("submit", async event => {

    event.preventDefault();

    await completeOnboarding(false);

});

skipButton.addEventListener("click", async () => {

    await completeOnboarding(true);

});


// ============================================
// AUTHENTICATION
// ============================================

onAuthStateChanged(auth, async user => {

    if (!user) {

        window.location.replace("auth.html");

        return;
    }

    currentUser = user;

    try {

        const userRef = doc(
            db,
            "users",
            user.uid
        );

        const snapshot = await getDoc(userRef);

        // ALREADY COMPLETED ONBOARDING

        if (
            snapshot.exists() &&
            snapshot.data().onboardingComplete === true
        ) {

            window.location.replace("index.html");

            return;
        }

        // INITIALIZE ACCOUNT FIELDS

        renderAccounts();

    } catch (error) {

        console.error(
            "Could not check onboarding:",
            error
        );

        showMessage(
            "Could not load your profile. Please refresh."
        );
    }
});
