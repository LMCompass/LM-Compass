from dotenv import load_dotenv
from openai import AsyncOpenAI
import pandas as pd
import numpy as np
import os
import asyncio
import re
import json


class Evaluator:
    def __init__(self, *model_names):

        load_dotenv()

        OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
        if not OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY not found in .env file or environment variables.")
        
        self.client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY
        )

        self.candidate_models = [
            # PAID
            {"name": "Anthropic: Claude Sonnet 4.5", "openrouter": "anthropic/claude-sonnet-4.5"},
            {"name": "OpenAI: GPT-4o", "openrouter": "openai/gpt-4o"},
            {"name": "OpenAI: GPT-4o Mini", "openrouter": "openai/gpt-4o-mini"},
            # FREE
            {"name": "TNG: DeepSeek R1T2 Chimera (free)", "openrouter": "tngtech/deepseek-r1t2-chimera:free"},
            {"name": "Meta: Llama 3.3 70B Instruct (free)", "openrouter": "meta-llama/llama-3.3-70b-instruct:free"},
            {"name": "OpenAI: gpt-oss-20b (free)", "openrouter": "openai/gpt-oss-20b:free"},
            {"name": "AllenAI: Molmo2 8B (free)", "openrouter": "allenai/molmo-2-8b:free"}
        ]

        self.model_names = model_names
    


    async def query_model(self, model_name: str, query: str, role="user"):
        """
        Queries a single model using the models in 'candidate_models'
        Args:
            model_name: The name of the model (from candidate_models "name" field)
        Returns: dict with keys 'model' and 'response'
        """
        model_dict = next((m for m in self.candidate_models if m["name"] == model_name), None)
        if model_dict is None:
            return {"model": model_name, "response": f"Error: Model '{model_name}' not found in candidate_models"}
        
        try:
            response = await self.client.chat.completions.create(
                model=model_dict["openrouter"],
                messages=[{"role" : role, "content" : query}],
                temperature=1
            )
            content = response.choices[0].message.content
            return {"model": model_name, "response": content}
        except Exception as e:
            return {"model": model_name, "response": str(e)}
    
    async def query_models(self, model_names: list[str], queries: list[str], role="user"):
        """
        Queries multiple models asynchronously
        Args:
            model_names: List of model names (from candidate_models "name" field)
        """
        coroutines = [self.query_model(model_names[i], queries[i], role=role) for i in range(len(model_names))]
        results = await asyncio.gather(*coroutines)
        return results
    


    def extract_outermost_json(self, text):
        """
        Extracts the outermost JSON object from arbitrary text.
        Returns the parsed JSON (dict/list) or raises ValueError if no valid JSON found.
        """

        start = None
        depth = 0
        in_string = False
        escape = False

        for i, ch in enumerate(text):
            if escape:
                escape = False
                continue

            if ch == "\\":
                escape = True
                continue

            if ch == '"':
                in_string = not in_string
                continue

            if not in_string:
                if ch == "{":
                    if depth == 0:
                        start = i
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0 and start is not None:
                        candidate = text[start:i+1]
                        try:
                            return json.loads(candidate)
                        except Exception:
                            # continue scanning if not valid
                            pass

        return None