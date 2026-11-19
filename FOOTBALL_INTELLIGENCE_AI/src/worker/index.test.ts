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
  it("requires the separate ingestion token before refresh", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn() }) },
      API_FOOTBALL_API_KEY: "provider-secret",
      INGESTION_TOKEN: "ingestion-secret",
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/discovery/refresh", { method: "POST" }),
      env as never,
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("validates fixture refresh dates before calling the provider", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn() }) },
      API_FOOTBALL_API_KEY: "provider-secret",
      INGESTION_TOKEN: "ingestion-secret",
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/refresh?date=not-a-date", {
        method: "POST",
        headers: { authorization: "Bearer ingestion-secret" },
      }),
      env as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_date" });
  });
  it("rejects impossible calendar dates", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn() }) },
      API_FOOTBALL_API_KEY: "provider-secret",
      INGESTION_TOKEN: "ingestion-secret",
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/refresh?date=2026-02-31", {
        method: "POST",
        headers: { authorization: "Bearer ingestion-secret" },
      }),
      env as never,
    );
    expect(response.status).toBe(400);
  });

  it("requires ingestion authorization before fixture enrichment", async () => {
    const env = {
      DB: { prepare: () => ({ first: vi.fn() }) },
      API_FOOTBALL_API_KEY: "provider-secret",
      INGESTION_TOKEN: "ingestion-secret",
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/enrich?fixture=123", {
        method: "POST",
      }),
      env as never,
    );
    expect(response.status).toBe(401);
  });

  it("validates the provider fixture ID before querying D1", async () => {
    const first = vi.fn();
    const env = {
      DB: { prepare: () => ({ first }) },
      API_FOOTBALL_API_KEY: "provider-secret",
      INGESTION_TOKEN: "ingestion-secret",
    };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/enrich?fixture=abc", {
        method: "POST",
        headers: { authorization: "Bearer ingestion-secret" },
      }),
      env as never,
    );
    expect(response.status).toBe(400);
    expect(first).not.toHaveBeenCalled();
  });

  it("validates fixture-list date before querying D1", async () => {
    const all = vi.fn();
    const env = { DB: { prepare: () => ({ all }) } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures?date=2026-02-31"),
      env as never,
    );
    expect(response.status).toBe(400);
    expect(all).not.toHaveBeenCalled();
  });

  it("returns a bounded daily fixture list", async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures?date=2026-11-19&limit=9999"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith(
      "2026-11-18T23:00:00.000Z",
      "2026-11-19T23:00:00.000Z",
      250,
    );
    await expect(response.json()).resolves.toMatchObject({ date: "2026-11-19", count: 0, fixtures: [] });
  });

  it("requires ingestion authorization before generating predictions", async () => {
    const env = { DB: {}, INGESTION_TOKEN: "ingestion-secret" };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/predictions/generate?date=2026-11-19", {
        method: "POST",
      }),
      env as never,
    );
    expect(response.status).toBe(401);
  });

  it("validates prediction generation date before accessing D1", async () => {
    const prepare = vi.fn();
    const env = { DB: { prepare }, INGESTION_TOKEN: "ingestion-secret" };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/predictions/generate?date=bad", {
        method: "POST",
        headers: { authorization: "Bearer ingestion-secret" },
      }),
      env as never,
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("converts Belgian calendar dates to UTC boundaries for fixture queries", async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const env = { DB: { prepare: () => ({ bind }) } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures?date=2026-11-19"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith(
      "2026-11-18T23:00:00.000Z",
      "2026-11-19T23:00:00.000Z",
      100,
    );
  });

  it("requires ingestion authorization before evaluating predictions", async () => {
    const env = { DB: {}, INGESTION_TOKEN: "ingestion-secret" };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/predictions/evaluate?date=2026-11-19", {
        method: "POST",
      }),
      env as never,
    );
    expect(response.status).toBe(401);
  });

  it("serves the read-only Polish dashboard at the root path", async () => {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/"),
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("FOOTBALL INTELLIGENCE AI");
    expect(html).toContain("/api/fixtures?date=");
  });

  it("requires ingestion authorization before collecting odds", async () => {
    const env = { DB: {}, INGESTION_TOKEN: "ingestion-secret" };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/odds?fixture=123", {
        method: "POST",
      }),
      env as never,
    );
    expect(response.status).toBe(401);
  });

  it("rejects cross-origin public sync requests", async () => {
    const prepare = vi.fn();
    const env = { DB: { prepare } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/sync?date=2026-11-19", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
      env as never,
    );
    expect(response.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rate-limits dashboard sync before calling the provider", async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
    const bind = vi.fn().mockReturnValue({ run });
    const env = { DB: { prepare: vi.fn(() => ({ bind })) } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/sync?date=2026-11-19", {
        method: "POST",
        headers: { origin: "https://example.workers.dev" },
      }),
      env as never,
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "sync_cooldown",
      retryAfterSeconds: 120,
    });
    expect(env.DB.prepare).toHaveBeenCalledTimes(1);
  });

  it("validates public sync dates before consuming the cooldown slot", async () => {
    const prepare = vi.fn();
    const env = { DB: { prepare } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/fixtures/sync?date=2026-02-31", {
        method: "POST",
        headers: { origin: "https://example.workers.dev" },
      }),
      env as never,
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("uses the shared cooldown gate before a scheduled sync", async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn(() => ({ bind }));
    const waitUntil = vi.fn();
    worker.scheduled(
      { scheduledTime: Date.UTC(2026, 10, 19, 12, 0, 0) },
      { DB: { prepare } } as never,
      { waitUntil },
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toContain("INSERT INTO public_sync_gate");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns aggregated model performance from the read API", async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const env = { DB: { prepare: () => ({ all }) } };
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/models/performance"),
      env as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ models: [] });
  });

});
