import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUp, Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { hapticSelect, hapticTap } from '../lib/feedback';
import { coachChat, CoachAuthError, getCoachToken } from '../lib/coach/api';
import { ProposeEditsInput } from '../lib/programme/ops';
import { describeOps } from '../lib/programme/describe';
import { applyEdits, getProgramme, undoLast, useProgramme } from '../lib/programme/store';

const CHAT_KEY = 'vb-coach-chat-v1';

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  proposal?: ProposeEditsInput | null;
  proposalState?: 'pending' | 'applied' | 'dismissed' | 'failed';
  diffLines?: string[];
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveChat(programme.id, messages);
  }, [programme.id, messages]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    hapticSelect();
    setInput('');
    const history = [...messages, { role: 'user' as const, content, at: Date.now() }];
    setMessages(history);
    setBusy(true);
    try {
      const reply = await coachChat(
        history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))
      );
      const diffLines = reply.proposal ? describeOps(reply.proposal.ops, getProgramme()) : undefined;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.text, proposal: reply.proposal, proposalState: reply.proposal ? 'pending' : undefined, diffLines, at: Date.now() },
      ]);
      setAuthNeeded(false);
    } catch (e) {
      if (e instanceof CoachAuthError) {
        // The banner below is the single "set it in Profile" affordance —
        // avoid a second, redundant mention in a chat bubble.
        setAuthNeeded(true);
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
    if (res.ok === false) {
      proposalState = 'failed';
      error = `Couldn't apply: ${res.errors[0].message}`;
    }
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, proposalState, error } : m)));
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
                      msg.role === 'user' ? 'bg-primary text-onfill' : msg.error ? 'bg-danger/10 text-danger font-medium' : 'bg-ink/10'
                    )}
                  >
                    {msg.error ?? msg.content}
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
                        <button onClick={() => { hapticTap(); undoLast(); dismissProposal(i); }} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-ink transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" /> Undo
                        </button>
                      </div>
                    )}
                    {msg.proposalState === 'dismissed' && <p className="text-xs font-bold text-secondary mt-3.5">Dismissed</p>}
                    {msg.proposalState === 'failed' && <p className="text-xs font-bold text-danger mt-3.5">{msg.error}</p>}
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
            placeholder="Ask the coach…"
            className="flex-1 bg-transparent resize-none px-3 py-2.5 text-sm text-ink placeholder:text-secondary focus:outline-none max-h-32"
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
