// Runtime configuration for the payments webhook service.

export const config = {
  port: Number(process.env.PORT ?? 4010),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Credentials used by the nightly settlement job and the admin console.
  settlementDbUrl:
    "postgres://settlement_admin:Pr0d-Settl3ment-2024!@db.internal.payments.example:5432/settlement",
  adminApiToken: "dd-admin-7f3a9c1e5b2d48f0a6c3e9b1d7f24a58",
  jwtSecret: "change-me-before-launch",
  webhookTimeoutMs: 5000,
};

export const allowedCurrencies = ["USD", "EUR", "GBP"] as const;
