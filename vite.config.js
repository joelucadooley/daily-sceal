import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  // The browsers Vite 5 built for. Vite 7's own default drops iPhones before
  // iOS 16.4, which still read the site.
  build: { target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"] },
});
