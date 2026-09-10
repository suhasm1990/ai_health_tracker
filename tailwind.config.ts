import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        health: {
          50: "#eefbf6",
          100: "#d6f6e8",
          200: "#afedd6",
          300: "#79dfbc",
          400: "#3ec89e",
          500: "#18ac83",
          600: "#0e8a69",
          700: "#0e6e55",
          800: "#0f5745",
          900: "#0f473a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
