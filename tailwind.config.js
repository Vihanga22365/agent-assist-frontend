/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#0f172a"
        },
        azure: {
          400: "#60a5ff",
          500: "#4388ff",
          600: "#2563eb"
        },
        emerald: {
          400: "#34d399",
          500: "#10b981"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Poppins", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glass: "0 18px 45px -15px rgba(15, 23, 42, 0.45)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      },
      borderRadius: {
        xl: "1.25rem"
      },
      backdropBlur: {
        tighter: "10px"
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem"
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
};
