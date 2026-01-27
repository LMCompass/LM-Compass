from evaluator import Evaluator
import pandas as pd
import numpy as np
import textwrap

class PromptBasedEvaluator(Evaluator):
    def __init__(self, *model_names):
        super().__init__(*model_names)
        self.user_query_answers = None
        self.evaluation_query_answers = None





    def _n_sq_scoring_query(self, user_query: str, rubric: str, answer: str):
        '''
        The query used for judging in the n^2 method of prompt based evaluation
        
        :param user_query: The original user query
        :param rubric: The users rubric for evaluating the answer
        :param answer: The answer given by the model being evaluated
        '''
        return textwrap.dedent(f"""\
        You are an expert evaluator for a large language model comparison tool. Your role is to provide an objective, rubric-based score for the candidate's response to a user's query.

        QUERY:
        {user_query}

        CANDIDATE RESPONSE:
        {answer}

        RUBRIC:
        {rubric}

        Instructions:

        Evaluate the Candidate Response on all rubric dimensions individually, strictly applying the rubric's defined score ranges and weightings—for example, Correctness & Accuracy is out of 25 points, Completeness 20 points, etc.

        If the Candidate Response contains any factual inaccuracies, assign the Correctness & Accuracy score corresponding to those errors as explicitly defined in the rubric, which could be as low as 0-4 out of 25 for fundamental factual errors. Do not inflate this score due to other qualities.

        Calculate the overall score as the weighted sum of all dimension scores, without subjective adjustment or rounding beyond rubric guidance.

        Your output must be ONLY a JSON object with:

        1. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>",

        2. "score": <integer score from 0 to 100>

        Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.
        """)

    def _n_sq_format_json(self, raw_data: list[dict]): # FIXME: make same as n_format_json and make sure no elements without required keys are added
        '''
        Private method that takes a list of responses and formats it into a json list where each element is a json
        object with (ideally) the following keys:
            - model (the model that evaluated the answer)
            - response (the rationale for what is scored the answer)
            - evaluated_model (the model that gave the original answer)
            - score (what the model scored the answer)
        If the response does not contain all of these keys, it is skipped
        
        :param raw_data: The raw list of responses from querying OpenRouter
        '''
        formatted_json = []
        i = 0
        for model1 in self.model_names:
            for model2 in self.model_names:
                if model1 != model2:
                    new_entry = dict()
                    new_entry["evaluated_model"] = model2
                    new_entry["evaluating_model"] = raw_data[i]["model"]
                    extracted_json = self.extract_outermost_json(raw_data[i]["response"])
                    i += 1
                    if extracted_json is None: continue
                    if "score" in extracted_json.keys():
                        new_entry["score"] = int(extracted_json["score"])
                    else: continue
                    if "reasoning" in extracted_json.keys():
                        new_entry["reasoning"] = extracted_json["reasoning"]
                    else: continue
                    formatted_json.append(new_entry)
        return formatted_json

    async def n_sq_evaluate(self, user_query: str, rubric: str):
        '''
        Does the n^2 method of prompt based evaluation and stores the results user_query_answers and evaluation_query_answers
        
        :param user_query: What the user is asking the models
        :param rubric: What the models should grade the responses to the user_query based on
        '''
        self.user_query_answers = await self.query_models(self.model_names, [user_query]*len(self.model_names))
        print("Got user query answers.")

        new_models_to_use = []
        new_queries_to_use = []
        for model1 in self.model_names:
            for item in self.user_query_answers:
                model2, answer = item["model"], item["response"]
                if model1 != model2:
                    new_models_to_use.append(model1)
                    new_queries_to_use.append(self._n_sq_scoring_query(user_query, rubric, answer))

        self.evaluation_query_answers = await self.query_models(new_models_to_use, new_queries_to_use)
        self.evaluation_query_answers = self._n_sq_format_json(self.evaluation_query_answers)
        print("Got scoring results.")





    def _n_scoring_query(self, user_query: str, rubric: str, model: str):
        '''
        The query used for judging in the n^2 method of prompt based evaluation
        Note: user_query_answers must be populated before using this method
        
        :param user_query: The original user query
        :param rubric: The users rubric for evaluating the answer
        :param model: The model doing the evaluating
        '''
        if model not in self.candidate_models:
            raise ValueError(f"Model {model} is not in the candidate models list.")
        answers = ""
        for other_model in self.user_query_answers:
            if model != other_model["model"]:
                answers += f"{other_model["model"]} RESPONSE:\n" + other_model["response"] + "\n\n"

        return textwrap.dedent(f"""\
        You are an expert evaluator for a large language model comparison tool. Your role is to provide objective, rubric-based scores for the candidate's responses to a user's query.

        QUERY:
        {user_query}

        {answers}

        RUBRIC:
        {rubric}

        Instructions:

        Evaluate all the Candidates Responses on all rubric dimensions individually, strictly applying the rubric's defined score ranges and weightings—for example, Correctness & Accuracy is out of 25 points, Completeness 20 points, etc.

        If any of the Candidates Responses contain any factual inaccuracies, assign the Correctness & Accuracy score corresponding to those errors as explicitly defined in the rubric, which could be as low as 0-4 out of 25 for fundamental factual errors. Do not inflate this score due to other qualities.

        Calculate the overall score as the weighted sum of all dimension scores for each Candidate Response, without subjective adjustment or rounding beyond rubric guidance.

        Your output must be ONLY a JSON list with JSON objects for each Candidate Response containing:

        1. "evaluated_model": "<full and exact name of the model as provided in this prompt>"

        2. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>",

        3. "score": <integer score from 0 to 100>

        E.g. [{{"evaluated_model": "<model_name>", "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>", "score": <integer score from 0 to 100>}}, ...]

        Here are the model names for reference: {self.model_names}

        Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.
        """)

    def _n_format_json(self, raw_data: list[dict]): # FIXME: make sure no elements without required keys are added
        '''
        Private method that takes a list of responses and formats it into a json list where each element is a json
        object with the following keys:
            - model (the model that evaluated the answer)
            - response (the rationale for what is scored the answer)
            - evaluated_model (the model that gave the original answer)
            - score (what the model scored the answer)
        If the response does not contain all of these keys, it is skipped
        
        :param raw_data: The raw list of responses from querying OpenRouter
        '''
        formatted_json = []
        for item1 in raw_data:
            extracted_json = self.extract_outermost_json(item1["response"])
            if extracted_json is None: continue
            for item2 in extracted_json:
                new_entry = dict()
                new_entry["evaluating_model"] = item1["model"]
                if "evaluated_model" in item2.keys():
                    new_entry["evaluated_model"] = item2["evaluated_model"]
                else: continue
                if "score" in item2.keys():
                    new_entry["score"] = int(item2["score"])
                else: continue
                if "reasoning" in item2.keys():
                    new_entry["reasoning"] = item2["reasoning"]
                else: continue
                formatted_json.append(new_entry)
        return formatted_json

    async def n_evaluate(self, user_query: str, rubric: str):
        '''
        Does the n method of prompt based evaluation and stores the results user_query_answers and evaluation_query_answers
        
        :param user_query: What the user is asking the models
        :param rubric: What the models should grade the responses to the user_query based on
        '''
        self.user_query_answers = await self.query_models(self.model_names, [user_query]*len(self.model_names))
        print("Got user query answers.")

        new_queries_to_use = []
        for model in self.model_names:
            new_queries_to_use.append(self._n_scoring_query(user_query, rubric, model))
        self.evaluation_query_answers = await self.query_models(self.model_names, new_queries_to_use)
        self.evaluation_query_answers = self._n_format_json(self.evaluation_query_answers)
        print("Got scoring results.")





    def score_table(self):
        '''
        Generates a pandas dataframe from the stored evaluation_query_answers data (which must exist for method to work)
        '''
        scores_table = pd.DataFrame(
            np.nan,
            index=pd.Index(self.model_names, name="Judge Model (Row)"),
            columns=pd.Index(self.model_names, name="Evaluated Model (Column)")
        )
        if self.evaluation_query_answers is not None:
            for item in self.evaluation_query_answers:
                model1 = item["evaluating_model"]
                model2 = item["evaluated_model"]
                if "score" in item.keys():
                    scores_table.loc[model1, model2] = item["score"]
        return scores_table