export const $ = (id) => document.getElementById(id);

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function formatMoney(amount, currency = "EUR") {
    try {
        return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
    } catch {
        return `${Number(amount).toFixed(2)} ${currency}`;
    }
}

export function getLocalDateString(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return new Date(value);

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}


/* TOASTS (optional action button, e.g. Undo) */

export function toast(message, type = "success", action = null) {
    const container = $("toastContainer");
    if (!container) return;

    const el = document.createElement("div");
    el.className = `toast ${type}`;

    const text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);

    let timer;

    const remove = () => {
        el.classList.add("hide");
        setTimeout(() => el.remove(), 300);
    };

    if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "toast-action";
        button.textContent = action.label;
        button.addEventListener("click", () => {
            clearTimeout(timer);
            remove();
            action.onClick();
        });
        el.appendChild(button);
    }

    container.appendChild(el);
    timer = setTimeout(remove, action ? 7000 : 3200);
}


/* THEME */

export function initTheme(onChange) {
    const button = $("themeToggle");

    const current = () =>
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

    const sync = () => {
        button.textContent = current() === "dark" ? "☀️" : "🌙";
    };

    button.addEventListener("click", () => {
        const next = current() === "dark" ? "light" : "dark";

        document.documentElement.setAttribute("data-theme", next);

        try {
            localStorage.setItem("vinance-theme", next);
        } catch {}

        sync();
        if (onChange) onChange();
    });

    sync();
}


/* MOBILE MENU */

export function initMobileMenu() {
    $("menuToggle").addEventListener("click", () => {
        document.body.classList.toggle("nav-open");
    });

    $("sidebarOverlay").addEventListener("click", () => {
        document.body.classList.remove("nav-open");
    });

    document.querySelectorAll(".navigation a").forEach((link) => {
        link.addEventListener("click", () => {
            document.body.classList.remove("nav-open");
        });
    });
}


/* PROFILE MENU */

export function initProfileMenu(onLogout) {
    const button = $("profileButton");
    const dropdown = $("profileDropdown");

    button.addEventListener("click", () => dropdown.classList.toggle("hidden"));

    document.addEventListener("click", (event) => {
        if (!button.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add("hidden");
        }
    });

    $("logoutButton").addEventListener("click", onLogout);
}

export function showProfile({ username, email, photoURL }) {
    const displayName = username.charAt(0).toUpperCase() + username.slice(1);

    $("profileName").textContent = displayName;
    $("profileEmail").textContent = email || "";

    const avatar = $("profileAvatar");
    avatar.replaceChildren();

    if (photoURL) {
        const image = document.createElement("img");
        image.src = photoURL;
        image.alt = "Profile picture";
        avatar.appendChild(image);
    } else {
        avatar.textContent = displayName.charAt(0);
    }

    return displayName;
}