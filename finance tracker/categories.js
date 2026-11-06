export const DEFAULT_CATEGORIES = [
    { id: "food", name: "Food", icon: "🍔", color: "#f0a45d", type: "expense" },
    { id: "transport", name: "Transport", icon: "🚌", color: "#49b99a", type: "expense" },
    { id: "entertainment", name: "Entertainment", icon: "🎮", color: "#d8759b", type: "expense" },
    { id: "shopping", name: "Shopping", icon: "🛍️", color: "#9a8be8", type: "expense" },
    { id: "education", name: "Education", icon: "📚", color: "#477fe9", type: "expense" },
    { id: "subscriptions", name: "Subscriptions", icon: "📱", color: "#7e91b8", type: "expense" },
    { id: "travel", name: "Travel", icon: "✈️", color: "#51a9c5", type: "expense" },
    { id: "other", name: "Other", icon: "📦", color: "#9299a8", type: "expense" },
    { id: "salary", name: "Salary", icon: "💰", color: "#49b99a", type: "income" },
    { id: "other_income", name: "Other income", icon: "💵", color: "#477fe9", type: "income" }
];

const FALLBACK = { icon: "📦", color: "#8a93a6" };

// Transactions store the category NAME, so look it up by name.
export function findCategory(list, name) {
    return list.find((c) => c.name === name) || { ...FALLBACK, name };
}