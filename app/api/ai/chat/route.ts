import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { assistantThreads } from "../../../../db/schema";
import { requireOwner, runtimeEnv } from "../../../../lib/google-integrations";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatContext = { domain?: string; view?: string };

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4_000;

function workspaceKey(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
}

function parseMessages(value: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChatMessage => Boolean(item && typeof item === "object" && ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") && typeof (item as ChatMessage).content === "string"))
      .map((item) => ({ role: item.role, content: item.content.slice(0, MAX_MESSAGE_CHARS) }))
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function fallbackReply(message: string, context: ChatContext) {
  const question = message.toLowerCase();
  const domain = context.domain || "your domain";
  if (/google|search console|ga4|analytics|integration/.test(question)) {
    return "For owned-site data, connect Google Search Console for queries, clicks, impressions and position, then GA4 for sessions and conversions. Keep the OAuth credentials and property IDs in Sites runtime variables. After saving them, sign in as the workspace owner and use Sync Google data on Overview.";
  }
  if (/keyword|content gap|competitor/.test(question)) {
    return `Start with Keywords for demand and difficulty, then use Keyword Gap to compare ${domain} with a competitor. Send the strongest commercial gaps into Content Briefs and track them in Rank Tracker. Check the LIVE/DEMO label before treating any number as real provider data.`;
  }
  if (/audit|technical|pagespeed|speed|core web vitals|on-page/.test(question)) {
    return `Use Site Audit for PageSpeed and technical recommendations, then On-Page SEO for title, description, headings, links and image-alt checks. Fix high-impact issues first, re-run the analysis, and export the result from Reports.`;
  }
  if (/data|saved|database|persist|history|rank/.test(question)) {
    return "The owner workspace is stored in D1. Domain, keyword, competitor, backlink, Google-cache, rank history and this assistant conversation are saved server-side. Public visitors cannot access private workspace records.";
  }
  return "I can help plan SEO work, interpret RankScope results, troubleshoot integrations, and choose the next action. Tell me the domain, target market, or the specific screen you are using, and I will give you a practical next step.";
}

async function saveThread(key: string, messages: ChatMessage[]) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(assistantThreads).values({ workspaceKey: key, messages: JSON.stringify(messages.slice(-MAX_MESSAGES)), updatedAt: now }).onConflictDoUpdate({
    target: assistantThreads.workspaceKey,
    set: { messages: JSON.stringify(messages.slice(-MAX_MESSAGES)), updatedAt: now },
  });
  return now;
}

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  try {
    const db = await getDb();
    const [row] = await db.select().from(assistantThreads).where(eq(assistantThreads.workspaceKey, key)).limit(1);
    return Response.json({ source: "D1", messages: row ? parseMessages(row.messages) : [], configured: Boolean(runtimeEnv().OPENAI_API_KEY), updatedAt: row?.updatedAt || null }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assistant history is unavailable.";
    return Response.json({ error: message.includes("no such table") ? "Assistant storage is not ready. Publish the latest database migration." : message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  try {
    const body = await request.json() as { messages?: unknown; context?: ChatContext };
    const messages = parseMessages(JSON.stringify(body.messages || []));
    const latest = [...messages].reverse().find((item) => item.role === "user");
    if (!latest) return Response.json({ error: "Enter a question for the assistant." }, { status: 400 });
    const context = body.context && typeof body.context === "object" ? body.context : {};
    const values = runtimeEnv();
    let reply: string;
    let source: "OpenAI" | "demo" = "OpenAI";
    if (!values.OPENAI_API_KEY?.trim()) {
      reply = fallbackReply(latest.content, context);
      source = "demo";
    } else {
      const system = `You are RankScope Copilot, an expert modern SEO strategist and a precise product guide for the RankScope SEO web app.\n\nRankScope sections: Overview, Keywords, Keyword Gap, Competitors, Rank Tracker, Backlinks, Site Audit, On-Page SEO, Topic Research, Writing Assistant, Content Briefs, Reports and Integrations.\n\nProduct rules:\n- Explain exactly where to click and what to do next.\n- Distinguish LIVE provider data from DEMO sample data. Never invent live values, API access, credentials, rankings, traffic or audit results.\n- Google Search Console supplies owned-site search performance; GA4 supplies traffic and events; PageSpeed supplies technical performance; DataForSEO supplies competitive keywords and backlinks.\n- Private workspace analytics are owner-protected and stored in D1. Never ask the user to paste API keys into chat.\n- Give concise, practical advice. For SEO recommendations, explain the expected impact, effort and next validation step.\n- If a question is ambiguous, ask one focused clarification.\n\nCurrent app context: domain=${String(context.domain || "unknown")}; screen=${String(context.view || "Overview")}.`;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${values.OPENAI_API_KEY.trim()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: values.OPENAI_MODEL?.trim() || "gpt-5-mini",
          messages: [{ role: "system", content: system }, ...messages],
          max_completion_tokens: 700,
        }),
      });
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "The AI provider rejected the request.");
      reply = payload.choices?.[0]?.message?.content?.trim() || "I could not produce a response. Please try again.";
    }
    const nextMessages = [...messages, { role: "assistant" as const, content: reply }].slice(-MAX_MESSAGES);
    const updatedAt = await saveThread(key, nextMessages);
    return Response.json({ source, configured: source === "OpenAI", message: reply, messages: nextMessages, updatedAt }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("RankScope assistant request failed", { reason: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "The assistant could not complete that request. Check the OpenAI runtime variable and try again." }, { status: 502 });
  }
}
