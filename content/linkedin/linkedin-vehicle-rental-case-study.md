# LinkedIn: How We Deployed AI Customer Service for a Vehicle Rental Company in 2 Weeks
# Angle: Case study / speed story
# Status: draft (pending @tork approve linkedin)

---

Two weeks from kickoff to live deployment. 7 AI agents handling customer enquiries for a vehicle rental company with 200+ vehicles across three locations.

Here is what we walked into:

→ Three staff members answering the same 10 questions 50+ times a day
→ After-hours enquiries sitting unanswered until the next business day
→ Customer IDs and credit card numbers flowing through unmonitored WhatsApp threads
→ Zero compliance infrastructure under South Africa's POPIA
→ No data on what customers were actually asking

We deployed 7 specialist AI agents via Tork Chat — engagement, fleet search, policy lookup, quoting, booking, needs assessment, and escalation. Each agent focused on one job. A LangGraph state machine classifies intent on every message and routes to the right specialist.

Governance was built in from day one. PII detection on every message. Audit receipts on every interaction. When the client's legal team asked "how does it handle personal information?", the answer was a technical summary with receipt examples — not a conversation about what still needed to be built.

First month results:
→ ~70%+ of routine enquiries handled without human intervention
→ Sub-2-second response time with SSE streaming
→ 24/7 availability — tourists landing at 9pm get instant answers
→ Staff redeployed to closing bookings and managing VIP accounts

Not a headcount reduction. A reallocation.

Full case study with architecture, lessons, and what we would do differently:
https://dev.to/torkjacobs/how-we-deployed-ai-customer-service-for-a-vehicle-rental-company-in-2-weeks-1cb

Built with Tork (https://tork.network) — governed AI for customer-facing deployments.

#AI #CaseStudy #SaaS #Tork #Compliance
