// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('coachChat', () => {
  it('sends bearer + context and returns the reply', async () => {
    localStorage.setItem('vb-coach-token-v1', 'tok');
    const { coachChat } = await import(`./api?t=${Math.random().toString(36).slice(2)}`);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'hi', proposal: null }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await coachChat([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('hi');
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('chat');
    expect(body.context.programme.weeks.length).toBeGreaterThan(0);
  });

  it('throws CoachAuthError on 401', async () => {
    localStorage.setItem('vb-coach-token-v1', 'bad');
    const { coachChat, CoachAuthError } = await import(`./api?t=${Math.random().toString(36).slice(2)}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(coachChat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(CoachAuthError);
  });

  it('throws CoachError on 500', async () => {
    localStorage.setItem('vb-coach-token-v1', 'tok');
    const { coachChat, CoachError } = await import(`./api?t=${Math.random().toString(36).slice(2)}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(coachChat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(CoachError);
  });

  it('throws CoachRequestError (not a bare CoachError-as-unreachable) on 400', async () => {
    localStorage.setItem('vb-coach-token-v1', 'tok');
    const { coachChat, CoachRequestError } = await import(`./api?t=${Math.random().toString(36).slice(2)}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(coachChat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(CoachRequestError);
  });
});
