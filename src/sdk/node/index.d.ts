export interface ApiHubClientOptions {
  baseUrl?: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface InvokeOptions extends RequestOptions {
  idempotencyKey?: string;
}

export interface GatewayIdentity {
  type: "application" | "agent";
  agentId: string | null;
  agentName?: string | null;
}

export interface UsageWindow {
  used: number;
  limit: number;
  remaining: number;
}

export interface CapabilityGrant {
  capabilityId: string;
  label: string;
  rpmLimit: number;
  dailyLimit: number;
  inputContract: Record<string, unknown>;
  outputContract: Record<string, unknown>;
  usage: {
    source: "gateway_observed";
    minute: UsageWindow;
    day: UsageWindow;
  };
  [key: string]: unknown;
}

export interface CapabilityManifest {
  ok: true;
  identity: GatewayIdentity;
  application: { id: string; name: string; environment: string };
  gateway: { version: "v1"; executionMode: "dry_run" | "live"; liveGate: "locked" | "unlocked"; invocationPath: string };
  capabilities: CapabilityGrant[];
}

export interface InvocationResult {
  ok: true;
  requestId: string;
  decision: "allowed";
  executionMode: "dry_run" | "live";
  identity: GatewayIdentity;
  application: { id: string; environment: string };
  capability: { id: string; route: string; fallback: string | null };
  result: { status: string; externalRequestSent: boolean; [key: string]: unknown };
}

export interface TokenScopedOpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, unknown>;
  components: Record<string, unknown>;
  "x-api-hub-identity": { type: "application" | "agent"; applicationId: string; agentId?: string };
  "x-api-hub-execution": Record<string, unknown>;
  [key: string]: unknown;
}

export class ApiHubError extends Error {
  status?: number;
  requestId?: string;
  reason?: string;
  retryAfter?: number;
  retryable: boolean;
}

export class ApiHubClient {
  constructor(options: ApiHubClientOptions);
  capabilities(options?: RequestOptions): Promise<CapabilityManifest>;
  openapi(options?: RequestOptions): Promise<TokenScopedOpenApiDocument>;
  invoke(capability: string, input?: Record<string, unknown>, options?: InvokeOptions): Promise<InvocationResult>;
}
