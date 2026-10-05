import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUp, Check, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { hapticSelect, hapticTap } from '../lib/feedback';
import { coachChat, CoachAuthError, CoachRequestError, getCoachToken } from '../lib/coach/api';
import { ProposeEditsInput, ProposeEditsInputSchema } from '../lib/programme/ops';
import { describeOps, describeOpDetails } from '../lib/programme/describe';
import { applyEdits, getProgramme, undoLast, useProgramme } from '../lib/programme/store';
import { getActiveSession, endSession } from '../lib/session';

const CHAT_KEY = 'vb-coach-chat-v1';
// Mirrors the server's ChatBody caps (supabase/functions/ai-coach/index.ts) — the
// client must stay under them or every send 400s once history grows.
const MAX_REPLAY_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  proposal?: ProposeEditsInput | null;
  proposalState?: 'pending' | 'applied' | 'dismissed' | 'failed';
  diffLines?: string[];
  appliedRevision?: number;
  error?: string;
  at: number;
};

function loadChat(programmeId: string): ChatMsg[] {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    const parsed = raw ? (JSON.parse(raw) as { programmeId: string; messages: ChatMsg[] }) : null;
    if (parsed && parsed.programmeId === programmeId && Array.isArray(parsed.messages)) return parsed.messages;
  } catch {
    // corrupt chat history is disposable
  }
  return [];
}

function saveChat(programmeId: string, messages: ChatMsg[]) {
  try {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify({ programmeId, messages: messages.slice(-50) }));
  } catch {
    // ignore
  }
}

export default function CoachPage() {
  const programme = useProgramme();
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadChat(programme.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(!getCoachToken());
  // Message indexes whose exercise-level preview is expanded (UI-only state).
  const [openDetails, setOpenDetails] = useState<Record<number, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveChat(programme.id, messages);
  }, [programme.id, messages]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  const send = async (explicit?: string) => {
    const content = (explicit ?? input).trim();
    if (!content || busy) return;
    hapticSelect();
    if (explicit === undefined) setInput('');
    const history = [...messages, { role: 'user' as const, content, at: Date.now() }];
    setMessages(history);
    setBusy(true);
    try {
      // A text-less tool-call reply gets stored with content: '' — replaying it
      // would push a message under the server's min(1) content length and 400
      // every send after. Also cap how much history we replay: the server
      // rejects more than 60 messages, each up to 4000 chars.
      const replay = history
        .filter((m) => !m.error && m.content.trim().length > 0)
        .slice(-MAX_REPLAY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content }));
      const reply = await coachChat(replay);
      let proposalState: ChatMsg['proposalState'] | undefined;
      let diffLines: string[] | undefined;
      let error: string | undefined;
      if (reply.proposal) {
        // The server already validates the tool call, but never trust a typed
        // return value from the network — re-validate before offering Apply.
        const parsed = ProposeEditsInputSchema.safeParse(reply.proposal);
        if (parsed.success) {
          proposalState = 'pending';
          diffLines = describeOps(parsed.data.ops, getProgramme());
        } else {
          proposalState = 'failed';
          error = `The coach proposed an invalid edit: ${parsed.error.issues[0]?.message ?? 'invalid proposal'}`;
        }
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.text, proposal: reply.proposal, proposalState, diffLines, error, at: Date.now() },
      ]);
      setAuthNeeded(false);
    } catch (e) {
      if (e instanceof CoachAuthError) {
        // The banner below is the single "set it in Profile" affordance —
        // avoid a second, redundant mention in a chat bubble.
        setAuthNeeded(true);
      } else if (e instanceof CoachRequestError) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '', error: "The coach couldn't process that request.", at: Date.now() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '', error: 'The coach is unreachable right now — try again.', at: Date.now() },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = (index: number) => {
    const msg = messages[index];
    if (!msg.proposal) return;
    hapticSelect();
    const res = applyEdits(msg.proposal.ops);
    let proposalState: ChatMsg['proposalState'] = 'applied';
    let error: string | undefined;
    let appliedRevision: number | undefined;
    if (res.ok === false) {
      proposalState = 'failed';
      error = `Couldn't apply: ${res.errors[0].message}`;
    } else {
      appliedRevision = getProgramme().revision;
      // The applied edit may have removed the day the user is mid-session on
      // (remove-day/remove-week/replace-week) — don't leave a session pointing
      // at a day that no longer exists.
      const active = getActiveSession();
      if (active && !getProgramme().weeks.some((w) => w.days.some((d) => d.id === active.dayId))) {
        endSession(active.dayId);
      }
    }
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, proposalState, error, appliedRevision } : m)));
  };

  const askCoachToFix = (index: number) => {
    const msg = messages[index];
    hapticTap();
    void send(`That edit failed: ${msg.error ?? 'unknown error'}. Please propose a different edit that fixes this.`);
  };

  const dismissProposal = (index: number) => {
    hapticTap();
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, proposalState: 'dismissed' } : m)));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface/90 backdrop-blur-md border-b border-ink/10 sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-lg font-bold tracking-[-0.02em] leading-tight">Coach</h1>
            <p className="text-[0.6875rem] font-bold text-secondary">Edits your programme with you</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full px-5 py-5 flex-1 pb-44">
        {messages.length === 0 && (
          <div className="text-sm text-secondary leading-relaxed space-y-3 mt-6">
            <p>Tell the coach what's going on and it proposes programme edits you can apply with one tap. Try:</p>
            <ul className="space-y-2">
              <li className="bg-ink/5 rounded-xl px-3.5 py-2.5">"I'm travelling next week with only dumbbells — replan my week."</li>
              <li className="bg-ink/5 rounded-xl px-3.5 py-2.5">"Comp on Saturday and extra court time — keep my legs fresh."</li>
            </ul>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={msg.at + i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] space-y-2')}>
                {(msg.content || msg.error) && (
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-primary text-onfill'
                        : !msg.content && msg.error
                          ? 'bg-danger/10 text-danger font-medium'
                          : 'bg-ink/10'
                    )}
                  >
                    {msg.content || msg.error}
                  </div>
                )}

                {msg.proposal && (
                  <div className="bg-surface-deep border border-ink/15 rounded-2xl px-4 py-3.5">
                    <p className="text-[0.6875rem] font-bold text-secondary mb-1">Proposed edit</p>
                    <p className="font-bold text-sm leading-snug">{msg.proposal.summary}</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {(msg.diffLines ?? []).map((line) => (
                        <li key={line} className="text-xs text-ink/85 leading-relaxed border-l-2 border-accent pl-2.5">{line}</li>
                      ))}
                    </ul>
                    {(() => {
                      const detailLines = msg.proposal.ops.flatMap(describeOpDetails);
                      if (detailLines.length === 0) return null;
                      const open = openDetails[i] === true;
                      return (
                        <div className="mt-2.5">
                          <button
                            onClick={() => {
                              hapticTap();
                              setOpenDetails((prev) => ({ ...prev, [i]: !open }));
                            }}
                            className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-ink transition-colors"
                          >
                            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
                            {open ? 'Hide details' : 'Show details'}
                          </button>
                          {open && (
                            <ul className="mt-2 space-y-1">
                              {detailLines.map((line, li) => (
                                <li
                                  key={`${li}-${line}`}
                                  className={cn(
                                    'text-xs leading-relaxed',
                                    line.startsWith('  ')
                                      ? 'pl-5 text-ink/75 tabular-nums'
                                      : 'pl-2.5 font-bold text-ink/90 mt-1.5 first:mt-0'
                                  )}
                                >
                                  {line.trim()}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                    {msg.proposalState === 'pending' && (
                      <div className="flex gap-2 mt-3.5">
                        <button onClick={() => applyProposal(i)} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-onfill font-bold text-sm py-2.5 rounded-xl transition-transform active:scale-[0.98]">
                          <Check className="w-4 h-4" strokeWidth={3} /> Apply
                        </button>
                        <button onClick={() => dismissProposal(i)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-2.5 rounded-xl transition-colors">
                          <X className="w-4 h-4" /> Dismiss
                        </button>
                      </div>
                    )}
                    {msg.proposalState === 'applied' && (
                      <div className="flex items-center justify-between mt-3.5">
                        <p className="text-xs font-bold text-primary flex items-center gap-1.5"><Check className="w-3.5 h-3.5" strokeWidth={3} /> Applied</p>
                        {programme.revision === msg.appliedRevision && (
                          <button onClick={() => { hapticTap(); undoLast(); dismissProposal(i); }} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-ink transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" /> Undo
                          </button>
                        )}
                      </div>
                    )}
                    {msg.proposalState === 'dismissed' && <p className="text-xs font-bold text-secondary mt-3.5">Dismissed</p>}
                    {msg.proposalState === 'failed' && (
                      <div className="mt-3.5 space-y-2">
                        <p className="text-xs font-bold text-danger">{msg.error}</p>
                        <button onClick={() => askCoachToFix(i)} className="text-xs font-bold text-secondary hover:text-ink transition-colors underline">
                          Ask coach to fix
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-secondary font-medium">
              Coach is thinking…
            </motion.p>
          )}
        </div>
        <div ref={endRef} />

        {authNeeded && (
          <div className="mt-5 bg-accent/10 rounded-2xl px-4 py-3.5 text-sm leading-relaxed">
            The coach needs an access token —{' '}
            <Link to="/profile" className="font-bold underline">set it in Profile</Link>.
          </div>
        )}
      </main>

      <div className="fixed bottom-20 inset-x-4 z-30">
        <div className="max-w-xl mx-auto flex items-end gap-2 bg-surface-deep/95 backdrop-blur-md border border-ink/15 rounded-3xl p-2 shadow-xl">
          <textarea
            aria-label="Message the coach"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder="Ask the coach…"
            className="flex-1 bg-transparent resize-none px-3 py-2.5 text-base text-ink placeholder:text-secondary focus:outline-none max-h-32"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-10 h-10 flex-shrink-0 rounded-full bg-primary text-onfill flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40"
          >
            <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
