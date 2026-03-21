from evaluator import Evaluator
import asyncio
import pandas as pd

csv = pd.read_csv("first-5-of-each-category.csv").head(3)

models = [
    "Anthropic: Claude Sonnet 4.5",
    "OpenAI: GPT-4o",
    "OpenAI: GPT-4o Mini",
    "DeepSeek: DeepSeek V3.2"
]

with open("output.txt", "w", encoding="utf-8") as fh:
    for index, row in csv.iterrows():
        eval = Evaluator(*models)
        result = asyncio.run(eval.query_models(models, [row["question"]]*len(models)))
        
        fh.write(f"Question: {repr(row['question'])}\n")
        for response in result:
            fh.write(f"    Model: {repr(response['model'])}\n")
            fh.write(f"        Response: {repr(response['response'])}\n")