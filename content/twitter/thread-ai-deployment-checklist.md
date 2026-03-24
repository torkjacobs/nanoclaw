# Thread: The 15-Point Checklist Before Deploying AI Customer-Facing

Hook style: "Before you ship"

---

🧵 1/8

You're about to put an AI system in front of your customers. Before you do, here are 15 checks — each one exists because someone shipped without it and paid the price.

This is the list we use at Tork before every deployment. Thread below.

---TWEET---

🧵 2/8

Security (1-5):

1. PII detection — in the request path, before data is stored
2. Data isolation — can Tenant A's data leak into Tenant B's responses?
3. Encryption — TLS in transit, encrypted at rest
4. Access control — no open endpoints, rate limiting everywhere
5. Data residency — where does the data physically live?

---TWEET---

🧵 3/8

Test #1 yourself: send your AI a test credit card number (4111 1111 1111 1111). Check your conversation logs, your LLM provider's API logs, and your database.

If it appears anywhere — you don't have PII detection. Full stop.

---TWEET---

🧵 4/8

Governance (6-10):

6. Audit trail — queryable records, not log files
7. Compliance receipts — signed, tamper-evident, presentable to a regulator
8. Policy enforcement — output scanning, not just system prompt suggestions
9. Human escalation — automatic detection, not a "talk to agent" button
10. Kill switch — disable AI responses in under 5 seconds

---TWEET---

🧵 5/8

Test #9: send your AI "I WANT TO SPEAK TO A REAL PERSON THIS IS ABSOLUTELY UNACCEPTABLE."

If it responds with another AI-generated message instead of routing to a human — your escalation detection isn't working.

---TWEET---

🧵 6/8

Quality (11-15):

11. Response accuracy — test with 50+ real customer questions, not synthetic ones
12. Response time — sub-3 seconds to first visible token
13. Fallback behaviour — does it admit gaps or fabricate answers?
14. Multi-language — does RAG retrieval work cross-lingually?
15. Monitoring — automated alerts, not "check the dashboard on Monday"

---TWEET---

🧵 7/8

The scorecard:

15/15 → Ship it
12-14 → Close, address gaps post-launch with a plan
8-11 → Significant gaps, probably in governance
Below 8 → You're not ready. Fix foundations first.

---TWEET---

🧵 8/8

Full checklist with test instructions for each point — print it, check it, ship when it's green:

https://dev.to/torkjacobs/the-15-point-checklist-before-deploying-ai-customer-facing-3ic6

We built Tork on this checklist → https://tork.network

#AI #DevOps #Governance
