# Thread: We Built a Multi-Agent AI Customer Assistant with Built-In Governance

Hook style: Story

---

🧵 1/7

We built an AI customer assistant with 7 specialist agents, governance on every message, and deployed it in vehicle rental.

Most AI assistants are one model behind one prompt. That falls apart the moment a customer asks about pricing, then wants to book, then shares their ID number.

Here's how we built it differently.

---TWEET---

🧵 2/7

The architecture: a LangGraph state machine with 7 specialist agents — engagement, fleet search, policy lookup, quoting, booking, needs assessment, and escalation.

Each agent has a focused job. The routing layer decides who handles each message. No agent needs to know about the others.

---TWEET---

🧵 3/7

The key design choice: governance is a node in the graph, not middleware you can skip.

Every message — inbound AND outbound — passes through a compliance scan before it touches the LLM. PII detection, policy checks, cryptographic audit receipts. Every single interaction.

---TWEET---

🧵 4/7

If governance denies the input, the graph short-circuits. No LLM call. No agent routing. No response generation. The denial is still recorded with a receipt.

The system does LESS work when it catches a problem, not more.

---TWEET---

🧵 5/7

The escalation agent is the simplest and most important. It doesn't generate an AI response. It returns a fixed handoff message and flags for a human.

When a customer is angry enough to ask for a person, the last thing they need is more AI-generated empathy.

---TWEET---

🧵 6/7

Intent classification uses Claude Haiku at temperature 0 with a constrained prompt that returns a single word. A regex pre-check catches obvious escalation patterns before the LLM is even called.

Deterministic routing > creative routing when customers are waiting.

---TWEET---

🧵 7/7

Full technical breakdown — graph definition, state types, agent code, SSE streaming, and what we learned deploying it:

https://dev.to/torkjacobs/we-built-a-multi-agent-ai-customer-assistant-with-built-in-governance-heres-how-128p

Built by the Tork team → https://tork.network

#AI #LangGraph #Governance
