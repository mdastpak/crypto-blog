import "@testing-library/jest-dom/vitest";

// Tests that expect a log line spy on it; the rest stay quiet.
process.env.LOG_LEVEL ??= "error";
