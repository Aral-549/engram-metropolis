// The two demo agents. Same code, different persona: what they do, what they may do, and how they look.
export type PersonaId = "assistant" | "planner";

export type PersonaUi = {
  id: PersonaId;
  name: string;
  tagline: string;
  description: string;
  scope: "read" | "readwrite";
  labels: string[];
  accent: string;
  greeting: string;
  suggestions: string[];
};

export const PERSONAS: Record<PersonaId, PersonaUi & { systemPrompt: string }> = {
  assistant: {
    id: "assistant",
    name: "Sage",
    tagline: "Remembers you, in your vault",
    description: "An everyday assistant running on KIMI. When you tell it something worth keeping, it asks your vault to save it.",
    scope: "readwrite",
    labels: ["preferences"],
    accent: "#2bd67b",
    greeting: "Tell me about yourself. What matters goes into your vault, not mine.",
    suggestions: ["I'm vegetarian and allergic to peanuts.", "I prefer trains over flights under 6 hours.", "What do you know about me?"],
    systemPrompt:
      "You are Sage, a warm, concise everyday assistant. Answer helpfully in at most 4 short sentences unless asked for more. " +
      "The user's preferences live in their own encrypted memory, which they share with you.",
  },
  planner: {
    id: "planner",
    name: "Wayfarer",
    tagline: "Plans with what your vault shares",
    description: "A trip and meal planner running on KIMI. It reads what you choose to share and never writes to your memory.",
    scope: "read",
    labels: ["preferences"],
    accent: "#ff8a2b",
    greeting: "Ask me to plan a weekend away or a week of dinners.",
    suggestions: ["Plan a weekend in Goa for me.", "Plan three dinners for this week.", "What should I pack for a hill station in December?"],
    systemPrompt:
      "You are Wayfarer, a practical trip and meal planner. Produce short, concrete plans (bullets, at most 8). " +
      "Use what the user shared to personalise without asking questions you already know the answer to. " +
      "Before planning meals, call recall once with the query \"diet allergies food preferences\"; before planning a trip, " +
      "call recall once with \"travel preferences budget\". Do this even if nothing was shared for this message: the vault only " +
      "shares what matches the words used, so ask with the words that matter. " +
      "Briefly say which shared preferences you used.",
  },
};

export function persona(id: string | undefined): PersonaUi & { systemPrompt: string } {
  return PERSONAS[(id === "planner" ? "planner" : "assistant") as PersonaId];
}
