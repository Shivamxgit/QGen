from fastapi import FastAPI, Form, Request, Response, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
import uvicorn
import os
import time
import json
import csv
import aiofiles
from src.helper import generate_qa, ask_pdf, clear_store

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def check_pdf_path(p):
    if not p.replace("\\", "/").startswith("static/docs/") or ".." in p:
        raise HTTPException(status_code=400, detail="Invalid file path.")


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {})


@app.post("/upload")
async def upload(pdf_file: bytes = File(), filename: str = Form(...)):
    base_folder = "static/docs/"
    os.makedirs(base_folder, exist_ok=True)
    pdf_filename = os.path.join(base_folder, os.path.basename(filename))
    async with aiofiles.open(pdf_filename, "wb") as f:
        await f.write(pdf_file)
    clear_store(pdf_filename)   # drop any cached index for an older file with the same name
    return Response(jsonable_encoder(json.dumps({"msg": "Success!", "pdf_filename": pdf_filename})))


def get_csv(file_path, num_questions, difficulty, q_type):
    rows = generate_qa(file_path, num_questions, difficulty, q_type)
    os.makedirs("static/output", exist_ok=True)
    output_file = "static/output/QA.csv"
    with open(output_file, "w", newline="", encoding="utf-8") as csvfile:
        w = csv.writer(csvfile)
        w.writerow(["Question", "Answer", "Source", "Grounding"])
        for r in rows:
            w.writerow([r["question"], r["answer"],
                        ", ".join(str(p) for p in r["pages"]), r["grounding"]])
    return output_file


@app.post("/analyze")
def analyze(
    pdf_filename: str = Form(...),
    num_questions: int = Form(10),
    difficulty: str = Form("medium"),
    q_type: str = Form("mixed"),
):
    check_pdf_path(pdf_filename)
    start = time.perf_counter()
    num_questions = max(1, min(num_questions, 20))
    output_file = get_csv(pdf_filename, num_questions, difficulty, q_type)
    elapsed = round(time.perf_counter() - start, 1)
    return Response(jsonable_encoder(json.dumps({"output_file": output_file, "elapsed": elapsed})))


@app.post("/ask")
def ask(pdf_filename: str = Form(...), question: str = Form(...)):
    check_pdf_path(pdf_filename)
    question = question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Empty question.")
    r = ask_pdf(pdf_filename, question)
    return {"answer": r["answer"], "pages": r["pages"], "grounding": r["grounding"]}


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True)