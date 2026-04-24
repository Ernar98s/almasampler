import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma, Project, User } from '@prisma/client';
import type { RecordedPerformance } from '@almasampler/shared';
import { config, assertRequiredConfig } from './config';
import { prisma } from './prisma';
import { assertReadableFile, saveProjectAudioFile } from './storage';

type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;

type ProjectStateBody = {
  name?: string;
  bpm?: number;
  slices?: Prisma.InputJsonValue;
  pads?: Prisma.InputJsonValue;
  waveformZoom?: number | null;
  selectedSliceId?: string | null;
  sampleDurationSeconds?: number | null;
};

type JwtPayload = {
  userId: string;
};

type RecordingRequestBody =
  | RecordedPerformance
  | {
      recording?: RecordedPerformance;
    }
  | string
  | null
  | undefined;

const app = Fastify({
  logger: true
});

const googleClient = new OAuth2Client(config.googleClientId);

app.register(jwt, {
  secret: config.jwtSecret
});
app.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS']
});
app.register(multipart, {
  limits: {
    fileSize: 60 * 1024 * 1024,
    files: 1
  }
});

function publicUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl
  };
}

function serializeProject(project: Project) {
  return {
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    samplePath: project.samplePath,
    sampleOriginalName: project.sampleOriginalName,
    sampleMimeType: project.sampleMimeType,
    sampleDurationSeconds: project.sampleDurationSeconds,
    latestRecordPath: project.latestRecordPath,
    latestRecording: project.latestRecordingJson,
    slices: project.slicesJson,
    pads: project.padsJson,
    waveformZoom: project.waveformZoom,
    selectedSliceId: project.selectedSliceId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function projectNameFromFileName(fileName: string | undefined) {
  const trimmedName = fileName?.trim();

  if (!trimmedName) {
    return 'Untitled Project';
  }

  return path.basename(trimmedName, path.extname(trimmedName)) || trimmedName;
}

function parseRecordingBody(body: RecordingRequestBody): RecordedPerformance | null {
  const normalizedBody =
    typeof body === 'string'
      ? (JSON.parse(body) as RecordingRequestBody)
      : body;
  const candidateUnknown =
    normalizedBody && typeof normalizedBody === 'object' && 'recording' in normalizedBody
      ? normalizedBody.recording
      : normalizedBody;
  const candidate = candidateUnknown as Partial<RecordedPerformance> | null | undefined;

  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.hits)) {
    return null;
  }

  if (
    typeof candidate.bpm !== 'number' ||
    typeof candidate.totalDurationMs !== 'number' ||
    candidate.hits.some(
      (hit) =>
        !hit ||
        typeof hit !== 'object' ||
        typeof hit.padId !== 'string' ||
        typeof hit.startMs !== 'number' ||
        typeof hit.endMs !== 'number'
    )
  ) {
    return null;
  }

  return candidate as RecordedPerformance;
}

async function getAuthUser(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const decoded = app.jwt.verify<JwtPayload>(authorization.slice('Bearer '.length));
    return prisma.user.findUnique({
      where: {
        id: decoded.userId
      }
    });
  } catch {
    return null;
  }
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthUser(request);

  if (!user) {
    reply.code(401);
    return null;
  }

  return user;
}

async function getOrCreateProject(userId: string) {
  const existing = await prisma.project.findUnique({
    where: {
      userId
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.project.create({
    data: {
      userId,
      name: 'Untitled Project',
      slicesJson: [],
      padsJson: []
    }
  });
}

app.get('/health', async () => ({
  status: 'ok',
  date: new Date().toISOString()
}));

app.post<{ Body: { credential?: string } }>('/auth/google', async (request, reply) => {
  if (!config.googleClientId) {
    reply.code(500);
    return { message: 'GOOGLE_CLIENT_ID is not configured' };
  }

  const credential = request.body?.credential;

  if (!credential) {
    reply.code(400);
    return { message: 'Google credential is required' };
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: config.googleClientId
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    reply.code(401);
    return { message: 'Invalid Google credential' };
  }

  const user = await prisma.user.upsert({
    where: {
      googleSub: payload.sub
    },
    update: {
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture
    },
    create: {
      googleSub: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture
    }
  });
  const token = app.jwt.sign({
    userId: user.id
  } satisfies JwtPayload);

  await getOrCreateProject(user.id);

  return {
    token,
    user: publicUser(user)
  };
});

app.get('/me', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  return {
    user: publicUser(user)
  };
});

app.get('/project', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  return serializeProject(project);
});

app.put<{ Body: ProjectStateBody }>('/project/state', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  const body = request.body ?? {};
  const updated = await prisma.project.update({
    where: {
      id: project.id
    },
    data: {
      name: body.name?.trim() || undefined,
      bpm: body.bpm ? Math.min(220, Math.max(40, Math.round(body.bpm))) : undefined,
      slicesJson: body.slices ?? undefined,
      padsJson: body.pads ?? undefined,
      waveformZoom: body.waveformZoom ?? undefined,
      selectedSliceId: body.selectedSliceId ?? undefined,
      sampleDurationSeconds: body.sampleDurationSeconds ?? undefined
    }
  });

  return serializeProject(updated);
});

app.post('/project/sample', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  const file = await request.file();

  if (!file) {
    reply.code(400);
    return { message: 'Sample file is required' };
  }

  const samplePath = await saveProjectAudioFile({
    userId: user.id,
    projectId: project.id,
    file,
    baseName: 'sample',
    fallbackExtension: '.mp3'
  });
  const updated = await prisma.project.update({
    where: {
      id: project.id
    },
    data: {
      name: projectNameFromFileName(file.filename),
      samplePath,
      sampleOriginalName: file.filename,
      sampleMimeType: file.mimetype
    }
  });

  reply.code(201);
  return serializeProject(updated);
});

app.get('/project/sample', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  const samplePath = await assertReadableFile(project.samplePath);

  if (!samplePath) {
    reply.code(404);
    return { message: 'Sample not found' };
  }

  reply.header('content-type', project.sampleMimeType || 'application/octet-stream');
  reply.header('content-disposition', `inline; filename="${project.sampleOriginalName || path.basename(samplePath)}"`);
  return fs.createReadStream(samplePath);
});

app.post<{ Body: RecordingRequestBody }>('/project/recording', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  let recording: RecordedPerformance | null = null;

  try {
    recording = parseRecordingBody(request.body);
  } catch (error) {
    request.log.warn({
      message: 'Failed to parse recording payload',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  if (!recording) {
    request.log.warn({
      message: 'Recording payload is required',
      bodyType: typeof request.body,
      hasBody: request.body !== undefined && request.body !== null
    });
    reply.code(400);
    return { message: 'Recording payload is required' };
  }
  const updated = await prisma.project.update({
    where: {
      id: project.id
    },
    data: {
      latestRecordingJson: recording as unknown as Prisma.InputJsonValue
    }
  });

  reply.code(201);
  return serializeProject(updated);
});

app.get('/project/recording', async (request, reply) => {
  const user = await requireAuth(request, reply);

  if (!user) {
    return { message: 'Unauthorized' };
  }

  const project = await getOrCreateProject(user.id);
  return {
    recording: project.latestRecordingJson
  };
});

async function start() {
  assertRequiredConfig();

  await app.listen({
    host: '0.0.0.0',
    port: config.port
  });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
