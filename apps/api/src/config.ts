import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const configDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(configDir, '../.env')
});

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  corsOrigin: process.env.CORS_ORIGIN || true,
  storageRoot:
    process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage')
};

export function assertRequiredConfig() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
}
