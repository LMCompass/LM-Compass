from prompt_based_evaluator import PromptBasedEvaluator
import textwrap

class RL4FEvaluator(PromptBasedEvaluator):
    def __init__(self,*model_names):
        super().__init__(*model_names)
        self.critique_history = []

    def format_critique_entry(self, item):
        '''
        Format one critique-history entry for readable before/after display.

        :param item: A single critique-history dict with keys like
                     `evaluating_model`, `evaluated_model`, `before_score`,
                     `before_reasoning`, `raw_response`, `after_score`,
                     and `after_reasoning`.
        :returns: Formatted multi-line string for display
        '''
        lines = [
            f"Judge: {item['evaluating_model']}  ->  Candidate: {item['evaluated_model']}",
            "  Before:",
            f"    Score: {item['before_score']}",
            f"    Reasoning: {item['before_reasoning']}",
            "  Raw response (critique + revision):",
            "    " + item["raw_response"].replace("\n", "\n    "),
            "  After:",
            f"    Score: {item.get('after_score')}",
            f"    Reasoning: {item.get('after_reasoning')}",
        ]
        return "\n".join(lines)

    def _self_critique_and_revision_prompt(self, user_query, rubric, response, reasoning, score):
        '''
        Combined prompt: critique your previous evaluation, then output revised
        reasoning and score as JSON. Saves one API call per pair per iteration.

        :param user_query: The original user query
        :param rubric: The rubric text guiding evaluation
        :param response: The candidate response being evaluated
        :param reasoning: The previous reasoning provided by the judge model
        :param score: The previous numeric score (0-100)
        :returns: A formatted prompt string for the model
        '''
        return textwrap.dedent(f"""\
        You previously evaluated a candidate's response and gave a score with a rationale. Now critique your evaluation and then provide a revised score and rationale.

        QUERY:
        {user_query}

        CANDIDATE RESPONSE (that you evaluated):
        {response}

        RUBRIC:
        {rubric}

        YOUR PREVIOUS EVALUATION:
        - Reasoning: {reasoning}
        - Score: {score} (out of 100)

        Instructions:

        1. Critique: Briefly critique your previous rationale and score. Consider whether you were too harsh or lenient, missed rubric criteria, or misapplied weightings. Be specific (e.g., "I may have been too strict on Completeness").

        2. Revision: After your critique, output your revised evaluation as a single JSON object. You must end your response with exactly one line that is only this JSON object (no other text on that line):
        {{"reasoning": "<one-sentence revised justification referencing rubric>", "score": <integer 0-100>}}
        """)

    async def _critique_rationale(self, user_query, rubric):
        '''
        For each (evaluating_model, evaluated_model) entry, ask the evaluating
        model to critique and revise its rationale/score; update entries in place.
        Uses batched `query_models` for one API call per pair.

        :param user_query: The original user query
        :param rubric: The rubric text guiding evaluation
        '''
        if not self.evaluation_query_answers or not self.user_query_answers:
            return
        response_by_model = {item["model"]: item["response"] for item in self.user_query_answers}
        model_names = []
        queries = []
        for entry in self.evaluation_query_answers:
            response = response_by_model.get(entry["evaluated_model"], "")
            reasoning = entry.get("reasoning", "")
            score = entry.get("score", 0)
            prompt = self._self_critique_and_revision_prompt(user_query, rubric, response, reasoning, score)
            model_names.append(entry["evaluating_model"])
            queries.append(prompt)
        results = await self.query_models(model_names, queries)
        round_data = []
        for i, entry in enumerate(self.evaluation_query_answers):
            before_reasoning = entry.get("reasoning", "")
            before_score = entry.get("score", 0)
            raw = results[i]["response"]
            revised = self.extract_outermost_json(raw)
            after_reasoning = revised.get("reasoning") if revised else None
            after_score = int(revised["score"]) if revised and "score" in revised else None
            round_data.append({
                "evaluating_model": entry["evaluating_model"],
                "evaluated_model": entry["evaluated_model"],
                "before_reasoning": before_reasoning,
                "before_score": before_score,
                "raw_response": raw,
                "after_reasoning": after_reasoning,
                "after_score": after_score,
            })
        self.critique_history.append(round_data)
        for i, entry in enumerate(self.evaluation_query_answers):
            if round_data[i]["after_reasoning"] is not None and round_data[i]["after_score"] is not None:
                entry["score"] = round_data[i]["after_score"]
                entry["reasoning"] = round_data[i]["after_reasoning"]

    async def rl4f_evaluate(self, user_query, rubric, iterations=1):
        '''
        Run RL-based refine-for-feedback evaluation.

        Performs an initial n^2 evaluation (via `n_sq_evaluate`) and then runs
        a number of self-critique refinement rounds where each evaluating model
        critiques and possibly revises its own scores.

        :param user_query: The original user query
        :param rubric: The rubric text guiding evaluation
        :param iterations: Number of refinement iterations to perform
        '''
        self.critique_history = []
        await self.n_sq_evaluate(user_query, rubric)
        for i in range(iterations):
            await self._critique_rationale(user_query, rubric)
            print(f"Completed refinement round {i + 1}/{iterations}")