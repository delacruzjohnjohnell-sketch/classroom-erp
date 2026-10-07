import type { Config } from "tailwindcss";

// Dark "ops console" theme. Token names are unchanged from the earlier light
// theme, so every existing class (bg-panel, text-teal, border-hairline …) just
// picks up the new values.
const MONO = ['ui-monospace', '"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#E6EDF3",
        paper: "#0D1319",
        panel: "#111922",
        teal: "#22D3C5",
        tealsoft: "rgba(34,211,197,0.12)",
        gold: "#F2B13C",
        red: "#FF6B7A",
        slate: "#5AA9FF",
        hairline: "#243140",
        onaccent: "#04121A",
        sidebar: "#080C11",
        sidebarHover: "#0F1822",
        sidebarActive: "rgba(34,211,197,0.10)",
        sidebarText: "#93A4B7",
        sidebarTextMuted: "#5C6B7C",
      },
      fontFamily: {
        // Headings used font-serif; they now render in the monospace stack.
        serif: MONO,
        mono: MONO,
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,197,0.35), 0 0 24px rgba(34,211,197,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
