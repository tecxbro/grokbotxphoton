/** Existing Grok Bot remains the orchestrator. No transcript polling or replacement model. */
export interface ExistingGrokTaskHandoff {
  notifyExistingTask(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): Promise<"accepted" | "failed" | "unknown">;
}
export const legacyDiscovery = Object.freeze({
  repositoryComponent: "src/gateway.js:sendPrompt",
  reuse:
    "existing gateway task submission may implement wake adapter after deployment binding is verified",
  durableRuntimeFound: false,
  wakeBindingVerified: false,
});
