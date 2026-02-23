import asyncio
from dataclasses import dataclass
from textwrap import dedent
from typing import Any, Dict, List, Tuple

from prompt_based_evaluator import PromptBasedEvaluator


@dataclass
class GradeResult:
    scores: Dict[str, float]
    justification: str
    raw_model_output: Any


class GradeHITL(PromptBasedEvaluator):
    """Human-in-the-loop grading evaluator that refines rubrics based on ambiguous cases."""

    def __init__(self, *model_names):
        """Initialize the GradeHITL evaluator.

        :param model_names: Model names to use for grading. At least one must be provided.
        """
        super().__init__(*model_names)

    async def call_llm(self, prompt: str, model_name: str = None) -> Dict[str, Any]:
        """Call the configured OpenRouter model and return parsed JSON.

        This uses the same AsyncOpenAI client and JSON-extraction helper as the
        rest of the eval-notebooks stack (via `Evaluator`).

        :param model_name: If provided, use this model; otherwise use the first in model_names.
        """

        if model_name is None:
            model_name = self.model_names[0]
        result = await self.query_model(model_name, prompt)
        parsed = self.extract_outermost_json(result["response"])
        if parsed is None:
            raise ValueError(
                f"Model response did not contain valid JSON. Raw response: {result['response']}"
            )
        if not isinstance(parsed, dict):
            raise ValueError(f"Expected JSON object, got: {type(parsed)}")
        return parsed

    def _grading_prompt(self, example: Dict[str, Any], rubric: str) -> str:
        """Build the combined system + user prompt used for grading (shared by all model calls)."""
        system_prompt = dedent(f"""\
            You are an expert grader.
            Use the rubric below to grade the student's response.

            RUBRIC:
            {rubric}

            Your output must be ONLY a JSON object with these exact fields:
            - "scores": an object mapping dimension names to numeric scores
            - "justification": a short natural language explanation (string)

            Example format:
            {{"scores": {{"correctness": 0.8, "clarity": 0.9}}, "justification": "The response is mostly correct but lacks detail."}}

            Do not include any text before or after the JSON object. Return ONLY the JSON.
        """)
        user_prompt = (
            f"Question/Task:\n{example['prompt']}\n\n"
            f"Student Response:\n{example['response']}\n"
        )
        return system_prompt + "\n\n" + user_prompt

    async def _grade_one_model(
        self, example: Dict[str, Any], rubric: str, model_name: str
    ) -> GradeResult:
        """Grade a single example with one model. Used internally for single- and multi-model flows."""
        prompt = self._grading_prompt(example, rubric)
        raw = await self.call_llm(prompt, model_name=model_name)
        return GradeResult(
            scores=raw["scores"],
            justification=raw["justification"],
            raw_model_output=raw,
        )

    async def generate_questions_for_human(
        self, example: Dict[str, Any], rubric: str, grade: GradeResult
    ) -> Dict[str, Any]:
        """Ask the model to formulate targeted clarification questions."""

        system_prompt = dedent(f"""\
            You are helping an educator refine a grading rubric.
            Given the rubric, an example, and the grader's decision, identify why the
            case is ambiguous and propose 1–3 concise questions for the educator.
            Also propose concrete rubric tweaks that would resolve similar cases
            consistently in the future.

            RUBRIC:
            {rubric}
        """)

        user_prompt = dedent(f"""\
            Example prompt:
            {example['prompt']}

            Student response:
            {example['response']}

            Grader justification:
            {grade.justification}

            Grader scores: {grade.scores}

            Your output must be ONLY a JSON object with these exact fields:
            - "questions": a list of strings (1-3 concise questions for the educator)
            - "draft_rubric_changes": a string describing proposed rubric tweaks

            Example format:
            {{"questions": ["Should partially correct answers receive partial credit?", "Is mentioning specific examples required?"], "draft_rubric_changes": "Clarify that partial credit applies when reasoning is correct but execution has minor errors."}}

            Do not include any text before or after the JSON object. Return ONLY the JSON.
        """)

        raw = await self.call_llm(system_prompt + "\n\n" + user_prompt)
        return raw

    def collect_human_answers(self, questions_and_drafts: Dict[str, Any]) -> Dict[str, str]:
        """CLI-based way to collect human answers.

        For quick testing, this will print each question and read answers
        using `input()`. You can replace this with a more sophisticated UI
        or pre-scripted answers later.
        """

        questions = questions_and_drafts.get("questions", []) or []
        human_answers: Dict[str, str] = {}

        if not questions:
            return human_answers

        print("\nThe model flagged an ambiguous case. Please answer the following questions:")
        for i, q in enumerate(questions):
            print(f"Q{i+1}: {q}")
            ans = input(f"A{i+1}: ")
            human_answers[str(i)] = ans

        return human_answers

    async def update_rubric_from_human(
        self,
        rubric: str,
        example: Dict[str, Any],
        grade: GradeResult,
        questions_and_drafts: Dict[str, Any],
        human_answers: Dict[str, str],
    ) -> str:
        """Create a new rubric version incorporating human clarification."""

        q_block = "\n".join(
            f"Q{i+1}: {q}\nA{i+1}: {human_answers.get(str(i), 'TODO')}"
            for i, q in enumerate(questions_and_drafts.get("questions", []))
        )

        system_prompt = dedent(f"""\
            You are a rubric designer.
            Given the current rubric, an ambiguous example, the grader's behavior,
            clarification questions, and the educator's answers, produce an updated
            rubric description that would lead to correct grading of this and
            similar cases. Keep it concise but explicit about edge cases.

            CURRENT RUBRIC:
            {rubric}
        """)

        user_prompt = dedent(f"""\
            Example prompt:
            {example['prompt']}

            Student response:
            {example['response']}

            Grader scores: {grade.scores}
            Justification:
            {grade.justification}

            Clarifications:
            {q_block}

            Draft rubric changes from helper model:
            {questions_and_drafts.get('draft_rubric_changes', '')}

            Your output must be ONLY a JSON object with this exact field:
            - "rubric": a string containing the complete updated rubric text

            Example format:
            {{"rubric": "Grade each response on two dimensions: 'correctness' (0-1) and 'clarity' (0-1). Partial credit applies when reasoning is correct but execution has minor errors..."}}

            Do not include any text before or after the JSON object. Return ONLY the JSON.
        """)

        raw = await self.call_llm(system_prompt + "\n\n" + user_prompt)

        # Extract the rubric text from the JSON response
        rubric_text = raw.get("rubric", str(raw))
        return rubric_text

    async def grade_all_models(
        self, example: Dict[str, Any], rubric: str
    ) -> Dict[str, GradeResult]:
        """Grade a single example with all configured models, returning individual results per model.
        
        :param example: The example to grade
        :param rubric: The grading rubric
        :returns: Dictionary mapping model names to their GradeResult
        """
        if len(self.model_names) == 1:
            result = await self._grade_one_model(example, rubric, self.model_names[0])
            return {self.model_names[0]: result}
        
        # Grade in parallel with all models
        results: List[GradeResult] = await asyncio.gather(
            *[self._grade_one_model(example, rubric, m) for m in self.model_names]
        )
        
        return {model: result for model, result in zip(self.model_names, results)}

    def _grader_evaluation_prompt(
        self, example: Dict[str, Any], rubric: str, grader_name: str, grader_result: GradeResult
    ) -> str:
        """Build a prompt for evaluating how well a grader performed.
        
        :param example: The original example
        :param rubric: The grading rubric
        :param grader_name: Name of the model that did the grading
        :param grader_result: The GradeResult from the grader
        :returns: Formatted prompt string
        """
        return dedent(f"""\
            You are an expert evaluator assessing how well another model performed as a grader.

            ORIGINAL QUESTION:
            {example['prompt']}

            STUDENT RESPONSE:
            {example['response']}

            GRADING RUBRIC:
            {rubric}

            GRADER'S EVALUATION:
            Grader Model: {grader_name}
            Scores Given: {grader_result.scores}
            Justification: {grader_result.justification}

            Your task is to evaluate how well this grader performed. Consider:
            - Did the grader correctly apply the rubric?
            - Are the scores appropriate given the rubric criteria?
            - Is the justification reasonable?

            Your output must be ONLY a JSON object with these exact fields:
            - "score": an integer from 0 to 100 representing how well the grader performed
            - "reasoning": a short explanation of your evaluation

            Example format:
            {{"score": 85, "reasoning": "The grader correctly identified the answer as correct and applied the rubric appropriately, though the justification could be more detailed."}}

            Do not include any text before or after the JSON object. Return ONLY the JSON.
        """)

    async def cross_evaluate_graders(
        self, example: Dict[str, Any], rubric: str, grader_results: Dict[str, GradeResult]
    ) -> Dict[str, Dict[str, int]]:
        """Cross-evaluate all graders. Each model evaluates all other models' grading performance.
        
        :param example: The original example
        :param rubric: The grading rubric
        :param grader_results: Dictionary mapping model names to their GradeResult
        :returns: Dictionary mapping grader_name to a dict of evaluator_name -> score
        """
        if len(self.model_names) < 2:
            # Need at least 2 models for cross-evaluation
            return {}
        
        # For each grader, have all other models evaluate it
        cross_eval_results: Dict[str, Dict[str, int]] = {}
        
        for grader_name, grader_result in grader_results.items():
            evaluator_names = [m for m in self.model_names if m != grader_name]
            if not evaluator_names:
                continue
            
            # Create prompts for all evaluators
            prompts = [
                self._grader_evaluation_prompt(example, rubric, grader_name, grader_result)
                for _ in evaluator_names
            ]
            
            # Query all evaluators in parallel
            responses = await self.query_models(evaluator_names, prompts)
            
            # Parse results
            cross_eval_results[grader_name] = {}
            for response in responses:
                evaluator_name = response["model"]
                parsed = self.extract_outermost_json(response["response"])
                if parsed and isinstance(parsed, dict) and "score" in parsed:
                    cross_eval_results[grader_name][evaluator_name] = int(parsed["score"])
        
        return cross_eval_results

    def check_score_range(
        self, cross_eval_results: Dict[str, Dict[str, int]], threshold: float
    ) -> Tuple[bool, Dict[str, Tuple[int, int]]]:
        """Check if any grader's score range exceeds the threshold.
        
        :param cross_eval_results: Dictionary mapping grader_name to evaluator_name -> score
        :param threshold: Maximum allowed score range (max - min)
        :returns: Tuple of (should_trigger_hitl, dict mapping grader_name to (min_score, max_score))
        """
        score_ranges = {}
        should_trigger = False
        
        for grader_name, scores in cross_eval_results.items():
            if not scores:
                continue
            score_values = list(scores.values())
            min_score = min(score_values)
            max_score = max(score_values)
            score_range = max_score - min_score
            score_ranges[grader_name] = (min_score, max_score)
            
            if score_range > threshold:
                should_trigger = True
        
        return should_trigger, score_ranges

    async def grade_with_cross_eval_hitl_batch(
        self,
        examples: List[Dict[str, Any]],
        rubric: str,
        *,
        score_range_threshold: float = 20.0,
        interactive: bool = True,
    ) -> Tuple[str, List[Dict[str, GradeResult]], List[Dict[str, Dict[str, int]]]]:
        """Grade examples with cross-evaluation and HITL refinement based on score range.
        
        For each example:
        1. Each model grades the student's answer
        2. All other models evaluate each grader's performance
        3. If score range exceeds threshold, trigger HITL refinement
        4. After refinement, re-run cross-evaluation
        
        :param examples: List of examples to grade
        :param rubric: The grading rubric
        :param score_range_threshold: Maximum allowed score range (max - min) before triggering HITL
        :param interactive: Whether to collect human input interactively
        :returns: Tuple of (final_rubric, list of grader_results per example, list of cross_eval_results per example)
        """
        updated_rubric = rubric
        all_grader_results: List[Dict[str, GradeResult]] = []
        all_cross_eval_results: List[Dict[str, Dict[str, int]]] = []
        
        for ex in examples:
            print("\n" + "=" * 60)
            print(f"Processing example: {ex['prompt'][:80]}...")
            print("=" * 60)
            
            # Step 1: Each model grades the student's answer
            print("\nStep 1: All models grading student answer...")
            grader_results = await self.grade_all_models(ex, updated_rubric)
            all_grader_results.append(grader_results)
            
            for grader_name, result in grader_results.items():
                print(f"  {grader_name}: scores={result.scores}")
            
            # Step 2: Cross-evaluate the graders
            print("\nStep 2: Cross-evaluating graders...")
            cross_eval_results = await self.cross_evaluate_graders(ex, updated_rubric, grader_results)
            all_cross_eval_results.append(cross_eval_results)
            
            # Display cross-evaluation results
            for grader_name, evaluator_scores in cross_eval_results.items():
                score_values = list(evaluator_scores.values())
                min_score = min(score_values)
                max_score = max(score_values)
                avg_score = sum(score_values) / len(score_values)
                range_note = "" if len(score_values) > 1 else " (only 1 evaluator)"
                print(f"  {grader_name}: scores range [{min_score}, {max_score}]{range_note}, avg={avg_score:.1f}")
                for evaluator, score in evaluator_scores.items():
                    print(f"    - {evaluator}: {score}")
            
            # Step 3: Check if score range exceeds threshold
            should_trigger, score_ranges = self.check_score_range(cross_eval_results, score_range_threshold)
            
            if should_trigger:
                print(f"\n⚠️  Score range exceeds threshold ({score_range_threshold}). Triggering HITL refinement...")
                for grader_name, (min_score, max_score) in score_ranges.items():
                    if max_score - min_score > score_range_threshold:
                        print(f"  {grader_name}: range = {max_score - min_score} (threshold: {score_range_threshold})")
                
                # Use the first grader's result for HITL (or could aggregate)
                first_grader_name = list(grader_results.keys())[0]
                first_grader_result = grader_results[first_grader_name]
                
                # Generate questions for human
                qa = await self.generate_questions_for_human(ex, updated_rubric, first_grader_result)
                
                if interactive:
                    # Collect human answers
                    human_answers = self.collect_human_answers(qa)
                    
                    # Update rubric
                    updated_rubric = await self.update_rubric_from_human(
                        updated_rubric,
                        ex,
                        first_grader_result,
                        qa,
                        human_answers,
                    )
                    print("\n" + "-" * 60)
                    print("Updated rubric:")
                    print("-" * 60)
                    print(updated_rubric)
                    print("-" * 60)
                    
                    # Re-grade and re-cross-evaluate with updated rubric
                    print("\nRe-grading and re-cross-evaluating with updated rubric...")
                    grader_results = await self.grade_all_models(ex, updated_rubric)
                    all_grader_results[-1] = grader_results  # Update the last entry
                    
                    cross_eval_results = await self.cross_evaluate_graders(ex, updated_rubric, grader_results)
                    all_cross_eval_results[-1] = cross_eval_results  # Update the last entry
                    
                    print("Re-evaluation results:")
                    for grader_name, evaluator_scores in cross_eval_results.items():
                        score_values = list(evaluator_scores.values())
                        min_score = min(score_values)
                        max_score = max(score_values)
                        avg_score = sum(score_values) / len(score_values)
                        range_note = "" if len(score_values) > 1 else " (only 1 evaluator)"
                        print(f"  {grader_name}: scores range [{min_score}, {max_score}]{range_note}, avg={avg_score:.1f}")
            else:
                print(f"\n✓ Score ranges within threshold ({score_range_threshold}). Continuing...")
        
        return updated_rubric, all_grader_results, all_cross_eval_results
