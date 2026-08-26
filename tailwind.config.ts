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
        hairline: "#DDD8CC",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
