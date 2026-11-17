prompt_template = """
You are an expert at creating high-quality questions from educational materials and documentation.

Your goal is to help students, professionals, and learners thoroughly understand the given content by generating meaningful and relevant questions.

Study the following text carefully:

----------------
{text}
----------------

Instructions:
- Generate questions only from the provided text.
- Create exactly __NUM__ questions (no more).
- Prioritize the most important concepts and key points to fit within this limit.
- Difficulty level: __DIFFICULTY__.
- Question type: __QTYPE__.
- Avoid duplicate or repetitive questions.
- Make the questions clear, concise, and grammatically correct.
- Do not provide answers.
- Number each question (e.g., 1. , 2. , 3. ).
- Write each question on a single line.
- OUTPUT FORMAT: Output ONLY the numbered questions. Do not include any introductory text, concluding remarks, or conversational filler.

QUESTIONS:
"""

refine_template = """
You are an expert at creating high-quality practice questions from educational material and documentation.

Your goal is to help students and learners prepare for exams, interviews, and assessments.

We have already generated some practice questions to a certain extent:
{existing_answer}

You now have the opportunity to refine the existing questions or add new ones using the additional context provided below.

----------------
{text}
----------------

Given the new context:
- Refine the existing questions if necessary.
- Add new questions for any important concepts that are not already covered.
- Do not remove good existing questions.
- Avoid duplicate or repetitive questions.
- Make sure no important information is missed.
- Generate questions only from the provided context.
- Do not provide answers.
- If the additional context does not introduce any new information, return the original questions unchanged.


QUESTIONS:
"""