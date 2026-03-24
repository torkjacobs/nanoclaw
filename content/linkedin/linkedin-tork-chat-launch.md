# LinkedIn: We Built a Multi-Agent AI Customer Assistant with Built-In Governance
# Angle: Behind-the-scenes builder story
# Status: draft (pending @tork approve linkedin)

---

We shipped an AI customer assistant with 7 specialist agents last month. Here's the part nobody talks about in launch posts — what we actually built and why.

Most AI assistants are a single model behind a single prompt. That works for demos. It does not work when a customer asks about fleet availability, gets quoted a price, wants to book, then shares their ID number — all in one conversation.

So we built Tork Chat as a LangGraph state machine with 7 specialist agents: engagement, fleet search, policy lookup, quoting, booking, needs assessment, and escalation. Each agent has a focused job. The routing layer classifies intent on every message and sends it to the right specialist.

The design choice I'm most proud of: governance is a node in the graph, not middleware you can skip. Every message — inbound and outbound — passes through a compliance scan before it touches the LLM. PII is detected and redacted in real time. Every interaction generates a cryptographic audit receipt.

If governance denies the input, the graph short-circuits. No LLM call. No agent routing. The system does less work when it catches a problem, not more.

The escalation agent doesn't generate an AI response. It returns a fixed handoff message. When a customer is frustrated enough to ask for a human, the worst response is more AI-generated empathy.

Full technical breakdown — architecture, code, and lessons learned:
https://dev.to/torkjacobs/we-built-a-multi-agent-ai-customer-assistant-with-built-in-governance-heres-how-128p

Built by the team at Tork (https://tork.network) — governance-first AI for customer-facing deployments.

#AIGovernance #AI #LangGraph #Tork #MultiAgent
