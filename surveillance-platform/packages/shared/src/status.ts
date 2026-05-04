export const STATUS_HEALTHY = "healthy" as const;
export const STATUS_DEGRADED = "degraded" as const;
export const STATUS_DOWN = "down" as const;

export type ServiceStatus =
  | typeof STATUS_HEALTHY
  | typeof STATUS_DEGRADED
  | typeof STATUS_DOWN;

export interface HealthReport {
  service: string;
  status: ServiceStatus;
  version: string;
  checkedAt: string;
  details?: Record<string, string | number | boolean>;
}
