import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Integration files share the dedicated PostgreSQL test database and reset it.
    // Keep files serial so one reset cannot invalidate another file mid-transaction.
    fileParallelism: false,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
