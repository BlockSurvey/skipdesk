# SkipDesk — AI Impact Statement

**What the AI does.** SkipDesk is an AI voice front desk for small businesses. It answers calls, responds to questions from the business's own content, books/reschedules/cancels appointments against live availability, and captures leads when it can't resolve a request.

**Models & why.** **Vapi** powers real-time voice (low latency, natural turn-taking). **Claude** drives reasoning and tool calls. **Workers AI** (`bge-base-en-v1.5`) embeds documents for knowledge-base retrieval — chosen for grounded, edge-native, low-cost inference.

**Data provenance & licenses.** All knowledge comes from content the business itself uploads and owns (FAQs, PDFs/DOCX). No third-party or scraped data trains or grounds the agent. Data is strictly tenant-isolated; no cross-business access path exists.

**Hallucination/bias mitigations.** Answers are grounded in the business's own knowledge base and structured tools (real availability, real records), not free-form generation. Booking details are read back to confirm. When unsure, the agent **escalates to a human** instead of guessing.

**Expected outcomes.** *Users:* every caller heard, 24/7. *Business:* recovered revenue from calls that would have gone to voicemail. *Safety:* grounded, auditable, human-escalating — no autonomous high-stakes decisions.
