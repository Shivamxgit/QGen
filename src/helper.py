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
from dotenv import load_dotenv
from src.prompt import *

# GEMINI AUTHENTICATION
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
os.environ["GOOGLE_API_KEY"] = api_key


def file_processing(file_path):

    #Load data from PDF

    loader = PyPDFLoader(file_path)
    data= loader.load()
    print(data[2].page_content[:300])

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


    
