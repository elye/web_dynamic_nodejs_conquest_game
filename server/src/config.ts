import { DEFAULT_PORT } from '@conquest/shared';

export const config = {
  port: Number(process.env.PORT) || DEFAULT_PORT,
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  jwtSecret: process.env.JWT_SECRET || 'conquest-dev-secret',
  logtoEndpoint: process.env.LOGTO_ENDPOINT || '',
} as const;
