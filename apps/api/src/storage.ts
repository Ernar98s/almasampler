import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { config } from './config.js';

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a'
};

function safeExtension(file: MultipartFile, fallback: string) {
  const fromMime = AUDIO_EXTENSION_BY_MIME[file.mimetype];
  const fromName = path.extname(file.filename || '').toLowerCase();

  return fromMime || fromName || fallback;
}

export function getProjectStorageDir(userId: string, projectId: string) {
  return path.join(config.storageRoot, getProjectStorageRelativeDir(userId, projectId));
}

export function getProjectStorageRelativeDir(userId: string, projectId: string) {
  return path.join('users', userId, 'projects', projectId);
}

export async function ensureProjectStorageDir(userId: string, projectId: string) {
  const dir = getProjectStorageDir(userId, projectId);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveProjectAudioFile(options: {
  userId: string;
  projectId: string;
  file: MultipartFile;
  baseName: 'sample' | 'latest-record';
  fallbackExtension: '.mp3' | '.wav';
}) {
  const dir = await ensureProjectStorageDir(options.userId, options.projectId);
  const extension = safeExtension(options.file, options.fallbackExtension);
  const relativePath = path.join(
    getProjectStorageRelativeDir(options.userId, options.projectId),
    `${options.baseName}${extension}`
  );
  const targetPath = path.join(config.storageRoot, relativePath);

  await pipeline(options.file.file, fs.createWriteStream(targetPath));

  return relativePath;
}

export async function assertReadableFile(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(config.storageRoot, filePath);

  await fs.promises.access(resolvedPath, fs.constants.R_OK);
  return resolvedPath;
}

export async function deleteProjectStorageDir(userId: string, projectId: string) {
  const dir = getProjectStorageDir(userId, projectId);
  await fs.promises.rm(dir, { recursive: true, force: true });
}
