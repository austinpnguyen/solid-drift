import { createSignal, For } from "solid-js";
import {
  createAgentState,
  createApprovalGate,
  createTokenStream,
} from "solid-drift";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

// Fake streaming for the template. Swap this for a real fetch to your
// AI endpoint that returns a ReadableStream of text chunks.
async function* fakeStream(prompt: string): AsyncGenerator<string> {
  const reply = `Here is a streamed reply to "${prompt}". In a real app, these chunks would come from your AI API as they arrive, and createTokenStream would reveal them word by word with a natural typing rhythm.`;
  for (const word of reply.split(" ")) {
    yield word + " ";
    await new Promise((r) => setTimeout(r, 60));
  }
}

function ChatBubble(props: { msg: Msg }) {
  const isUser = () => props.msg.role === "user";
  return (
    <div class={`flex ${isUser() ? "justify-end" : "justify-start"}`}>
      <div
        class={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser()
            ? "bg-black text-white"
            : "border border-black/10 bg-white"
        }`}
      >
        {props.msg.text}
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = createSignal<Msg[]>([]);
  const [input, setInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const stream = createTokenStream();
  const agent = createAgentState();
  const gate = createApprovalGate();

  const send = async () => {
    const text = input().trim();
    if (!text || busy()) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }]);

    agent.set("thinking");
    await new Promise((r) => setTimeout(r, 700));

    // Approval gate demo: if the user asks for something "dangerous",
    // the agent pauses and asks for confirmation first.
    if (/delete|refund|send/i.test(text)) {
      agent.set("awaitingApproval");
      gate.propose({
        title: `Approve: "${text}"`,
        description: "The agent wants to perform this action. Approve?",
      });
      // Wait for the user to approve or deny via the gate UI below.
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const s = gate.status();
          if (s === "approved" || s === "denied") {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      const approved = gate.status() === "approved";
      gate.reset();
      if (!approved) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Cancelled. Nothing was done." },
        ]);
        agent.set("idle");
        setBusy(false);
        return;
      }
    }

    stream.reset();
    agent.set("streaming");
    for await (const chunk of fakeStream(text)) {
      stream.push(chunk);
    }
    stream.complete();
    setMessages((m) => [...m, { role: "assistant", text: stream.text() }]);
    agent.set("idle");
    setBusy(false);
  };

  return (
    <main class="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-6 py-6">
      <div class="mb-4 flex items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight">AI chat</h1>
        <span class="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-neutral-600">
          agent: {agent.state()}
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <For each={messages()}>{(m) => <ChatBubble msg={m} />}</For>
        {stream.text() && busy() && (
          <div class="flex justify-start">
            <div class="max-w-[80%] rounded-2xl border border-black/10 bg-white px-4 py-3">
              {stream.text()}
              <span class="ml-1 inline-block h-4 w-2 animate-pulse bg-black/60" />
            </div>
          </div>
        )}
      </div>

      {gate.request() && (
        <div class="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p class="mb-1 text-sm font-medium">{gate.request()?.title}</p>
          <p class="mb-3 text-sm text-neutral-600">
            {gate.request()?.description}
          </p>
          <div class="flex gap-3">
            <button
              onClick={() => gate.approve()}
              class="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Approve
            </button>
            <button
              onClick={() => gate.deny()}
              class="rounded-xl border border-black/15 px-4 py-2 text-sm font-medium"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      <div class="flex gap-3">
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask anything... (try: please delete my account)"
          class="flex-1 rounded-xl border border-black/15 px-4 py-3 outline-none focus:border-black/40"
        />
        <button
          onClick={send}
          disabled={busy()}
          class="rounded-xl bg-black px-6 py-3 font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </main>
  );
}
