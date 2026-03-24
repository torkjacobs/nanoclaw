# Thread: Building a Multi-Agent Customer Service System with LangGraph

Hook style: Question

---

🧵 1/8

What happens when a customer asks about SUVs, then pricing, then wants to book, then asks about insurance, then gets frustrated and wants a human — all in one conversation?

A single prompt falls apart. Here's how to build a multi-agent system that doesn't.

---TWEET---

🧵 2/8

The core idea: a LangGraph StateGraph where each node is a specialist agent.

- Engagement (greetings)
- Fleet search (product queries)
- Policy (terms, insurance)
- Quote (pricing)
- Booking (reservations)
- Needs assessment (vague queries)
- Escalation (hand-off to humans)

---TWEET---

🧵 3/8

The routing brain: an intent classifier using Claude Haiku at temperature 0, max_tokens=10.

It returns a single word. That word decides which agent handles the message. A regex pre-check catches obvious escalation patterns before the LLM is even called.

---TWEET---

🧵 4/8

The clever part: the needs assessment agent doesn't call RAG. It manufactures a synthetic chunk that tells the response generator what to ask.

"Customer is missing travel dates and pickup location. Ask about dates first."

You can steer LLM responses by injecting context as if it came from RAG.

---TWEET---

🧵 5/8

Complaints route to the policy agent, not a generic apology bot.

"Your insurance policy is unfair" → retrieve the actual policy → explain the terms.

Surfacing facts beats generating sympathy.

---TWEET---

🧵 6/8

The escalation agent is three lines of code. It returns a fixed message and skips the LLM entirely.

When someone types "THIS IS RIDICULOUS I WANT A MANAGER," the worst response is another round of AI-generated apologies.

---TWEET---

🧵 7/8

Unknown intents default to the engagement agent — the friendliest one — not the most capable.

A warm "Hi, how can I help?" beats a confused attempt at fleet search.

---TWEET---

🧵 8/8

Full tutorial with working code — state definition, classifier, agent nodes, routing edges, response generation, and SSE streaming:

https://dev.to/torkjacobs/building-a-multi-agent-customer-service-system-with-langgraph-a-practical-guide-43b5

Built with Tork → https://tork.network

#LangGraph #AI #Python
