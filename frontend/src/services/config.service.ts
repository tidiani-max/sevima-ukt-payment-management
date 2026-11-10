import { api } from "./api";

export interface RuntimeConfig { mockGatewayEnabled: boolean; environment: string }
/** Non-sensitive runtime flags. Falls back to "simulator off" if the call fails. */
export const getConfig = (): Promise<RuntimeConfig> =>
  api<RuntimeConfig>("/config").catch(() => ({ mockGatewayEnabled: false, environment: "unknown" }));
