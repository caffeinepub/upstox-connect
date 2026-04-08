interface JsonConfig {
  backend_host: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin: string;
}

interface Config {
  backend_host?: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin?: string;
}

const DEFAULT_PROJECT_ID = "0000000-0000-0000-0000-00000000000";

let configCache: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (configCache) return configCache;
  const backendCanisterId = (import.meta as any).env?.VITE_CANISTER_ID_BACKEND as string | undefined;
  const envBaseUrl = ((import.meta as any).env?.BASE_URL as string) || "/";
  const baseUrl = envBaseUrl.endsWith("/") ? envBaseUrl : `${envBaseUrl}/`;
  try {
    const response = await fetch(`${baseUrl}env.json`);
    const config = (await response.json()) as JsonConfig;
    const fullConfig: Config = {
      backend_host:
        config.backend_host === "undefined" ? undefined : config.backend_host,
      backend_canister_id: (config.backend_canister_id === "undefined"
        ? (backendCanisterId ?? "")
        : config.backend_canister_id),
      project_id:
        config.project_id !== "undefined" ? config.project_id : DEFAULT_PROJECT_ID,
      ii_derivation_origin:
        config.ii_derivation_origin === "undefined"
          ? undefined
          : config.ii_derivation_origin,
    };
    configCache = fullConfig;
    return fullConfig;
  } catch {
    const fallback: Config = {
      backend_host: undefined,
      backend_canister_id: backendCanisterId ?? "",
      project_id: DEFAULT_PROJECT_ID,
      ii_derivation_origin: undefined,
    };
    configCache = fallback;
    return fallback;
  }
}
