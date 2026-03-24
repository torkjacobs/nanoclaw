---
title: "We Built a Multi-Agent AI Customer Assistant with Built-In Governance — Here's How"
published: true
description: "How we built Tork Chat: 7 specialist AI agents orchestrated by LangGraph, with governance-first design, RAG retrieval, and SSE streaming — deployed in vehicle rental."
tags: ai, agents, governance, langgraph
canonical_url: https://tork.network/blog/tork-chat-launch
cover_image:
---

Most AI chatbots are a single model behind an API. One prompt, one response, no guardrails. That works for demos. It does not work when a customer asks about fleet availability, gets quoted a price, then wants to book — all in the same conversation. And it definitely does not work when that customer shares their ID number and you have no PII detection, no audit trail, and no compliance story.

We built [Tork Chat](https://tork.network/chat) to solve this. It is a multi-agent AI customer assistant with governance built into every message, not bolted on after. This post walks through how it works.

## The architecture at a glance

The stack: Python 3.12, FastAPI, LangGraph, Anthropic Claude (Haiku for speed, Sonnet for depth), Supabase with pgvector for RAG, Upstash Redis for sessions, and Server-Sent Events for real-time streaming.

Every customer message passes through a state machine — not a single prompt chain — where specialist agents handle different parts of the conversation.

## 7 agents, one graph

We use LangGraph's `StateGraph` to orchestrate seven specialist agents. Each agent handles a specific customer intent: engagement (greetings, chitchat), fleet search (vehicle availability), policy lookup (insurance, deposits, fuel policy), quoting (pricing calculations), booking (reservation flow), needs assessment (open-ended questions), and escalation (hand-off to humans).

Here is the core graph definition:

```python
from langgraph.graph import StateGraph, END, START

def create_chat_graph():
    graph = StateGraph(ChatState)

    # Add nodes
    graph.add_node("resolve_tenant", resolve_tenant_node)
    graph.add_node("govern_input", govern_input_node)
    graph.add_node("classify_intent", classify_intent_node)
    graph.add_node("engagement", engagement_node)
    graph.add_node("fleet_search", fleet_search_node)
    graph.add_node("policy_search", policy_search_node)
    graph.add_node("quote", quote_node)
    graph.add_node("booking", booking_node)
    graph.add_node("needs", needs_node)
    graph.add_node("escalation", escalation_node)
    graph.add_node("generate_response", generate_response_node)
    graph.add_node("govern_output", govern_output_node)
    graph.add_node("save_message", save_message_node)

    # Entry: resolve tenant, then governance scan
    graph.add_edge(START, "resolve_tenant")
    graph.add_edge("resolve_tenant", "govern_input")

    # If governance denies, skip straight to save
    graph.add_conditional_edges("govern_input", route_after_govern, {
        "save_message": "save_message",
        "classify_intent": "classify_intent",
    })

    # Route to specialist agent by intent
    graph.add_conditional_edges("classify_intent", route_by_intent, {
        "engagement": "engagement",
        "fleet_search": "fleet_search",
        "booking": "booking",
        "policy_search": "policy_search",
        "quote": "quote",
        "needs": "needs",
        "escalation": "escalation",
    })

    # Agents feed into response generation
    for agent in ["engagement", "fleet_search", "policy_search",
                   "quote", "booking", "needs"]:
        graph.add_edge(agent, "generate_response")

    # Escalation skips LLM — goes directly to save
    graph.add_edge("escalation", "save_message")

    # Response → output governance → save → done
    graph.add_edge("generate_response", "govern_output")
    graph.add_edge("govern_output", "save_message")
    graph.add_edge("save_message", END)

    return graph.compile()
```

The state that flows through this graph is a typed dictionary:

```python
class ChatState(TypedDict):
    message: str
    tenant_id: str
    session_id: str
    intent: Optional[str]       # classified by Haiku
    current_agent: Optional[str]
    chunks: list                # RAG results
    input_receipt: Optional[dict]
    output_receipt: Optional[dict]
    response: Optional[str]
    escalated: bool
```

Intent classification uses Claude Haiku with `temperature=0` and a constrained prompt that returns a single word. A regex pre-check catches obvious escalation patterns (requests for a human, excessive caps, frustration phrases) before the LLM is even called.

## Governance is not optional

Every message — inbound and outbound — passes through [Tork's governance pipeline](https://tork.network) before it reaches the LLM. This is not content moderation. It is structured compliance: PII detection with automatic redaction, policy violation scanning, and cryptographic audit receipts for every interaction.

```python
class TorkGovernance:
    async def scan_input(self, content, tenant_id, session_id):
        return await self._scan(content, tenant_id, session_id, direction="input")

    async def scan_output(self, content, tenant_id, session_id):
        return await self._scan(content, tenant_id, session_id, direction="output")

    async def _scan(self, content, tenant_id, session_id, direction):
        payload = {
            "content": content,
            "mode": "scan",
            "agent_id": "tork-chat",
            "agent_role": "customer-assistant",
            "session_id": session_id,
            "tenant_id": tenant_id,
            "direction": direction,
        }
        resp = await client.post(self.govern_url, json=payload, headers=headers)
        data = resp.json()
        return GovernanceResult(
            action=data.get("action", "allow"),     # allow, redact, or deny
            content=data.get("redacted_content", content),
            receipt_id=data.get("receipt_id", ""),
            pii_detected=data.get("pii_detected", []),
        )
```

Three possible outcomes: **allow** (pass through), **redact** (PII stripped, original never reaches the LLM), or **deny** (message blocked entirely). Every scan produces a receipt ID that is stored alongside the conversation in the database. If a regulator asks "what did the AI see and what did it respond?", the answer is a database query away.

The governance node sits at position two in the graph — right after tenant resolution and before anything else. If governance denies the input, the graph short-circuits to `save_message` without ever calling the LLM. The denial is still recorded.

## SSE streaming for real-time responses

Nobody wants to stare at a spinner for three seconds. We use Server-Sent Events to stream tokens as they are generated:

```python
@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        yield _sse_event("typing", {"status": "thinking"})

        # ... tenant resolution, governance, RAG ...

        async with llm_router.client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield _sse({"type": "token", "content": text})

        yield _sse({"type": "governance", "input_receipt": {...}, "output_receipt": {...}})
        yield _sse({"type": "done", "conversation_id": conversation_id})

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

The event stream carries five event types: `token` (each text chunk), `sources` (RAG retrieval results), `governance` (the input and output receipt metadata), `typing` (UI indicators), and `done` (the conversation ID for persistence). The widget on the frontend reads these events and renders tokens as they arrive. The governance metadata arrives after the full response, so the widget can display a "governed" badge without blocking the stream.

## Multi-tenant by design

Tork Chat is multi-tenant from the ground up. Each tenant gets their own bot configuration (system prompt, model selection, temperature), knowledge base (RAG scoped by tenant ID in Supabase), and widget styling. Tenant configs are cached in Redis with a 5-minute TTL.

This means the same engine that powers a vehicle rental assistant can also power a property management chatbot or a legal intake bot — each with their own personality, knowledge, and governance rules.

## What we learned

**Intent classification accuracy matters more than response quality.** A wrong classification routes the customer to the wrong agent, which retrieves the wrong context, which generates a plausible but incorrect answer. We found that Claude Haiku at temperature zero with a tightly constrained system prompt ("respond with ONLY the intent word") achieves reliable classification. Adding a regex pre-check for escalation patterns caught edge cases the LLM missed — particularly frustrated customers using all-caps or demanding a human.

**Escalation detection saves your reputation.** The escalation agent does not generate a response. It produces a structured handoff message with the conversation summary and immediately saves. No LLM in the loop for angry customers. This was a deliberate design choice after observing that LLMs tend to be overly apologetic when they should be connecting the customer to a real person.

**Governance is a feature, not a burden.** Every tenant we have spoken to asks about compliance within the first three questions. PII detection and audit trails are not "nice to have" — they are table stakes for deploying AI in customer-facing roles. Building governance into the graph (rather than wrapping it around the API) means it cannot be bypassed. It is a node in the state machine, not middleware that can be skipped.

**Graceful degradation is non-negotiable.** If governance is unreachable, the message is allowed through with a logged warning. If Redis is down, sessions fall back to in-memory. If RAG returns no chunks, the LLM is instructed to say it does not have the information and suggest contacting the business directly. Every external dependency has a fallback path.

## Real-world deployment

Tork Chat is currently deployed in the vehicle rental industry, handling fleet availability queries, pricing questions, booking flows, insurance and deposit policies, and after-hours support. The system runs 24/7 and escalates to human agents when it detects frustration or explicit handoff requests.

The widget is embeddable on any website via a script tag, and new tenants can onboard at [chat.tork.network/onboard](https://chat.tork.network/onboard).

## Try it

You can see Tork Chat in action at [tork.network/chat](https://tork.network/chat).

If you are interested in the broader thesis behind governed AI agents — why compliance-first design is the next frontier for AI deployment — we wrote a book about it. *The Agent Crisis* is available free at [tork.network](https://tork.network).

---

*Built by the Tork team. Questions, feedback, or want to deploy Tork Chat for your business? Reach out at [tork.network](https://tork.network).*
