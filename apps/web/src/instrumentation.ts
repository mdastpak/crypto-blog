/** Runs once when a server process starts (see lib/startup.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServer } = await import("./lib/startup");
  startServer();
}
