from dotenv import load_dotenv
from openai import AsyncOpenAI
import os
import asyncio
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
            {"name": "AllenAI: Molmo2 8B (free)", "openrouter": "allenai/molmo-2-8b:free"},
            {"name": "StepFun: Step 3.5 Flash (free)", "openrouter": "stepfun/step-3.5-flash:free"}
        ]

        self.model_names = model_names



    async def query_model(self, model_name: str, query: str, role="user"):
        '''
        Queries a single model using the models in 'candidate_models'

        :param model_name: The name of the model (from candidate_models "name" field)
        '''
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
        '''
        Queries multiple models asynchronously

        :param model_names: List of model names (from candidate_models "name" field)
        '''
        coroutines = [self.query_model(model_names[i], queries[i], role=role) for i in range(len(model_names))]
        results = await asyncio.gather(*coroutines)
        return results



    def extract_outermost_json(self, text: str):
        '''
        Extracts the first outermost JSON value (object or array) from arbitrary text.
        
        :param text: The text to extract JSON from
        '''
        if not text:
            return None

        # Strip markdown code fences (``` or ```json)
        s = text.strip()
        if s.startswith("```"):
            lines = s.splitlines()
            s = "\n".join(line for line in lines if not line.strip().startswith("```")).strip()

        start = None
        stack = []  # holds '{' or '['
        in_string = False
        escape = False

        pairs = {"{": "}", "[": "]"}

        for i, ch in enumerate(s):
            if escape:
                escape = False
                continue

            if ch == "\\":
                escape = True
                continue

            if ch == '"':
                in_string = not in_string
                continue

            if in_string:
                continue

            if ch in "{[":
                if not stack:
                    start = i
                stack.append(ch)

            elif ch in "}]":
                if not stack:
                    continue
                opener = stack[-1]
                if pairs[opener] == ch:
                    stack.pop()
                    if not stack and start is not None:
                        candidate = s[start:i + 1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            # if this block isn't valid JSON, keep scanning
                            start = None
                            continue
                else:
                    # mismatched bracket; reset search
                    stack.clear()
                    start = None

        return None
