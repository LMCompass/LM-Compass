from prompt_based_evaluator import PromptBasedEvaluator
import json
import asyncio

user_query = "How many gigabytes of VRAM should I have for 1080p gaming?"

rubric = """Correctness & Accuracy (25 points) — Ensures claims are factually accurate and verifiable, addressing the most critical concern of hallucination-free responses. This is weighted highest because inaccurate information undermines all other qualities.

Completeness (20 points) - Verifies the answer addresses all aspects of the query without significant omissions. This prevents shallow or partial responses that technically answer only part of the question.

Clarity & Coherence (18 points) - Assesses whether the answer is well-organized with logical flow. Research shows that coherence and relevance are strong signals of problem-solving quality.

Relevance (18 points) - Ensures all information pertains to the question, avoiding tangential content that confuses the issue. This maintains focus and efficiency.

Conciseness (10 points) - Rewards efficiency by penalizing unnecessary verbosity or repetition while maintaining completeness. This balances against verbose but complete responses.

Appropriateness for Context (9 points) — Checks whether tone, depth, and format match what the questioner likely needs. Technical questions require different treatment than conversational ones."""





eval = PromptBasedEvaluator(
    "TNG: DeepSeek R1T2 Chimera (free)",
    "Meta: Llama 3.3 70B Instruct (free)",
    "AllenAI: Molmo2 8B (free)"
)

asyncio.run(eval.n_sq_evaluate(user_query, rubric))
#asyncio.run(eval.n_evaluate(user_query, rubric))

table = eval.score_table()
with open("output.txt", "w") as fh:
    fh.write("-------------------------------- USER QUERY ANSWERS --------------------------------\n\n")
    fh.write(str(json.dumps(eval.user_query_answers, indent=4)))
    fh.write("\n\n-------------------------------- SCORING RESULTS --------------------------------\n\n")
    fh.write(str(json.dumps(eval.evaluation_query_answers, indent=4)))
    fh.write("\n\n-------------------------------- SCORE TABLE --------------------------------\n\n")
    fh.write(str(table))