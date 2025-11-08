These notebooks evaluate different LLM-as-a-judge strategies for LM Compass.

Reference material: https://docs.google.com/document/d/1vKkgJj6Tj-gSZ-1LUBvNQQ34gatz0RaRCWAMDegFozU/edit?tab=t.0#heading=h.jo95wu3e9n0z (Prompt­-based Rubric Scoring, Multi-Agent Self Reflection, Rationale‑Based Self‑Critique Loops)

Also see our proposed algorithm for judging: https://docs.google.com/document/d/1oDZiobHY0ze7zyKv1oRim8qLS9VL1oiLWeWElbhV6RI/edit?usp=sharing

The goal is to compare various methods against each other and against simply using a single model's output.

General prompt -> evaluation flow:
0. Select n model candidates M (n = 2 to 4)
1. Call OpenRouter API on initial input query Q to M candidates (in parallel, async function required probably)
2. Store all responses R_0..R_n
3. Pick an evaluation method
4. Initialize judge(s) based on evaluation method
5. Compare the judges evaluation to a baseline LLM (e.g. Base GPT-4o vs. GPT-4o Judge)

Example of evaluation comparison
1. User submits query
2. Query gets passed to GPT-4o and Deepseek (A & B)
3. We pick our proposed algorithm for evaluation (see above)
3.1 Response A gets sent to Judge B. Response B gets sent to Judge A.
3.2 Given a generic judging prompt, they determine a score
3.3 The returned response is the response with the higher score (as long as it passes threshold, see above linked document)
4. Return the 'winning' response
5. Find metrics or reasons for effectiveness of this approach
6. Repeat for other methods