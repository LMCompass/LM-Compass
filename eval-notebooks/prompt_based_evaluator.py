from evaluator import Evaluator
from dotenv import load_dotenv
import pandas as pd
import numpy as np
import asyncio
import textwrap

class PromptBasedEvaluator(Evaluator):
    def __init__(self, *model_names):
        super().__init__(*model_names)
        self.user_query_answers = None
        self.evaluation_query_answers = None





    def n_sq_scoring_query(self, user_query: str, rubric: str, answer: str):
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

    def n_sq_format_json(self, raw_data: list[dict]):
        '''
        Private method that takes a list of responses and formats it into a json list where each element is a json
        object with (ideally) the following keys:
            - model (the model that evaluated the answer)
            - response (the rational for what is scored the answer)
            - evaluated_model (the model that gave the original answer)
            - score (what the model scored teh answer)
        
        :param raw_data: The raw list of responses from querying OpenRouter
        '''
        formatted_json = []
        i = 0
        for model1 in self.model_names:
            for model2 in self.model_names:
                if model1 != model2:
                    formatted_json.append({"evaluated_model": model2})
                    formatted_json[i]["evaluating_model"] = raw_data[i]["model"]
                    extracted_json = self.extract_outermost_json(raw_data[i]["response"])
                    if "score" in extracted_json.keys():
                        formatted_json[i]["score"] = int(extracted_json["score"])
                    if "reasoning" in extracted_json.keys():
                        formatted_json[i]["reasoning"] = extracted_json["reasoning"]
                    i += 1
        return formatted_json

    def n_sq_evaluate(self, user_query: str, rubric: str):
        '''
        Does the n^2 method of prompt based evaluation and stores the results user_query_answers and evaluation_query_answers
        
        :param user_query: What the user is asking the models
        :param rubric: What the models should grade the responses to the user_query based on
        '''
        self.user_query_answers = asyncio.run(self.query_models(self.model_names, [user_query]*len(self.model_names)))
        print("Got user query answers.")

        new_models_to_use = []
        new_queries_to_use = []
        for model1 in self.model_names:
            for item in self.user_query_answers:
                model2, answer = item["model"], item["response"]
                if model1 != model2:
                    new_models_to_use.append(model1)
                    new_queries_to_use.append(self.n_sq_scoring_query(user_query, rubric, answer))

        self.evaluation_query_answers = asyncio.run(self.query_models(new_models_to_use, new_queries_to_use))
        self.evaluation_query_answers = self.n_sq_format_json(self.evaluation_query_answers)
        print("Got scoring results.")





    def n_scoring_query(self, user_query: str, rubric: str, model: str):
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

    def n_format_json(self, raw_data: list[dict]):
        '''
        Private method that takes a list of responses and formats it into a json list where each element is a json
        object with (ideally) the following keys:
            - model (the model that evaluated the answer)
            - response (the rational for what is scored the answer)
            - evaluated_model (the model that gave the original answer)
            - score (what the model scored teh answer)
        
        :param raw_data: The raw list of responses from querying OpenRouter
        '''
        formatted_json = []
        i = 0
        for item1 in raw_data:
            extracted_json = self.extract_outermost_json(item1["response"])
            for item2 in extracted_json:
                formatted_json.append({"evaluating_model": item1["model"]})
                if extracted_json is not None and "evaluated_model" in item2.keys():
                    formatted_json[i]["evaluated_model"] = item2["evaluated_model"]
                if extracted_json is not None and "score" in item2.keys():
                    formatted_json[i]["score"] = int(item2["score"])
                if extracted_json is not None and "reasoning" in item2.keys():
                    formatted_json[i]["reasoning"] = item2["reasoning"]
                i += 1
        return formatted_json

    def n_evaluate(self, user_query: str, rubric: str):
        '''
        Does the n method of prompt based evaluation and stores the results user_query_answers and evaluation_query_answers
        
        :param user_query: What the user is asking the models
        :param rubric: What the models should grade the responses to the user_query based on
        '''
        self.user_query_answers = asyncio.run(self.query_models(self.model_names, [user_query]*len(self.model_names)))
        print("Got user query answers.")

        new_queries_to_use = []
        for model in self.model_names:
            new_queries_to_use.append(self.n_scoring_query(user_query, rubric, model))
        self.evaluation_query_answers = asyncio.run(self.query_models(self.model_names, new_queries_to_use))
        self.evaluation_query_answers = self.n_format_json(self.evaluation_query_answers)
        print("Got scoring results.")





    def score_table(self):
        '''
        Generated a pandas dataframe from the stored evaluation_query_answers data (which must exist for method to work)
        '''
        scores_table = pd.DataFrame(
            np.nan,
            index=pd.Index(self.model_names, name="Judge Model (Row)"),
            columns=pd.Index(self.model_names, name="Evaluated Model (Column)")
        )
        for item in self.evaluation_query_answers:
            model1 = item["evaluating_model"]
            model2 = item["evaluated_model"]
            if "score" in item.keys():
                scores_table.loc[model1, model2] = item["score"]
        return scores_table