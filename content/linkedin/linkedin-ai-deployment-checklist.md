# LinkedIn: The 15-Point Checklist Before Deploying AI Customer-Facing
# Angle: Practical value / save-this-post
# Status: draft (pending @tork approve linkedin)

---

Save this post. You will need it before your next AI deployment.

15 checks before your AI talks to customers. Each one exists because someone shipped without it and learned the hard way.

Security (1-5):
1. PII detection — in the request path, before data is stored or forwarded
2. Data isolation — can one tenant's data leak into another's AI responses?
3. Encryption — TLS in transit, encrypted at rest, secrets in a vault
4. Access control — every endpoint authenticated, every session rate-limited
5. Data residency — where does the data physically live?

Governance (6-10):
6. Audit trail — queryable records, not log files
7. Compliance receipts — signed, tamper-evident, presentable to a regulator
8. Policy enforcement — runtime output scanning, not system prompt suggestions
9. Human escalation — automatic frustration detection, not a "talk to agent" button
10. Kill switch — disable AI responses in under 5 seconds, not "start a deployment"

Quality (11-15):
11. Response accuracy — tested with 50+ real customer questions
12. Response time — sub-3 seconds to first visible token
13. Fallback behaviour — admits gaps instead of fabricating answers
14. Multi-language — RAG retrieval works cross-lingually
15. Monitoring — automated alerts, not "check the dashboard on Monday"

The scorecard: 15/15 means ship it. 12-14 means close, address gaps with a plan. 8-11 means significant gaps. Below 8 means stop — fix foundations first.

Quick self-test: send your AI a test credit card number. If it shows up in your logs, you fail check #1 and you are not ready.

Full checklist with test instructions for every point:
https://dev.to/torkjacobs/the-15-point-checklist-before-deploying-ai-customer-facing-3ic6

This is the list we use at Tork (https://tork.network) before every deployment.

#AIGovernance #AI #DevOps #Compliance #Tork
