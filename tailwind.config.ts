import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2318",
        inksoft: "#4B5445",
        brand: {
          DEFAULT: "#2F6D3F",
          dark: "#1F4D2B",
          pale: "#EAF1E7",
        },
        amber: {
          DEFAULT: "#C87F1E",
          pale: "#FBF0DD",
        },
        line: "#E1E6DA",
        linestrong: "#C9D1BF",
        danger: {
          DEFAULT: "#B0402E",
          pale: "#F8E9E5",
        },
      },
      fontFamily: {
        sans: ["Public Sans", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["Roboto Mono", "Courier New", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
