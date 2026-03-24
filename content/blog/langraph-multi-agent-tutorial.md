---
title: "Building a Multi-Agent Customer Service System with LangGraph — A Practical Guide"
published: false
description: "A step-by-step guide to building a multi-agent AI customer assistant with LangGraph, Claude, and RAG — from state definition to production routing."
tags: ai, langgraph, python, tutorial
canonical_url: https://tork.network/blog/langgraph-multi-agent-tutorial
cover_image:
---

This is not a toy example. We are going to build a multi-agent customer service system where different AI agents handle different types of enquiries — greetings, product queries, pricing, bookings, policy questions, and escalation to humans. By the end, you will have a working LangGraph state machine that classifies intent, routes to the right agent, retrieves relevant context via RAG, and generates a response.

The code here is drawn from [Tork Chat](https://tork.network/chat), a production multi-agent assistant deployed in the vehicle rental industry. I have simplified some of the production concerns (governance, multi-tenancy, observability) to focus on the multi-agent pattern itself.

## Why multi-agent over single-prompt

A single prompt can answer a single question well. It falls apart when a customer does this:

> "What SUVs do you have?" → fleet query
> "How much for 3 days?" → pricing
> "OK book it for next Friday" → booking intent
> "What's your fuel policy?" → policy lookup
> "Actually this is too expensive, let me speak to someone" → escalation

A single system prompt that tries to handle fleet knowledge, pricing logic, booking flows, policy details, and escalation detection simultaneously is a prompt that does none of them well. It gets long, contradictory, and fragile. Change one instruction and something else breaks.

The multi-agent approach separates concerns. Each agent has a focused system prompt and searches a focused part of the knowledge base. The routing layer decides which agent handles each message. The agents do not need to know about each other.

## Setting up LangGraph

```bash
pip install langgraph anthropic
```

LangGraph gives you three primitives:

- **StateGraph**: A directed graph where state flows from node to node
- **Nodes**: Async functions that receive state and return updates
- **Edges**: Connections between nodes — either fixed or conditional

The mental model: state enters the graph, flows through nodes that transform it, and exits with a result. Each node reads what it needs from state and returns only the fields it wants to update.

## Defining the state

The state is a `TypedDict` that carries everything the graph needs. Every node reads from it and writes to it.

```python
from typing import TypedDict, Optional, Literal

class ChatState(TypedDict):
    # Input — set once at the start
    message: str
    tenant_id: str
    session_id: str

    # Tenant context — set by resolve_tenant
    tenant: Optional[dict]
    bot_config: Optional[dict]

    # Routing — set by classify_intent
    intent: Optional[Literal[
        "greeting", "fleet_query", "pricing", "booking",
        "policy", "complaint", "general", "escalate",
    ]]
    current_agent: Optional[str]

    # RAG context — set by specialist agents
    chunks: list
    sources: list

    # Response — set by generate_response
    response: Optional[str]
    escalated: bool

    # Conversation history
    history: list
```

Each field has a clear owner — the node that sets it. This matters because LangGraph merges node return values into the state. If two nodes both return `chunks`, the last one wins. By designing the state so each field has one writer, you avoid subtle bugs.

The `intent` field uses a `Literal` type. This is documentation, not enforcement — Python will not reject an invalid intent at runtime. But it makes the valid values explicit for anyone reading the code.

## Intent classification

The classifier is the routing brain. It takes the user's message and returns one intent label. We use Claude Haiku because this is a low-stakes, high-frequency call — it needs to be fast, not deep.

```python
async def classify_intent_node(state: dict) -> dict:
    message = state["message"]

    # Pre-check: skip the LLM for obvious escalations
    if matches_escalation_patterns(message):
        return {"intent": "escalate"}

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        temperature=0,
        system=(
            "Classify the user message into exactly one intent: "
            "greeting, fleet_query, pricing, booking, policy, complaint, "
            "general, escalate. Respond with ONLY the intent word, nothing else.\n\n"
            "Use 'escalate' when the user wants to speak to a human, manager, "
            "or supervisor, or expresses strong frustration or anger."
        ),
        messages=[{"role": "user", "content": message}],
    )

    intent = response.content[0].text.strip().lower().replace(".", "")

    valid_intents = {
        "greeting", "fleet_query", "pricing", "booking",
        "policy", "complaint", "general", "escalate",
    }
    if intent not in valid_intents:
        intent = "general"

    return {"intent": intent}
```

Three design decisions here:

**`temperature=0`** — We want deterministic classification. The same message should always route to the same agent. Temperature zero does not guarantee this (Claude is not fully deterministic), but it gets close enough.

**`max_tokens=10`** — The response should be a single word. Setting a low token limit prevents the model from writing an explanation. If it tries to say "I think this is a fleet_query because..." it gets cut off after the intent word.

**The pre-check pattern** — Before calling the LLM, we check for obvious escalation signals with regex. This catches "speak to a manager," "this is unacceptable," and all-caps messages without burning an API call.

```python
import re

ESCALATION_PATTERNS = [
    r"\bspeak to (a )?(human|person|agent|manager|supervisor)\b",
    r"\bmanager\b",
    r"\bhuman agent\b",
    r"\bescalate\b",
    r"\bcomplaint\b",
    r"\bunacceptable\b",
]

def matches_escalation_patterns(message: str) -> bool:
    for pattern in ESCALATION_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):
            return True

    # Frustration indicator: excessive caps
    alpha_chars = [c for c in message if c.isalpha()]
    if len(alpha_chars) >= 10:
        upper_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
        if upper_ratio > 0.5:
            return True

    return False
```

The all-caps check is important. Customers who type "THIS IS RIDICULOUS I HAVE BEEN WAITING FOR AN HOUR" are not asking a question. They want a human. The LLM might classify this as "complaint" and try to generate a soothing response. The regex pre-check catches it and routes directly to escalation.

## Specialist agent nodes

Each agent is an async function that receives the graph state and returns updates. The pattern is consistent: read the message, query the relevant knowledge, and return chunks for the response generator.

**Fleet search** — queries the full knowledge base for product information:

```python
async def fleet_search_node(state: dict) -> dict:
    tenant = state.get("tenant")
    if not tenant:
        return {"chunks": [], "current_agent": "fleet"}

    query = state.get("query_content") or state["message"]
    chunks = await rag_engine.retrieve(query, tenant["id"], top_k=5)

    return {
        "chunks": chunks,
        "sources": [{"content": c.content[:200], "similarity": c.similarity} for c in chunks],
        "current_agent": "fleet",
    }
```

**Policy search** — rewrites the query to bias toward policy-related chunks:

```python
async def policy_search_node(state: dict) -> dict:
    tenant = state.get("tenant")
    if not tenant:
        return {"chunks": [], "current_agent": "policy"}

    query = state.get("query_content") or state["message"]
    policy_query = f"policy terms conditions: {query}"
    chunks = await rag_engine.retrieve(policy_query, tenant["id"], top_k=5)

    return {
        "chunks": chunks,
        "sources": [{"content": c.content[:200], "similarity": c.similarity} for c in chunks],
        "current_agent": "policy",
    }
```

**Engagement** — handles greetings. No RAG needed:

```python
async def engagement_node(state: dict) -> dict:
    return {
        "chunks": [],
        "current_agent": "engagement",
    }
```

**Needs assessment** — the interesting one. When the user's query is too vague to route to a specialist, this agent checks what information is missing and asks a clarifying question:

```python
from app.models.schemas import ChunkResult

def assess_missing_info(message: str, history: list) -> list[str]:
    all_text = " ".join(m.get("content", "") for m in history)
    all_text = (all_text + " " + message).lower()

    missing = []
    if not re.search(r'\d{1,2}[/-]\d{1,2}', all_text):
        missing.append("travel dates (pickup and return)")
    if not any(loc in all_text for loc in ["cape town", "johannesburg", "airport"]):
        missing.append("preferred pickup location")
    if not any(v in all_text for v in ["sedan", "suv", "bakkie", "van"]):
        missing.append("type of vehicle")

    return missing


async def needs_node(state: dict) -> dict:
    message = state.get("query_content") or state["message"]
    history = state.get("history", [])
    missing = assess_missing_info(message, history)

    if missing:
        focus = missing[0]
        context = (
            f"The customer's query is missing some details. "
            f"Still needed: {', '.join(missing)}. "
            f"Politely ask about: {focus}. "
            "Keep it conversational — don't list all missing items at once."
        )
    else:
        context = "The customer has provided enough context. Answer helpfully."

    context_chunk = ChunkResult(
        content=context,
        metadata={"type": "needs_assessment"},
        similarity=1.0,
    )

    return {"chunks": [context_chunk], "current_agent": "needs", "sources": []}
```

The needs agent does not call RAG. It manufactures a synthetic chunk that instructs the response generator on what to ask. This is a useful pattern: you can steer the final LLM response by injecting context as if it came from RAG.

**Escalation** — the agent that does not generate an AI response:

```python
async def escalation_node(state: dict) -> dict:
    return {
        "escalated": True,
        "response": "I'll connect you with our team. A human agent will reach out shortly.",
        "current_agent": "escalation",
    }
```

The escalation agent returns a fixed response and skips the LLM entirely. This is deliberate. When a customer is frustrated enough to ask for a human, the worst thing you can do is run their message through another round of AI. The escalation node sets `response` directly and gets routed past `generate_response` to `save_message`.

## The routing edge

The routing function maps intents to agent node names:

```python
def route_by_intent(state: dict) -> str:
    intent = state.get("intent", "general")

    routing = {
        "escalate": "escalation",
        "greeting": "engagement",
        "fleet_query": "fleet_search",
        "booking": "booking",
        "policy": "policy_search",
        "complaint": "policy_search",
        "pricing": "quote",
        "general": "needs",
    }

    return routing.get(intent, "engagement")
```

Two decisions to note:

**Complaints route to policy search.** A complaint like "your insurance policy is unfair" is best addressed by surfacing the actual policy. The policy agent retrieves the relevant terms, and the response generator can explain them. Routing complaints to a generic agent produces vague apologies.

**Unknown intents default to engagement.** If the classifier returns something unexpected, we fall back to the friendliest agent rather than the most capable. A warm "Hi, how can I help?" is better than a confused attempt at fleet search.

## Response generation

The response generator is the only node that calls the LLM with the full context. It combines everything the specialist agent prepared:

```python
async def generate_response_node(state: dict) -> dict:
    bot_config = state.get("bot_config") or {}

    system_prompt = bot_config.get("system_prompt") or (
        f"You are a helpful assistant for {state.get('tenant', {}).get('name', 'our company')}. "
        "Be friendly, concise, and helpful."
    )

    # Build conversation from session history
    history = await session_manager.get_history(state["session_id"])
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": state["message"]})

    # Agent-provided RAG chunks become part of the system prompt
    chunks = state.get("chunks", [])
    response_text = await llm_router.generate(
        messages, system_prompt, bot_config, chunks if chunks else None
    )

    return {"response": response_text, "history": messages}
```

Inside `llm_router.generate`, the RAG chunks are appended to the system prompt:

```python
async def generate(self, messages, system_prompt, bot_config, chunks=None):
    full_system = system_prompt
    if chunks:
        context = "\n\n---\n\n".join(c.content for c in chunks)
        full_system += (
            "\n\nUse the following knowledge base excerpts to answer. "
            "If the information is not in the excerpts, say you don't have "
            "that specific information and suggest they contact the business directly."
            f"\n\n{context}"
        )

    model_map = {
        "claude-haiku": "claude-haiku-4-5-20251001",
        "claude-sonnet": "claude-sonnet-4-5-20250514",
        "claude-opus": "claude-opus-4-0-20250514",
    }
    raw_model = bot_config.get("model", "claude-haiku-4-5-20251001")
    model = model_map.get(raw_model, raw_model)

    response = await self.client.messages.create(
        model=model,
        max_tokens=bot_config.get("max_tokens", 1024),
        temperature=bot_config.get("temperature", 0.7),
        system=full_system,
        messages=messages,
    )
    return response.content[0].text
```

The "suggest they contact the business directly" fallback is important. When RAG returns no relevant chunks, the LLM knows it should not hallucinate an answer. This one instruction prevents the most common failure mode in RAG systems: confident fabrication when the knowledge base has a gap.

For real-time delivery, we stream the response with Server-Sent Events instead of waiting for the full completion:

```python
from fastapi.responses import StreamingResponse

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        # ... tenant resolution, governance, RAG ...

        async with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'type': 'token', 'content': text})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'conversation_id': cid})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

The widget on the frontend reads these events with `EventSource` and renders tokens as they arrive. The perceived latency drops from seconds to milliseconds.

## Putting it all together

Here is the complete graph definition:

```python
from langgraph.graph import StateGraph, END, START

def create_chat_graph():
    graph = StateGraph(ChatState)

    # Add all nodes
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

    # Entry: START → resolve tenant → governance input scan
    graph.add_edge(START, "resolve_tenant")
    graph.add_edge("resolve_tenant", "govern_input")

    # If governance denies the input, skip to save (no LLM call)
    graph.add_conditional_edges("govern_input", route_after_govern, {
        "save_message": "save_message",
        "classify_intent": "classify_intent",
    })

    # Route to specialist agent based on classified intent
    graph.add_conditional_edges("classify_intent", route_by_intent, {
        "engagement": "engagement",
        "fleet_search": "fleet_search",
        "booking": "booking",
        "policy_search": "policy_search",
        "quote": "quote",
        "needs": "needs",
        "escalation": "escalation",
    })

    # All agents (except escalation) → generate response
    for agent in ["engagement", "fleet_search", "policy_search",
                   "quote", "booking", "needs"]:
        graph.add_edge(agent, "generate_response")

    # Escalation skips LLM — fixed response, straight to save
    graph.add_edge("escalation", "save_message")

    # Response → output governance → save → done
    graph.add_edge("generate_response", "govern_output")
    graph.add_edge("govern_output", "save_message")
    graph.add_edge("save_message", END)

    return graph.compile()
```

To run the graph:

```python
chat_graph = create_chat_graph()

result = await chat_graph.ainvoke({
    "message": "What SUVs do you have available?",
    "tenant_id": "acme-rentals",
    "session_id": "sess_abc123",
    "chunks": [],
    "sources": [],
    "escalated": False,
    "history": [],
})

print(result["response"])
print(result["intent"])        # "fleet_query"
print(result["current_agent"]) # "fleet"
```

The graph handles the full journey: resolve the tenant, scan the input, classify "What SUVs do you have available?" as `fleet_query`, route to the fleet agent, retrieve relevant vehicle chunks from the knowledge base, generate a response with Claude, scan the output, and save the conversation.

## What's missing from this tutorial

This guide covers the multi-agent routing pattern. A production deployment needs several more layers:

**Governance.** Every message — inbound and outbound — should pass through a compliance layer that detects PII, enforces policies, and generates audit receipts. In the graph above, `govern_input` and `govern_output` are placeholders. In production, these call [Tork's governance pipeline](https://tork.network) to scan every interaction before it reaches the LLM and before the response reaches the customer.

**Session management.** The `history` field in the state needs to be populated from a persistent session store. We use Upstash Redis with a 24-hour TTL and a 10-message rolling window. Without this, every message is context-free.

**Rate limiting.** Without it, a single user can exhaust your API budget in minutes. Rate limit per session, per tenant, and globally.

**Multi-tenancy.** The `tenant` and `bot_config` fields hint at this. In production, each tenant gets their own system prompt, model selection, knowledge base, and widget configuration. The same graph serves every tenant — the state carries the customisation.

**Observability.** Add tracing to every node. You need to know how long intent classification takes, which agent was selected, how many RAG chunks were retrieved, and what the LLM's token usage was. LangSmith integrates well with LangGraph for this.

If you want to see all of these concerns implemented together, [Tork Chat](https://tork.network/chat) is the production version of what this tutorial describes. We also wrote about the broader case for governed AI agents in *The Agent Crisis*, available free at [tork.network](https://tork.network).

---

*Questions or building something similar? Reach out at [tork.network](https://tork.network).*
