// AI coach — the app's only backend. Holds the Anthropic key; phase A access
// control is a single bearer secret (Peter only). The client applies ops —
// this function never writes programme state.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  ProposeEditsInputSchema,
  proposeEditsJsonSchema,
  WeekPayloadSchema,
} from '../../../src/lib/programme/ops.ts';

const MODEL = 'claude-sonnet-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `You are the in-app strength coach for a volleyball-focused training PWA.
You adjust the user's programme through the propose_edits tool; your text explains the why, briefly.

Rules:
- Ground every suggestion in the user's profile (goals, sport context, equipment, schedule) and recent training history.
- Prefer the minimal ops that achieve the change. Use replace-day or replace-week only for genuine restructures (travel, equipment change, missed week).
- Target ids must come from the provided programme JSON — never invent ids. To keep an exercise's logged history in a replace payload, carry its existing id.
- Respect periodisation: taper leg volume and intensity in the 48-72h before a competition; keep movement intent (speed/power) when cutting volume.
- If the user asks something that needs no programme change, just answer — don't force an edit.
- One propose_edits call per reply at most, with a one-sentence summary.`;

const ChatBody = z.object({
  action: z.literal('chat'),
  context: z.object({
    profile: z.unknown().nullable(),
    programme: z.unknown(),
    currentWeek: z.number(),
    today: z.string(),
    recentWorkouts: z.array(z.unknown()).max(20),
    personalBests: z.unknown(),
  }),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(60),
});

const GenerateBody = z.object({
  action: z.literal('generate'),
  profile: z.object({
    goals: z.string().min(1),
    sportContext: z.string().optional(),
    equipment: z.array(z.string()),
    daysPerWeek: z.number().int().min(1).max(7),
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
  }),
  weeksCount: z.number().int().min(4).max(16),
});

const GeneratedProgrammeSchema = z.object({
  name: z.string().min(1).max(60),
  weeks: z.array(WeekPayloadSchema).min(1).max(16),
});

async function handleChat(client: Anthropic, body: z.infer<typeof ChatBody>) {
  const contextBlock = [
    `Today: ${body.context.today}. Current week: ${body.context.currentWeek}.`,
    `Profile: ${body.context.profile ? JSON.stringify(body.context.profile) : 'not set — ask if goals/equipment matter to the request'}`,
    `Programme JSON (ids are authoritative): ${JSON.stringify(body.context.programme)}`,
    `Recent workouts: ${JSON.stringify(body.context.recentWorkouts)}`,
    `Personal bests: ${JSON.stringify(body.context.personalBests)}`,
  ].join('\n\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: 'Understood — I have the programme and context. What would you like to adjust?' },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const tool = {
    name: 'propose_edits',
    description:
      'Propose a batch of programme edit operations. The user reviews and applies them — nothing is applied automatically.',
    input_schema: proposeEditsJsonSchema() as Anthropic.Tool.InputSchema,
  };

  // Up to 2 validation retries: feed zod errors back as a tool_result error.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [tool],
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (!toolUse) return { text, proposal: null };

    const parsed = ProposeEditsInputSchema.safeParse(toolUse.input);
    if (parsed.success) return { text, proposal: parsed.data };

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content: `Ops failed validation, fix and retry: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`,
      }],
    });
  }
  return { text: 'I could not produce a valid edit for that — try rephrasing the request.', proposal: null };
}

async function handleGenerate(client: Anthropic, body: z.infer<typeof GenerateBody>) {
  const prompt = `Create a ${body.weeksCount}-week strength programme as JSON.

User profile:
- Goals: ${body.profile.goals}
- Sport context: ${body.profile.sportContext ?? 'none'}
- Equipment available: ${body.profile.equipment.join(', ') || 'full gym'}
- Training days per week: ${body.profile.daysPerWeek}
- Experience: ${body.profile.experience}

Requirements:
- Exactly ${body.profile.daysPerWeek} days per week (a final taper week may have fewer).
- Periodise into named blocks with block notes; include a one-line focus per week and a jumps/conditioning note when relevant to the sport context.
- reps is a string ("6", "6-8", "8/leg", "20 m"); load is a string ("70% TM", "RPE 7", "Bodyweight"); tracking is one of weighted/reps/time; restSec 0-900.
- Only prescribe exercises doable with the stated equipment.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: 'You are an expert strength and conditioning coach. Output only valid JSON matching the given schema.',
      output_config: { format: { type: 'json_schema', schema: z.toJSONSchema(GeneratedProgrammeSchema) } },
      messages: [{ role: 'user', content: prompt }],
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const parsed = GeneratedProgrammeSchema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to retry
    }
  }
  throw new Error('generation did not produce a valid programme');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const token = Deno.env.get('COACH_ACCESS_TOKEN');
  const auth = req.headers.get('authorization') ?? '';
  if (!token || auth !== `Bearer ${token}`) return json(401, { error: 'unauthorized' });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return json(502, { error: 'coach unavailable, try again' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const chat = ChatBody.safeParse(raw);
    if (chat.success) return json(200, await handleChat(client, chat.data));
    const gen = GenerateBody.safeParse(raw);
    if (gen.success) return json(200, await handleGenerate(client, gen.data));
    return json(400, { error: 'unknown action' });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'coach unavailable, try again' });
  }
});
