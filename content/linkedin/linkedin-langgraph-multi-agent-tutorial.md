# LinkedIn: Building a Multi-Agent Customer Service System with LangGraph
# Angle: Technical tutorial teaser
# Status: draft (pending @tork approve linkedin)

---

I just published a practical guide to building a multi-agent AI customer service system with LangGraph. Not a toy example — production patterns from a deployed system.

The problem it solves: a customer asks "What SUVs do you have?", then "How much for 3 days?", then "OK book it for next Friday", then "What's your fuel policy?", then "Actually let me speak to someone."

A single system prompt handling fleet knowledge, pricing logic, booking flows, policy details, and escalation detection simultaneously does none of them well. Change one instruction and something else breaks.

The multi-agent approach: a LangGraph StateGraph with specialist nodes for each intent. An intent classifier routes every message. Each agent has a focused system prompt and searches a focused part of the knowledge base. The agents don't know about each other.

Patterns covered in the guide:

→ Intent classification with Claude Haiku at temperature 0
→ Regex pre-checks that skip the LLM for obvious escalation
→ Specialist agents for fleet, policy, pricing, booking, and needs assessment
→ A needs agent that manufactures synthetic RAG chunks to steer the response
→ An escalation agent that skips the LLM entirely — fixed handoff, no AI empathy
→ SSE streaming for real-time token delivery

Full tutorial with working code:
https://dev.to/torkjacobs/building-a-multi-agent-customer-service-system-with-langgraph-a-practical-guide-43b5

Drawn from the production architecture of Tork Chat (https://tork.network/chat).

#LangGraph #AI #Python #Tork #MultiAgent
