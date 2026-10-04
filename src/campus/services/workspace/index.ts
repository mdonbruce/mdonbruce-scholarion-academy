/** Simulated sandbox lab workspaces: persistent VFS workspaces, simulated shell, execution policy and a bounded agent runner. */
export * from "./vfs";
export * from "./policy";
export * from "./templates";
export { runShell, simulateHttp, tokenize, RUNNER_MESSAGE, RUNNER_COMMANDS, type ShellState, type ShellResult } from "./terminal";
export * from "./store";
export * from "./agent";
