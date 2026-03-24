# Thread: How We Deployed AI Customer Service for a Vehicle Rental Company in 2 Weeks

Hook style: Stat

---

🧵 1/7

A vehicle rental company was answering the same 10 questions 50+ times a day. Three staff members. No after-hours coverage. Customer IDs flowing through unmonitored WhatsApp threads.

We deployed 7 AI agents in 2 weeks. Here's what happened.

---TWEET---

🧵 2/7

The problem wasn't lack of AI. It was lack of structure.

- Same pricing and availability questions, 40% of all enquiries
- After-hours messages unanswered until next morning
- Customer PII scattered across WhatsApp, email, and handwritten notes
- Zero compliance infrastructure under POPIA

---TWEET---

🧵 3/7

We deployed 7 specialist agents via Tork Chat:

Engagement → greetings
Fleet → vehicle availability
Policy → insurance, deposits, cross-border rules
Quote → pricing
Booking → reservation capture
Needs → clarifying vague queries
Escalation → human hand-off

Each one focused. No single prompt trying to do everything.

---TWEET---

🧵 4/7

The governance layer was built in from day one. PII detection on every message. Audit receipts on every interaction. POPIA alignment by design.

When the client's legal team asked "how does it handle personal information?" — the answer was a one-page technical summary, not a conversation about what needed to be built.

---TWEET---

🧵 5/7

Results after the first month:

- ~70%+ routine enquiries handled without humans
- Sub-2-second response time (SSE streaming)
- 24/7 availability — tourists landing at 9pm get instant answers
- Staff redeployed to closing bookings and VIP accounts

Not a headcount reduction. A reallocation.

---TWEET---

🧵 6/7

What we'd do differently:

Start with 3 agents (engagement, general RAG, escalation), not 7. Ship fast, measure, then specialise.

And invest more in escalation detection from day one. Detecting when to hand off to a human is the hardest classification problem in the system.

---TWEET---

🧵 7/7

Full case study with technical stack, architecture decisions, and honest lessons learned:

https://dev.to/torkjacobs/how-we-deployed-ai-customer-service-for-a-vehicle-rental-company-in-2-weeks-1cb

See Tork Chat in action → https://tork.network

#AI #CaseStudy #SaaS
