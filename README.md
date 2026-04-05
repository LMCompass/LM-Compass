# LM Compass

## Overview

**LM Compass** is an evaluation platform for Large Language Models (LLMs) and Small Language Models (SLMs). 

### Objective
To provide an objective, research-backed framework for evaluating AI model responses. LM Compass allows researchers and developers to find the most accurate and context-aware models for their specific data or queries.

### Purpose
The project addresses the challenge of AI response accuracy and bias. Using the **LLM-as-a-Judge** methodology, models cross-evaluate each other to create a consensus-driven ranking, providing users with a quantifiable measure of performance that eliminates single-model bias.

---

## Project Structure

The project is divided into two main components:

- **Web Application (`lm-compass/`)**: Our full-stack application built with Next.js and TypeScript. This is the primary interface for users to chat, run experiments, manage rubrics, and view results.
- **Evaluation Notebooks (`eval-notebooks/`)**: A Python code used for prototyping and testing various "LLM-as-a-Judge" strategies and algorithms which we applied to our web application. These were also used to perform experiments on standalone models.

---

## Deliverables

Deliverables can be found at the following links:

- [**Software Requirements Specification (SRS)**](./deliverables/srs_team_7.pdf)
- [**Design & V&V Document**](./deliverables/Design-V&V-Document_team_7.pdf)
- [**CS-Group 7 Poster**](./deliverables/CS-%20Group%207.pdf)
- [**Final Demo Video**](https://www.macvideo.ca/media/1_1vfv9d3j)
- [**Final Reflection**](./deliverables/Group_7_Reflection.pdf)

---

## Core Features

- **Multi-Model Comparison**: Query multiple LLMs simultaneously via OpenRouter (OpenAI, Anthropic, Google, Meta, etc.).
- **LLM-as-a-Judge**: Automated cross-evaluation where models assess each other's responses.
- **Custom Rubric Management**: Define specific evaluation criteria for any domain or use case.
- **Human Intervention**: Provide manual override tools and feedback loops for tie scenarios or nonconsensus results.
- **Large-Scale Batch Experiments**: Upload datasets for scaled model performance analysis.
- **Exportable Reports**: Generate detailed PDF reports of experiment findings.

---

## TA Access & Testing

The application is deployed and ready for evaluation.

### How to use
- Visit [lm-compass.com](https://lm-compass.com)
- Click on `Sign In` or `Get Started` and enter the following **Test Credentials**:
    - **Username**: `lmcompass_demo`
    - **Password**: `LM_Compass_Demo2026`

Once signed in, you are ready to access the full suite of features including Chat, Experiments, and Rubric Management. This test account is already configured with an API key.

---

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion.
- **Backend & Auth**: Supabase (Database), Clerk (Authentication).
- **AI Integration**: OpenRouter API, OpenAI SDK.
- **Testing**: Playwright (E2E), Vitest (Unit).
- **Design**: Radix UI, Lucide Icons, KaTeX.

---

Developed by **Group 7**: Sohaib Ahmed, Aryan Suvarna, Aadi Sanghani, Gulkaran Singh, Madhav Kalia, Owen Jackson & Rochan Muralitharan under supervision of Dr. Angela Zavaleta Bernuy
