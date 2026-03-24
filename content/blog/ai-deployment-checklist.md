---
title: "The 15-Point Checklist Before Deploying AI Customer-Facing"
published: true
description: "15 things to verify before your AI talks to customers — covering security, governance, compliance, and quality. Print it. Check it. Ship when it's green."
tags: ai, checklist, deployment, governance
canonical_url: https://tork.network/blog/ai-deployment-checklist
cover_image:
---

You are about to put an AI system in front of your customers. Before you do, run through these 15 checks. Each one exists because someone, somewhere, shipped without it and paid the price.

This is not theory. This is the list we use at [Tork](https://tork.network) before every customer deployment.

---

## Security & Privacy

### 1. PII Detection

Can your system detect personally identifiable information in real-time — in the request path, before data is stored or forwarded to a third-party API?

The minimum set: credit card numbers (Luhn validation), national ID numbers (format-specific per country), phone numbers, and email addresses. These are the data types that appear most frequently in customer conversations and carry the highest regulatory risk.

**How to test:** Send your chatbot a message containing a test credit card number (use 4111 1111 1111 1111 — the standard Luhn-valid test number). Check whether it appears in your conversation logs, your LLM provider's API logs, and your database. If it does, you do not have PII detection.

### 2. Data Isolation

If your platform serves multiple customers or business units, is data separated between tenants?

The test is specific: can Tenant A's knowledge base content, conversation history, or customer data appear in Tenant B's AI responses? This happens more often than vendors admit — shared vector databases without tenant-scoped queries are the usual cause.

**How to test:** Create two test tenants. Add a unique, fabricated fact to Tenant A's knowledge base (e.g., "Our company was founded on Mars in 1742"). Query Tenant B with a question that would surface this fact. If it appears, your data isolation is broken.

### 3. Encryption

TLS in transit. Encryption at rest. This is table stakes, not a feature.

Every connection between the user's browser and your API should be TLS 1.2 or higher. Every database, cache, and object store should encrypt data at rest. Every API key, secret, and credential should be stored in a secrets manager, not in environment variables committed to version control.

**How to test:** Run your API URL through an SSL checker. Review your database configuration for at-rest encryption settings. Search your repository for hardcoded API keys (`grep -r "sk-" .` catches more than you would expect).

### 4. Access Control

No open endpoints. Every API call should be authenticated. Every endpoint should be rate-limited.

Authentication means API keys at minimum, OAuth or JWT for production. Rate limiting means per-session, per-tenant, and global limits. Without rate limiting, a single user — or a bot — can exhaust your LLM API budget in minutes.

**How to test:** Call your chat endpoint without authentication headers. If you get a response instead of a 401, you have an open endpoint. Send 100 requests in 10 seconds from a single session. If all 100 succeed, you do not have rate limiting.

### 5. Data Residency

Where is the data stored? Not where your server is — where the data physically resides. This includes your database, your cache, your LLM provider's API (which may log inputs), and any analytics or monitoring tools that ingest conversation data.

POPIA requires that South African personal data be processed with appropriate safeguards. GDPR restricts data transfers outside the EU without adequate protection. CCPA gives California consumers rights over their data regardless of where the processor is located. The law that applies depends on where your customers are, not where your infrastructure is.

**How to test:** Map every service that touches customer data. For each one, determine the data storage region. If you cannot answer "where is this data stored?" for every service in your stack, you are not ready.

---

## Governance & Compliance

### 6. Audit Trail

Can you retrieve a complete, structured record of what your AI said to a specific customer at a specific time?

A chat log is not an audit trail. An audit trail is queryable by customer, by conversation, by time range, and by action type. It includes the customer's input, what governance actions were taken (redaction, policy checks), what the AI received after processing, and what the AI responded.

**How to test:** Pick a conversation from last week. How long does it take you to pull the complete interaction record — including any governance actions? If the answer is "I need to check multiple systems" or "I need engineering help," your audit trail has gaps.

### 7. Compliance Receipts

Does each interaction generate a signed, tamper-evident record that can be presented to a regulator as evidence?

The difference between a log entry and a compliance receipt: a log entry says "the AI responded at 14:32." A compliance receipt says "at 14:32:07 UTC, the AI received input X (after PII redaction), generated response Y, which passed output policy check Z, and this record is signed with HMAC-SHA256 and has not been modified since creation."

Under GDPR, data subjects can request a full accounting of how their data was processed. Under POPIA, a regulator can request evidence of appropriate safeguards. A signed receipt answers both requests. A log line does not.

**How to test:** Request a compliance receipt for a specific conversation from your platform. If the response is "we have logs," that is not the same thing. If the response is a structured record with a unique ID, timestamp, and cryptographic signature — you have receipts.

### 8. Policy Enforcement

Can you define rules about what the AI can and cannot discuss, and are those rules enforced at the output level?

A system prompt that says "do not discuss competitors" is a suggestion. The model may follow it. It may not. Policy enforcement means scanning the AI's output before it reaches the customer and blocking or flagging responses that violate defined rules.

Topic boundaries, claim restrictions, required disclaimers, forbidden content categories — these should be code, not prompts.

**How to test:** Add a policy rule that blocks a specific topic. Then ask the AI about that topic in five different ways — directly, indirectly, through hypotheticals, through comparison, and through a "just curious" framing. If any of the five gets through, your policy enforcement has gaps.

### 9. Human Escalation

When the AI cannot resolve a query, or when the customer is frustrated, is there an automatic path to a human?

Automatic means the system detects escalation signals — explicit requests for a human ("speak to a manager"), frustration patterns (excessive capitalisation, repeated negative sentiment, insults), and repeated failed interactions (the customer asks the same question three times). Detection triggers a handoff without requiring the customer to find and click a button.

**How to test:** Send your chatbot "I WANT TO SPEAK TO A REAL PERSON THIS IS ABSOLUTELY UNACCEPTABLE." If the AI responds with another AI-generated message instead of routing to a human, your escalation detection is not working.

### 10. Kill Switch

Can you disable AI responses in under 5 seconds?

Not "start a deployment." Not "merge a PR and wait for CI." A kill switch — one action that stops the AI from responding to customers. Per-tenant (disable one client), per-topic (disable a specific capability), or global (everything stops).

When an AI starts generating harmful, incorrect, or embarrassing content at scale, the damage is measured in seconds. Your response time needs to match.

**How to test:** Time it. From the moment you decide to shut down, how many seconds until the AI stops responding to the next customer message? If it is more than 30 seconds, it is too slow.

---

## Quality & Experience

### 11. Response Accuracy

Have you tested with real customer questions — not synthetic benchmarks, not your own team's questions, but actual messages from actual customers?

Build a test set of 50+ real customer queries (with answers verified by your team). Run them through the AI. Measure the accuracy rate. If it is below 90% for your domain, you need a better knowledge base, better prompts, or both.

**How to test:** Collect the last 50 customer enquiries from your support inbox. Feed them to the AI. Have your team grade each response: correct, partially correct, or incorrect. Calculate the accuracy rate. Do this before launch, not after.

### 12. Response Time

Sub-3 seconds for the first visible token. Customers will not wait longer.

This is not the time to generate the full response — it is the time until the customer sees the first word appearing on screen. SSE streaming makes this possible even when the full response takes 5-10 seconds to generate. Without streaming, the customer stares at a spinner and leaves.

**How to test:** Measure time-to-first-token under realistic conditions — not on your local machine, but on the production infrastructure, with real network latency, during peak hours. If it is consistently above 3 seconds, either your model is too slow, your infrastructure is under-provisioned, or you are not streaming.

### 13. Fallback Behaviour

What happens when the AI does not know the answer? There are two outcomes: it makes something up, or it says so honestly.

The correct fallback is: "I don't have that specific information. Let me connect you with our team, or you can reach us at [contact details]." The incorrect fallback is a confident fabrication — an invented policy, a wrong price, a made-up feature.

Hallucination is the default behaviour of language models. Honest fallback is a design decision that requires explicit instruction in the system prompt and validation in the output scan.

**How to test:** Ask the AI a question that is not in the knowledge base. Something specific and verifiable — a policy that does not exist, a product you do not sell, a location you do not operate in. If the AI invents an answer instead of acknowledging the gap, your fallback is not working.

### 14. Multi-Language

If your customers speak multiple languages, does the AI detect the language and respond accordingly?

Modern LLMs handle multilingual input natively — Claude, GPT-4, and Gemini all respond in the language of the input without explicit configuration. But your knowledge base may be in one language only. If a customer asks in Afrikaans and your knowledge base is in English, the RAG retrieval may fail because the embeddings do not match cross-lingually.

**How to test:** Send the same question in every language your customers use. Check that the response is in the correct language and that the RAG retrieval returns relevant results. Cross-lingual RAG is a known weak point — if accuracy drops in non-primary languages, you may need multilingual embeddings or translated knowledge base content.

### 15. Monitoring

Can you see conversations in real-time? Are you alerted when the AI escalates, when accuracy drops, or when anomalous patterns appear?

Monitoring is not "we check the dashboard on Monday morning." It is automated alerts on: escalation rate exceeding a threshold, response time degradation, repeated unanswered questions (knowledge base gaps), and governance denials (potential abuse).

**How to test:** Trigger an escalation. How long until someone on your team knows about it? If the answer is "when they next check the dashboard," your monitoring is reactive, not proactive.

---

## The scorecard

Count your checks.

**15/15** — You are ready. Ship it.

**12-14** — You are close. The gaps are likely in monitoring, multi-language, or compliance receipts. These can be addressed post-launch if you have a plan and a timeline.

**8-11** — You have significant gaps. The missing items are probably in the governance section. Deploying without them is a calculated risk — make sure the people accepting that risk understand what they are accepting.

**Below 8** — You are not ready. The risk of a compliance incident, a customer data breach, or a reputational event is too high. Fix the foundations before launching.

---

## One more thing

This checklist is designed to be platform-agnostic. You can use it to evaluate any AI chatbot, whether you built it yourself or bought it off the shelf.

If you want a head start: [Tork Chat](https://tork.network/chat) ships with items 1-10 enabled by default — PII detection, data isolation, encryption, access control, audit trails, compliance receipts, policy enforcement, escalation detection, and a kill switch. Items 11-15 depend on your specific deployment: your knowledge base quality, your infrastructure, your monitoring setup, and your customer base.

Start free at [tork.network/chat](https://tork.network/chat). Read the full case for governed AI deployment in *The Agent Crisis*, available free at [tork.network](https://tork.network).

---

*Built by the Tork team. Print the checklist. Check it before you ship. [tork.network](https://tork.network)*
