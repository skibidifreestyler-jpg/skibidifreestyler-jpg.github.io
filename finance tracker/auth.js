import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";


// ELEMENTS

const authForm = document.getElementById("authForm");
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const username = document.getElementById("username");
const email = document.getElementById("email");
const password = document.getElementById("password");

const usernameGroup = document.getElementById("usernameGroup");
const forgotButton = document.getElementById("forgotPassword");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");

let authMode = "login";
let busy = false;

const submitLabel = () => (authMode === "login" ? "Log In" : "Create Account");

function setMessage(text, type = "") {
    authMessage.textContent = text;
    authMessage.className = type;
}


// TABS

function setAuthMode(mode) {
    authMode = mode;

    loginTab.classList.toggle("selected", mode === "login");
    signupTab.classList.toggle("selected", mode === "signup");

    usernameGroup.classList.toggle("hidden", mode === "login");
    forgotButton.classList.toggle("hidden", mode === "signup");
    username.required = mode === "signup";

    password.autocomplete = mode === "login" ? "current-password" : "new-password";

    authSubmit.textContent = submitLabel();
    setMessage("");
}

loginTab.addEventListener("click", () => setAuthMode("login"));
signupTab.addEventListener("click", () => setAuthMode("signup"));


// FRIENDLY ERRORS

function friendlyError(error) {
    const messages = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/user-not-found": "Incorrect email or password.",
        "auth/wrong-password": "Incorrect email or password.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your connection."
    };

    return messages[error.code] || error.message || "Something went wrong.";
}


// FORGOT PASSWORD

forgotButton.addEventListener("click", async () => {
    const userEmail = email.value.trim();

    if (!userEmail) {
        setMessage("Enter your email above first.", "error");
        email.focus();
        return;
    }

    try {
        await sendPasswordResetEmail(auth, userEmail);
        setMessage("If an account exists for that email, a reset link is on its way.", "success");
    } catch (error) {
        console.error("Password reset failed:", error);
        setMessage(friendlyError(error), "error");
    }
});


// SUBMIT

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    busy = true;
    authSubmit.disabled = true;
    authSubmit.textContent = "Please wait...";
    setMessage("");

    const userEmail = email.value.trim();
    const userPassword = password.value;
    const userName = username.value.trim();

    try {

        // SIGN UP

        if (authMode === "signup") {

            if (userName.length < 3) {
                throw new Error("Username must contain at least 3 characters.");
            }

            const { user } = await createUserWithEmailAndPassword(
                auth, userEmail, userPassword
            );

            await setDoc(doc(db, "users", user.uid), {
                username: userName,
                email: user.email,
                photoURL: "",
                onboardingComplete: false,
                createdAt: serverTimestamp()
            });

            window.location.replace("onboarding.html");
            return;
        }


        // LOG IN

        const { user } = await signInWithEmailAndPassword(
            auth, userEmail, userPassword
        );

        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        // Recover from a signup that created the account but not the profile
        if (!userDoc.exists()) {
            await setDoc(userRef, {
                username: user.email.split("@")[0],
                email: user.email,
                photoURL: "",
                onboardingComplete: false,
                createdAt: serverTimestamp()
            });

            window.location.replace("onboarding.html");
            return;
        }

        window.location.replace(
            userDoc.data().onboardingComplete === true
                ? "index.html"
                : "onboarding.html"
        );

    } catch (error) {

        console.error("Authentication error:", error);

        setMessage(friendlyError(error), "error");

        busy = false;
        authSubmit.disabled = false;
        authSubmit.textContent = submitLabel();
    }
});


// Already logged in? Skip the form.

onAuthStateChanged(auth, async (user) => {
    if (!user || busy) return;

    try {
        const snapshot = await getDoc(doc(db, "users", user.uid));

        window.location.replace(
            snapshot.exists() && snapshot.data().onboardingComplete === true
                ? "index.html"
                : "onboarding.html"
        );
    } catch (error) {
        console.error("Could not check session:", error);
    }
});