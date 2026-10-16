# Project instructions
Read README.md and docs/STATUS.md, DECISIONS.md, DATA_MODEL.md, SECURITY.md before changes. Read docs/USER_REQUIREMENTS.txt for the original detailed brief.
Use this existing workspace; do not create another Desktop project. Work in reviewable milestones. Latest user direction permits routine UI decisions without waiting for design approval. Prioritize database/access dependencies before new features.
Stack: React, strict TypeScript, Vite, Tailwind, Supabase Auth/PostgreSQL, narrow trusted Edge Functions, private GitHub, Cloudflare Pages. No extra backend.
Fake data only during development. Never print or commit secrets. No production deployment or purchases without explicit authorization.
Do not invent financial rules. Pending reports and uncleared checks never reduce settled balances. Financial writes belong in transactional PostgreSQL functions with RLS, authorization, idempotency and concurrency tests.
Use exact monetary arithmetic; no ordinary floating-point money calculations. Philippine business dates, UTC timestamps.
Accessibility: 18px baseline, semantic controls, persistent labels, visible focus, 44px targets, text statuses, 200% zoom and narrow reflow. Do not claim WCAG compliance without verification.
Update docs with decisions, evidence, limitations and exact next steps each milestone. Do not implement the entire brief in one step.
