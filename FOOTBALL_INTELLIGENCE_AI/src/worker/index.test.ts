import { describe, expect, it, vi } from "vitest";
import worker from "./index";

describe("FOOTBALL INTELLIGENCE AI Worker", () => {
  it("returns health when D1 is reachable", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn().mockResolvedValue({ ok: 1 }) }) },
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/health"),
      env as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      database: true,
    });
  });

  it("fails health closed when D1 is unavailable", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn().mockRejectedValue(new Error("offline")) }) },
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/health"),
      env as never,
    );
    expect(response.status).toBe(503);
  });

  it("does not expose provider status when the server secret is absent", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn() }) },
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/provider/status"),
      env as never,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "provider_secret_not_configured",
    });
  });

  it("rejects non-GET methods", async () => {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/health", { method: "POST" }),
      { DB: {} } as never,
    );
    expect(response.status).toBe(405);
  });
});
