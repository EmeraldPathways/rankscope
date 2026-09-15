"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Props = { domain: string; view: string };

const welcome: ChatMessage = { role: "assistant", content: "I’m RankScope Copilot. Ask me about modern SEO, your current screen, Google integrations, or what to fix next." };
const prompts = ["What should I fix first?", "How do I connect Google?", "Explain this screen", "Find my next SEO opportunity"];

export function SeoChatBubble({ domain, view }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/chat").then(async (response) => {
      const payload = await response.json() as { messages?: ChatMessage[]; configured?: boolean; error?: string };
      if (!active) return;
      if (response.ok) {
        setMessages(payload.messages?.length ? payload.messages : [welcome]);
        setConfigured(Boolean(payload.configured));
      } else if (response.status === 401 || response.status === 503) {
        setError(response.status === 401 ? "Sign in as the workspace owner to use the private assistant." : "Assistant storage is being prepared.");
      }
    }).catch(() => { if (active) setError("The assistant is temporarily unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  async function send(value = input) {
    const content = value.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next); setInput(""); setLoading(true); setError(""); setOpen(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, context: { domain, view } }) });
      const payload = await response.json() as { message?: string; messages?: ChatMessage[]; configured?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Assistant request failed.");
      setMessages(payload.messages?.length ? payload.messages : [...next, { role: "assistant", content: payload.message || "I could not answer that." }]);
      setConfigured(Boolean(payload.configured));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant request failed.");
      setMessages(next);
    } finally { setLoading(false); }
  }

  return <>
    {open && <section className="seo-chat-panel" role="dialog" aria-label="RankScope Copilot">
      <header className="seo-chat-header"><div><span className="seo-chat-spark">✦</span><div><strong>RankScope Copilot</strong><small>{configured === false ? "Guidance mode · add OpenAI key for live answers" : "SEO and app expert"}</small></div></div><button onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header>
      <div className="seo-chat-messages">{messages.map((message, index) => <div className={`seo-chat-message ${message.role}`} key={`${index}-${message.content.slice(0, 12)}`}><span>{message.role === "assistant" ? "✦" : "You"}</span><p>{message.content}</p></div>)}{loading && <div className="seo-chat-message assistant"><span>✦</span><p className="seo-chat-typing"><i /><i /><i /></p></div>}{error && <p className="seo-chat-error">{error}</p>}<div ref={endRef} /></div>
      <div className="seo-chat-prompts">{prompts.map((prompt) => <button key={prompt} onClick={() => send(prompt)} disabled={loading}>{prompt}</button>)}</div>
      <form className="seo-chat-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask about SEO or RankScope…" aria-label="Ask RankScope Copilot" rows={1} /><button disabled={!input.trim() || loading} aria-label="Send message">↑</button></form>
    </section>}
    <button className={`seo-chat-launcher ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "Close RankScope Copilot" : "Open RankScope Copilot"} aria-expanded={open}><span>✦</span><b>Ask Copilot</b>{!open && <i />}</button>
  </>;
}
