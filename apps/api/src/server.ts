import Fastify from 'fastify';
import type { Project } from '@almasampler/shared';

const app = Fastify({
  logger: true
});

const projects = new Map<string, Project>();

function createEmptyProject(id: string, name: string): Project {
  const now = new Date().toISOString();

  return {
    id,
    name,
    slices: [],
    pads: Array.from({ length: 16 }, (_, index) => ({
      id: `pad-${index + 1}`,
      index,
      keyBinding: '1234567890qwerty'[index] ?? '',
      rootNote: 60
    })),
    pianoRoll: {
      totalBars: 4,
      beatsPerBar: 4,
      snapDivisionsPerBeat: 4,
      notes: []
    },
    transport: {
      bpm: 120,
      isPlaying: false,
      currentBeat: 0,
      loopStartBeat: 0,
      loopEndBeat: 16,
      metronomeEnabled: false
    },
    createdAt: now,
    updatedAt: now
  };
}

app.get('/health', async () => ({
  status: 'ok',
  date: new Date().toISOString()
}));

app.post<{ Body: { name?: string } }>('/projects', async (request, reply) => {
  const id = crypto.randomUUID();
  const name = request.body?.name?.trim() || 'Untitled Project';
  const project = createEmptyProject(id, name);
  projects.set(id, project);
  reply.code(201);
  return project;
});

app.get<{ Params: { id: string } }>('/projects/:id', async (request, reply) => {
  const project = projects.get(request.params.id);

  if (!project) {
    reply.code(404);
    return { message: 'Project not found' };
  }

  return project;
});

app.put<{ Params: { id: string }; Body: Partial<Project> }>(
  '/projects/:id',
  async (request, reply) => {
    const existing = projects.get(request.params.id);

    if (!existing) {
      reply.code(404);
      return { message: 'Project not found' };
    }

    const updated: Project = {
      ...existing,
      ...request.body,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    projects.set(existing.id, updated);
    return updated;
  }
);

const port = Number(process.env.PORT || 3001);

app
  .listen({
    host: '0.0.0.0',
    port
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
