from langchain_community.document_loaders import PyPDFLoader
from langchain_community.docstore.document import Document
from langchain_text_splitters import TokenTextSplitter
from google import genai
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_classic.chains.summarize import load_summarize_chain
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_classic.chains import RetrievalQA
import os
import re
import math
from itertools import zip_longest
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from dotenv import load_dotenv
from src.prompt import *

# GEMINI AUTHENTICATION
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
os.environ["GOOGLE_API_KEY"] = api_key


# =====================================================================
# NEW FAST PIPELINE (used from Step 2 onwards)
# =====================================================================
MODEL_NAME = "gemini-3.5-flash-lite"
MAX_CHUNKS = 6      # max text chunks used for question generation
MAX_WORKERS = 4     # parallel LLM calls (lower to 2 if you see 429 rate-limit errors)

QTYPE_MAP = {
    "mixed": "a mix of factual, conceptual and application-based questions",
    "mcq": "multiple-choice questions; write each question on ONE line followed by its four options inline like (A) ... (B) ... (C) ... (D) ...",
    "short": "short-answer questions that can be answered in 1-3 sentences",
    "tf": "True/False statements; write each on one line as 'True or False: <statement>?'",
}

ANSWER_PROMPT = """Answer the question using ONLY the context below.
If the context does not contain the answer, reply exactly: Not found in the document.
If the question is multiple-choice, state the correct option and a one-line reason.
If it is True/False, state True or False and a one-line reason.
Otherwise answer clearly in 2-5 sentences.

Context:
{context}

Question: {question}

Answer:"""

_embeddings = None
_stores = {}   # cache: pdf path -> FAISS index


def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-base-en-v1.5")
    return _embeddings


def get_llm():
    return ChatGoogleGenerativeAI(
        model=MODEL_NAME,
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        temperature=0.3,
    )


def text_of(resp):
    c = resp.content
    if isinstance(c, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)
    return c


def clear_store(file_path):
    _stores.pop(file_path, None)


def load_pages(file_path):
    return PyPDFLoader(file_path).load()


def get_store(file_path):
    """Build the FAISS index once per PDF, then reuse it."""
    if file_path not in _stores:
        pages = load_pages(file_path)
        splitter = TokenTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_documents(pages)   # keeps page numbers in metadata
        _stores[file_path] = FAISS.from_documents(chunks, get_embeddings())
    return _stores[file_path]


def get_question_chunks(file_path):
    pages = load_pages(file_path)
    full_text = "\n".join(p.page_content for p in pages)
    splitter = TokenTextSplitter(chunk_size=10000, chunk_overlap=200)
    chunks = splitter.split_text(full_text)
    if len(chunks) > MAX_CHUNKS:   # sample evenly across the document
        step = len(chunks) / MAX_CHUNKS
        chunks = [chunks[int(i * step)] for i in range(MAX_CHUNKS)]
    return chunks


def parse_questions(raw):
    out = []
    for line in raw.split("\n"):
        m = re.match(r"^\s*\d+[\.\)]\s+(.*)$", line)
        if m and m.group(1).strip():
            out.append(m.group(1).strip())
    if not out:
        out = [l.strip() for l in raw.split("\n") if l.strip().endswith(("?", "."))]
    return out


def generate_questions(chunks, num_questions, difficulty, q_type):
    if not chunks:
        return []
    per_chunk = max(2, math.ceil(num_questions / len(chunks)) + 1)
    template = (prompt_template
                .replace("__NUM__", str(per_chunk))
                .replace("__DIFFICULTY__", difficulty)
                .replace("__QTYPE__", QTYPE_MAP.get(q_type, QTYPE_MAP["mixed"])))
    chain = PromptTemplate.from_template(template) | get_llm()

    def run(chunk):
        return parse_questions(text_of(chain.invoke({"text": chunk})))

    with ThreadPoolExecutor(MAX_WORKERS) as ex:
        results = list(ex.map(run, chunks))

    # interleave chunks so questions cover the whole document, drop duplicates
    seen, merged = set(), []
    for group in zip_longest(*results):
        for q in group:
            if q and q.lower() not in seen:
                seen.add(q.lower())
                merged.append(q)
    return merged[:num_questions]


def grounding_score(answer, docs):
    emb = get_embeddings()
    a = np.array(emb.embed_query(answer))
    d = np.array(emb.embed_documents([x.page_content for x in docs]))
    sims = (d @ a) / (np.linalg.norm(d, axis=1) * np.linalg.norm(a) + 1e-9)
    return int(max(0, min(100, round(float(sims.max()) * 100))))


def answer_one(question, store, llm):
    docs = store.similarity_search(question, k=4)
    context = "\n\n".join(d.page_content for d in docs)
    answer = text_of(llm.invoke(ANSWER_PROMPT.format(context=context, question=question))).strip()
    pages = sorted({int(d.metadata.get("page", 0)) + 1 for d in docs})
    return {
        "question": question,
        "answer": answer,
        "pages": pages,
        "grounding": grounding_score(answer, docs),
    }


def generate_qa(file_path, num_questions=10, difficulty="medium", q_type="mixed"):
    chunks = get_question_chunks(file_path)

    # build the FAISS index while the LLM is generating questions
    with ThreadPoolExecutor(1) as ex:
        store_future = ex.submit(get_store, file_path)
        questions = generate_questions(chunks, num_questions, difficulty, q_type)
        store = store_future.result()

    if not questions:
        return []

    llm = get_llm()
    with ThreadPoolExecutor(MAX_WORKERS) as ex:
        return list(ex.map(lambda q: answer_one(q, store, llm), questions))


def ask_pdf(file_path, question):
    return answer_one(question, get_store(file_path), get_llm())


# =====================================================================
# OLD PIPELINE (kept so the current app.py keeps working until Step 2)
# =====================================================================
def file_processing(file_path):

    #Load data from PDF

    loader = PyPDFLoader(file_path)
    data= loader.load()

    question_gen = ""

    for pages in data:
        question_gen += pages.page_content

    splitter_ques_gen = TokenTextSplitter(
        chunk_size=10000,   # adjust depending on how big you want chunks
        chunk_overlap=200
)

    chunk_ques_gen = splitter_ques_gen.split_text(question_gen)

    doc_ques_gen = [Document(page_content = t) for t in chunk_ques_gen]

    splitter_ans_gen = TokenTextSplitter(
        chunk_size=1000,   # adjust depending on how big you want chunks
        chunk_overlap=100
)
    doc_ans_gen = splitter_ans_gen.split_documents(
        doc_ques_gen
)

    return doc_ques_gen, doc_ans_gen


def llm_pipeline(file_path):

    doc_ques_gen, doc_ans_gen =file_processing(file_path)

    llm_ques_gen_pipeline = ChatGoogleGenerativeAI(
        model="gemini-3.5-flash-lite",
        temperature=0.3
)


    PROMPT_QUESTIONS = PromptTemplate(template= prompt_template, input = ["text"])

    REFINE_PROMPT_QUESTIONS = PromptTemplate(
    input_variables = ['existing_answer', "text"],
    template = refine_template,
)
    ques_gen_chain = load_summarize_chain(llm= llm_ques_gen_pipeline,
                                      chain_type = "refine",
                                      verbose = True,
                                      question_prompt = PROMPT_QUESTIONS,
                                      refine_prompt = REFINE_PROMPT_QUESTIONS
                                      )

    ques = ques_gen_chain.run(doc_ques_gen)
    embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-base-en-v1.5"
)
    vector_store = FAISS.from_documents(
    doc_ans_gen,
    embeddings
)
    llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.3,
)

    ques_list = ques.split("\n")
    filtered_ques_list = [element for element in ques_list if element.endswith('?') or element.endswith('.')]

    answer_generation_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vector_store.as_retriever()
)

    return  answer_generation_chain, filtered_ques_list


# Load the embedding model once when the server starts (safe: app still starts if this fails)
try:
    get_embeddings()
except Exception as e:
    print("Embedding warm-up skipped:", e)