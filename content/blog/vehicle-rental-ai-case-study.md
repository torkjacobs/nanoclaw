---
title: "How We Deployed AI Customer Service for a Vehicle Rental Company in 2 Weeks"
published: false
description: "A case study on deploying a multi-agent AI assistant for a vehicle rental operator — 7 specialist agents, governance from day one, and 70%+ enquiry automation."
tags: ai, casestudy, startup, saas
canonical_url: https://tork.network/blog/vehicle-rental-ai-case-study
cover_image:
---

This is a case study from a real deployment of [Tork Chat](https://tork.network/chat) for a vehicle rental company in South Africa. The numbers are honest estimates based on observed usage, not vanity metrics.

## The client

A mid-size vehicle rental operator based in Cape Town with 200+ vehicles across three locations. Their fleet ranges from economy hatchbacks to luxury SUVs, with a growing 4x4 and bakkie segment for tourists and contractors. They serve a mix of walk-in airport customers, online bookings, corporate accounts, and long-term leases.

On a typical day, they handle 50+ customer enquiries — split roughly between WhatsApp, phone calls, email, and their website contact form. The enquiry mix is predictable: pricing and availability questions account for about 40%, booking and reservation requests about 25%, insurance and policy questions about 20%, and the remaining 15% is a mix of complaints, after-hours messages, and general questions.

## The problem

The company had three staff members handling customer enquiries. Their day looked like this:

The same ten questions, asked fifty times. "How much for an SUV for the weekend?" "Do you deliver to the airport?" "What's your fuel policy?" "Can I take the car across the border into Namibia?" "Is insurance included?" These questions have definitive answers that do not change from day to day. But each one required a human to read the message, find the answer, type a response, and move on to the next.

After-hours enquiries went unanswered until the next morning. The rental industry does not sleep at 5pm. Tourists landing at 9pm, business travellers adjusting plans at midnight, conference organisers confirming fleet bookings on a Sunday — these enquiries sat in inboxes until Monday morning. By then, some customers had already booked with a competitor.

There was no structured lead capture. Customer details — names, email addresses, phone numbers, travel dates — were scattered across WhatsApp threads, email chains, and handwritten notes. Following up on an enquiry from two days ago meant searching through message history.

There was zero compliance infrastructure. Customer ID numbers, credit card details, and personal information flowed through unmonitored channels. South Africa's Protection of Personal Information Act (POPIA) requires that personal data be processed lawfully, with appropriate safeguards. The company was technically exposed on every enquiry that included personal data.

And there was no visibility into what customers were actually asking. The business had no data on enquiry volume, peak hours, common questions, or conversion rates from enquiry to booking. Decisions about staffing, pricing, and fleet composition were based on gut feel.

## What we built

We deployed seven specialist AI agents as a chat widget on the company's website, powered by [Tork Chat](https://tork.network/chat).

**Engagement agent.** Handles greetings, small talk, and opening conversation. When a visitor says "Hi" or "Good morning," the engagement agent responds warmly and asks how it can help. No RAG retrieval needed — this agent sets the conversational tone and routes deeper questions to specialists.

**Fleet agent.** Answers vehicle availability and specification queries. "What SUVs do you have?" triggers a RAG search against the company's vehicle catalogue. The agent retrieves relevant fleet information — vehicle types, features, capacity — and presents it conversationally. The knowledge base is updated whenever the fleet changes.

**Policy agent.** Handles insurance, waivers, deposits, fuel policy, cross-border rules, and terms and conditions. This agent rewrites the customer's query to bias toward policy-relevant documents before searching the knowledge base. When a customer asks "Can I drive to Namibia?", the agent retrieves the cross-border policy and explains the requirements, additional costs, and required documentation.

**Quote agent.** Provides pricing information by searching rate-related documents in the knowledge base. The agent retrieves current pricing and presents it in context. It does not calculate dynamic quotes — it surfaces published rates and directs the customer to complete a booking for a final price.

**Booking agent.** Captures booking intent and extracts details. When a customer says "I want to book an SUV from the 15th to the 20th at the airport," the agent extracts the dates, location, and vehicle preference, confirms the details, and directs the customer to complete the reservation through the website or by calling the branch. The agent does not process bookings — it captures the structured intent and ensures the handoff is smooth.

**Needs assessment agent.** Handles vague or incomplete queries. When a customer says "I need a car," the agent identifies what information is missing — travel dates, pickup location, vehicle preference — and asks one clarifying question at a time. It does not dump a form. It has a conversation, progressively gathering the details needed to route to the right specialist.

**Escalation agent.** Detects frustration, explicit requests for a human, and conversations where the AI is not resolving the issue. This agent does not generate an AI response. It produces a fixed handoff message — "I'll connect you with our team" — and flags the conversation for human follow-up. The detection uses both regex pattern matching (phrases like "speak to a manager," "this is unacceptable") and a frustration classifier that catches excessive capitalisation and repeated negative sentiment.

All seven agents are orchestrated by a LangGraph state machine that classifies intent on every message and routes to the appropriate specialist. The routing is dynamic — a customer can ask about fleet in one message, switch to pricing in the next, and then ask about insurance, and each message is handled by the right agent.

## The governance layer

Every message through the system — inbound and outbound — is scanned by [Tork's governance pipeline](https://tork.network) before it reaches the LLM.

**PII detection runs in real-time.** South African ID numbers (13-digit format), credit card numbers (Luhn-validated), phone numbers, and email addresses are detected and redacted before the message is processed. The LLM never sees raw PII. The redacted version is what gets stored, what gets sent to the model, and what appears in logs.

**Audit receipts are generated for every interaction.** Each governance scan — input and output — produces a receipt with a unique ID, recording what was scanned, what was detected, and what action was taken. These receipts are stored independently of the conversation and can be retrieved by conversation ID, tenant, or time range.

**POPIA alignment was built in from day one.** The client did not need to configure compliance settings, hire a data protection officer for the chatbot, or audit the system after launch. Personal data handling was a design constraint, not an afterthought. When their legal team asked "how does the chatbot handle personal information?", the answer was a one-page technical summary with receipt examples — not a conversation about what needed to be built.

If governance denies a message — because of a policy violation or detected risk — the system short-circuits. No LLM call, no response generation. The denial is recorded with a receipt, and the customer receives a safe fallback. The system does less work, not more.

## Results

These are estimates based on observed usage during the first month of deployment. We qualify them as estimates because the company did not have baseline metrics for pre-deployment comparison in all categories.

**Estimated 70%+ of routine enquiries handled without human intervention.** Pricing, availability, policy, and general questions are answered by the AI. The remaining 30% includes complex booking modifications, complaints that require human judgement, and edge cases outside the knowledge base. This is consistent with industry benchmarks for domain-specific AI assistants with curated knowledge bases.

**Sub-2-second average response time.** From message received to first token streamed back to the customer. SSE streaming means the customer sees the response appearing token by token rather than waiting for a complete response. Perceived latency is significantly lower than actual generation time.

**Automated lead capture.** Names, email addresses, phone numbers, and travel dates mentioned in conversations are extracted and structured. Before deployment, this information was scattered across channels. Now it feeds directly into the company's follow-up workflow.

**24/7 availability.** The most immediate impact. Enquiries that previously waited until the next business day now receive an instant response at any hour. For a tourism-facing business where customers book from different time zones, this is a direct revenue impact — though we do not have the data to quantify it precisely.

**Staff redeployed to higher-value work.** The three staff members who were previously spending their day answering the same ten questions are now focused on closing bookings, managing VIP accounts, and handling the complex enquiries that the AI escalates. This is not a headcount reduction — it is a reallocation.

**Enquiry visibility for the first time.** The company now has data on what customers ask, when they ask it, which questions lead to bookings, and where the AI struggles. This has informed decisions about fleet composition, pricing, website content, and staffing schedules. Prior to deployment, these were guesswork.

## The technical stack

**Python 3.12 + FastAPI** for the API layer. Async throughout — every external call (LLM, governance, database, cache) is non-blocking.

**LangGraph** for multi-agent orchestration. The state machine handles intent classification, agent routing, and response generation as a compiled graph. Adding a new agent means adding a node and an edge.

**Anthropic Claude** for language generation. Claude Haiku for intent classification (speed) and response generation for routine queries. Claude Sonnet available for complex queries requiring deeper reasoning.

**Supabase with pgvector** for the knowledge base. Vehicle catalogue, pricing, policies, and FAQs are chunked, embedded, and stored as vectors. RAG retrieval uses cosine similarity with a tuned threshold.

**Upstash Redis** for session management. Conversation history is cached with a 24-hour TTL and a rolling window of recent messages for context.

**SSE streaming** for real-time response delivery. The widget renders tokens as they arrive rather than waiting for the full response.

**Multi-tenant architecture.** The same engine serves multiple clients. Each tenant has their own knowledge base, bot configuration, system prompt, and widget styling. Onboarding a new client means configuring a tenant — not deploying new infrastructure.

## What we would do differently

**Start with three agents, not seven.** For an MVP, you need engagement (greetings), a general RAG agent (handles everything with one knowledge base), and escalation (hand-off to humans). The specialist routing — fleet, policy, quote, booking, needs — is a refinement that improves accuracy but is not necessary for a first deployment. We built all seven because we had the architecture ready, but if we were advising a team starting from scratch, we would say: ship three, measure, then specialise.

**Invest more in escalation detection from day one.** We underestimated how important this would be. The escalation agent is the simplest agent in the system — it returns a fixed message and flags for human follow-up. But detecting when to escalate is the hardest classification problem. Customers express frustration in subtle ways that regex and even LLM classifiers miss. We added the all-caps detector and expanded the pattern list after launch, based on conversations where the AI tried to resolve something a human should have handled. If starting over, escalation detection would be the first thing we tested with real customer data.

**Test with real customer data sooner.** We built the knowledge base from the company's website content, policy documents, and pricing sheets. This covered 80% of what customers ask. The other 20% — questions phrased in ways we did not anticipate, local slang, questions that span multiple categories — only surfaced once real customers started using the system. We refined the knowledge base weekly during the first month. A one-week pilot with live traffic before "launch" would have caught most of these gaps earlier.

**Build the analytics dashboard earlier.** We added enquiry analytics — question categories, peak hours, escalation rates, unanswered question patterns — after the initial deployment. It should have been in the first release. The client's most common feedback in week one was "this is great, but what are customers actually asking?" The data was in the database. The dashboard to surface it was not.

## Is this relevant to your business?

This deployment was for vehicle rental, but the pattern applies to any service business that handles a predictable set of customer enquiries: property management, insurance brokers, medical practices, legal intake, hospitality, logistics.

If your team spends hours each day answering the same questions, if after-hours enquiries go unanswered, if customer data flows through unmonitored channels, and if you have no visibility into what your customers are actually asking — this is solvable.

The technology exists. The governance layer exists. The deployment timeline is weeks, not months.

See it in action at [tork.network/chat](https://tork.network/chat), or read about the broader thesis behind governed AI agents in *The Agent Crisis*, available free at [tork.network](https://tork.network).

---

*Built by the Tork team. Multi-agent AI with governance for customer-facing deployments. [tork.network](https://tork.network)*
