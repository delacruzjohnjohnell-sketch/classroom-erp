import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        paper: "#F5F3EE",
        panel: "#FFFFFF",
        teal: "#12524F",
        tealsoft: "#E4EEEC",
        gold: "#C08A2E",
        red: "#A6402F",
        slate: "#3E5C76",
        hairline: "#DDD8CC",
        // Dark sidebar, styled after a reference dashboard the user supplied.
        sidebar: "#0E2422",
        sidebarHover: "#163634",
        sidebarActive: "#1D4744",
        sidebarText: "#AFC2BF",
        sidebarTextMuted: "#6F8683",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
