import type { FastifyInstance } from "fastify";
import { STATUS_HEALTHY, type HealthReport } from "@surveillance/shared";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/healthz", async (): Promise<HealthReport> => ({
    service: "api",
    status: STATUS_HEALTHY,
    version: "0.1.0",
    checkedAt: new Date().toISOString(),
  }));
}
