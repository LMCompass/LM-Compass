# USAGE

This repo provides a small framework for **prompt-based evaluation** of multiple LLMs via **OpenRouter** using an async OpenAI-compatible client. The core pieces are:

- `Evaluator` (base): OpenRouter client + utilities (model querying + JSON extraction).
- `PromptBasedEvaluator` (implementation): runs prompt-based scoring methods and returns a score matrix. 
- `main.py` (example runner): shows how to pick models, define a rubric, run an evaluation, and write results.

---

## Setup

1. Install deps (you’ll need at least `openai`, `python-dotenv`, `pandas`, `numpy`).
2. Create a `.env` file with:
   - `OPENROUTER_API_KEY=...` (required; the program errors if missing).
3. Ensure you have Python 3.10+ (recommended for typing + asyncio).

---

## Run the example

`main.py` demonstrates a full run:

- defines a `user_query`
- defines a `rubric`
- constructs a `PromptBasedEvaluator` with model display names that must match entries in `Evaluator.candidate_models`
- runs `n_sq_evaluate(...)` (or `n_evaluate(...)`)
- writes answers, scoring JSON, and a score table to `output.txt`

Typical flow (conceptually):

- **Answering phase:** each candidate model answers the user query (`user_query_answers`).
- **Scoring phase:** models act as judges and score responses according to the rubric, producing structured results (`evaluation_query_answers`).
- **Aggregation:** `score_table()` builds a pandas matrix of judge→evaluated scores.

---

## Choosing models

When you instantiate `PromptBasedEvaluator(*model_names)`, pass **exact** model display names from `Evaluator.candidate_models` (the `"name"` field). These are mapped to OpenRouter model IDs (the `"openrouter"` field).

If a name doesn’t match, querying returns an error response like `"Model '<name>' not found..."`.

---

## Evaluation methods

`PromptBasedEvaluator` currently supports two prompt-based approaches:

### 1) `n_sq_evaluate(user_query, rubric)` (n² judging)
- Each model answers once.
- Then, for every ordered pair of distinct models `(judge, evaluated)`, the judge scores that single evaluated answer using a dedicated scoring prompt produced by `_n_sq_scoring_query(...)`.
- The judge’s response must be a **single JSON object** with:
  - `"reasoning"` (one sentence)
  - `"score"` (0–100 integer)

### 2) `n_evaluate(user_query, rubric)` (n judging)
- Each model answers once.
- Each model, acting as judge, receives *all other models’ answers in one prompt* and returns a **JSON list** with a score object per candidate answer.

> Tip: Both methods rely on `Evaluator.extract_outermost_json(...)` to safely pull JSON out of messy model output (including code fences).

---

## Output and inspecting results

After running either evaluation method:

- `eval.user_query_answers` is a list of `{ "model": ..., "response": ... }` from the answering phase.
- `eval.evaluation_query_answers` is a normalized list of dicts like:
  - `evaluating_model`
  - `evaluated_model`
  - `score`
  - `reasoning`
- `eval.score_table()` returns a pandas DataFrame with judge models as rows and evaluated models as columns.

`main.py` writes all three sections to `output.txt`.

---

## Extending: add a new evaluation method

The intended extension point is to add methods on `PromptBasedEvaluator` (or create a new subclass of `Evaluator`).

### A) Add a new method in `PromptBasedEvaluator`

1. **Define your judging prompt format**
   - Follow the pattern of `_n_sq_scoring_query(...)` or `_n_scoring_query(...)`.
2. **Query models**
   - Use `self.query_models(models, queries)` for async batching.
3. **Parse structured outputs**
   - Use `self.extract_outermost_json(text)` to reliably parse JSON from completions.
4. **Normalize into `self.evaluation_query_answers`**
   - Follow the schema produced by `_n_format_json(...)` / `_n_sq_format_json(...)` so `score_table()` works without changes.

### B) Add a brand new evaluator type

If your evaluation isn’t prompt-based:

- Create `class MyEvaluator(Evaluator): ...`
- Reuse:
  - `query_model` / `query_models` for calling OpenRouter
  - `extract_outermost_json` for parsing returned structure

### C) Add or modify available models

Update `Evaluator.candidate_models` by adding:
- a human-readable `"name"` (used everywhere in the code)
- an OpenRouter `"openrouter"` identifier (used in API calls)

---

## Notes / gotchas

- OpenRouter API key is mandatory; the base class throws if missing.
- Model output parsing is “best-effort”: if required JSON keys are missing, those entries are skipped in formatting helpers.
- `temperature=1` is hardcoded in `query_model`; change there if you want deterministic judging.