import type { Express } from 'express';

/** Give each integration server its own synthetic client address for auth throttling. */
export function assignIntegrationTestIp(app: Express, ip: string) {
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { configurable: true, value: ip });
    next();
  });
}
