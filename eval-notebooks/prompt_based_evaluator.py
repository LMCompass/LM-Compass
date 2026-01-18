from evaluator import Evaluator
from dotenv import load_dotenv
from openai import AsyncOpenAI
import pandas as pd
import numpy as np
import asyncio
import textwrap

class PromptBasedEvaluator(Evaluator):
    def __init__(self, *model_names):
        super().__init__(*model_names)
        self.user_query_answers = None
        self.evaluation_query_answers = None



    def n_scoring_query(self, user_query, rubric, answer):
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

        2."score": <integer score from 0 to 100>

        Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.
        """)



    def format_json(self, raw_data):
        '''
        Private method that takes a list of responses and formats it into a json list where each element is a json
        object with (ideally) the following keys:
            - model (the model that evaluated the answer)
            - response (the rational for what is scored the answer)
            - evaluated_model (the model that gave the original answer)
            - score (what the model scored teh answer)
        
        :param raw_data: The raw list of responses from querying OpenRouter
        '''
        i = 0
        for model1 in self.model_names:
            for model2 in self.model_names:
                if model1 != model2:
                    raw_data[i]["evaluated_model"] = model2

                    extracted_json = self.extract_outermost_json(raw_data[i]["response"])
                    if extracted_json is not None and "score" in extracted_json.keys():
                        raw_data[i]["score"] = int(extracted_json["score"])
                    
                    i += 1
        return raw_data



    def n_evaluate(self, user_query, rubric):
        '''
        Does the n method of prompt based evaluation and stores the results user_query_answers and evaluation_query_answers
        
        :param user_query: What the user is asking the models
        :param rubric: What the models should grade the responses to the user_query based on
        '''
        self.user_query_answers = asyncio.run(self.query_models(self.model_names, [user_query]*len(self.model_names)))
        print("Got user query answers.")

        new_models_to_use = []
        new_queries_to_use = []
        models_being_evaluated = []
        for model1 in self.model_names:
            for item in self.user_query_answers:
                model2, answer = item["model"], item["response"]
                if model1 != model2:
                    new_models_to_use.append(model1)
                    new_queries_to_use.append(self.n_scoring_query(user_query, rubric, answer))
                    models_being_evaluated.append(model2)

        self.evaluation_query_answers = asyncio.run(self.query_models(new_models_to_use, new_queries_to_use))
        self.evaluation_query_answers = self.format_json(self.evaluation_query_answers)
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
        i = 0
        for model1 in self.model_names:
            for model2 in self.model_names:
                if model1 != model2:
                    if "score" in self.evaluation_query_answers[i].keys():
                        scores_table.loc[model1, model2] = self.evaluation_query_answers[i]["score"]
                    i += 1
        return scores_table