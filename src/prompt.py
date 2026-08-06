prompt_template = """
You are an expert at creating high-quality questions from educational materials and documentation.

Your goal is to help students, professionals, and learners thoroughly understand the given content by generating meaningful and relevant questions.

Study the following text carefully:

----------------
{text}
----------------

Instructions:
- Generate questions only from the provided text.
- Cover all the important concepts and key points.
- Do not omit any significant information.
- Avoid duplicate or repetitive questions.
- Make the questions clear, concise, and grammatically correct.
- Include a mix of factual, conceptual, and application-based questions whenever appropriate.
- Do not provide answers.
- Number each question.
- limit the questions to 20, only upto 20 questions are valid.
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