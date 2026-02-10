from rl4f_evaluator import RL4FEvaluator
import json
import asyncio

user_query = "How many gigabytes of VRAM should I have for 1080p gaming?"

rubric = """Correctness & Accuracy (25 points) — Ensures claims are factually accurate and verifiable, addressing the most critical concern of hallucination-free responses. This is weighted highest because inaccurate information undermines all other qualities.

Completeness (20 points) - Verifies the answer addresses all aspects of the query without significant omissions. This prevents shallow or partial responses that technically answer only part of the question.

Clarity & Coherence (18 points) - Assesses whether the answer is well-organized with logical flow. Research shows that coherence and relevance are strong signals of problem-solving quality.

Relevance (18 points) - Ensures all information pertains to the question, avoiding tangential content that confuses the issue. This maintains focus and efficiency.

Conciseness (10 points) - Rewards efficiency by penalizing unnecessary verbosity or repetition while maintaining completeness. This balances against verbose but complete responses.

Appropriateness for Context (9 points) — Checks whether tone, depth, and format match what the questioner likely needs. Technical questions require different treatment than conversational ones."""





eval = RL4FEvaluator(
    "Anthropic: Claude Sonnet 4.5",
    "OpenAI: GPT-4o",
    "OpenAI: GPT-4o Mini"
)

asyncio.run(eval.rl4f_evaluate(user_query, rubric))

table = eval.score_table()
with open("output.txt", "w") as fh:
    fh.write("-------------------------------- USER QUERY ANSWERS --------------------------------\n\n")
    fh.write(str(json.dumps(eval.user_query_answers, indent=4)))
    fh.write("\n\n-------------------------------- SCORING RESULTS --------------------------------\n\n")
    fh.write(str(json.dumps(eval.evaluation_query_answers, indent=4)))
    fh.write("\n\n-------------------------------- SCORE TABLE --------------------------------\n\n")
    fh.write(str(table))
    fh.write("\n\n-------------------------------- CRITIQUE HISTORY --------------------------------\n\n")
    for round_idx, round_data in enumerate(eval.critique_history):
        fh.write(f"=== Refinement round {round_idx + 1} ===")
        for item in round_data:
            fh.write(eval.format_critique_entry(item))
            fh.write("---")