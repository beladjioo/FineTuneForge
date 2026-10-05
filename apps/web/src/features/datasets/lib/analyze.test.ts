import { describe, expect, it } from "vitest";
import { analyzeDataset } from "./analyze";
import { DATASET_LIMITS } from "./constants";
import { toJsonl } from "./samples";
import { detectPastedKind } from "./source";
import { splitLongText } from "./text-chunks";

const repeat = <T>(count: number, make: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => make(index));

const jsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n");

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe("analyzeDataset — JSONL", () => {
  it("normalizes OpenAI-style conversations", () => {
    const content = jsonl(
      repeat(12, (i) => ({
        messages: [
          { role: "system", content: "Tu es un assistant." },
          { role: "user", content: `Question ${i}` },
          { role: "assistant", content: `Réponse ${i}` },
        ],
      })),
    );
    const result = analyzeDataset({ content, fileName: "chat.jsonl" });

    expect(result.canImport).toBe(true);
    expect(result.format).toBe("chat");
    expect(result.report.recordSchema).toBe("openai_messages");
    expect(result.samples).toHaveLength(12);
    expect(result.stats?.avgMessages).toBe(3);
    expect(codes(result.report.warnings)).toContain("few_samples");
  });

  it("maps ShareGPT roles and accepts mixed-case keys", () => {
    const content = jsonl(
      repeat(10, (i) => ({
        Conversations: [
          { from: "human", value: `Salut ${i}` },
          { from: "gpt", value: `Bonjour ${i}` },
        ],
      })),
    );
    const result = analyzeDataset({ content, fileName: "data.ndjson" });

    expect(result.report.recordSchema).toBe("sharegpt");
    expect(result.samples[0]).toEqual({
      messages: [
        { role: "user", content: "Salut 0" },
        { role: "assistant", content: "Bonjour 0" },
      ],
    });
  });

  it("skips invalid lines and reports them with their line number", () => {
    const valid = repeat(10, (i) => JSON.stringify({ prompt: `p${i}`, completion: `c${i}` }));
    const content = [
      valid[0],
      "{not json",
      ...valid.slice(1),
      '{"prompt": "", "completion": "x"}',
    ].join("\n");
    const result = analyzeDataset({ content, fileName: "pc.jsonl" });

    expect(result.canImport).toBe(true);
    expect(result.samples).toHaveLength(10);
    expect(result.report.invalidRecords).toBe(2);
    expect(result.report.rowIssues).toEqual([
      expect.objectContaining({ row: 2, code: "invalid_json" }),
      expect.objectContaining({ row: 12, code: "missing_field" }),
    ]);
    expect(codes(result.report.warnings)).toContain("invalid_records");
  });

  it("rejects conversations without an assistant answer", () => {
    const content = jsonl([
      ...repeat(10, (i) => ({
        messages: [
          { role: "user", content: `q${i}` },
          { role: "assistant", content: `a${i}` },
        ],
      })),
      { messages: [{ role: "user", content: "seul" }] },
      { messages: [{ role: "tool", content: "x" }] },
    ]);
    const result = analyzeDataset({ content, fileName: "chat.jsonl" });

    expect(codes(result.report.rowIssues)).toEqual(["missing_assistant", "invalid_role"]);
  });

  it("warns about non-alternating conversations", () => {
    const content = jsonl(
      repeat(10, (i) => ({
        messages: [
          { role: "user", content: `q${i}` },
          { role: "user", content: "encore" },
          { role: "assistant", content: "a" },
        ],
      })),
    );
    const result = analyzeDataset({ content, fileName: "chat.jsonl" });
    expect(result.canImport).toBe(true);
    expect(codes(result.report.warnings)).toContain("chat_not_alternating");
  });

  it("removes exact duplicates", () => {
    const content = jsonl([
      ...repeat(10, (i) => ({ text: `exemple ${i}` })),
      { text: "exemple 0" },
      { text: "exemple 1" },
    ]);
    const result = analyzeDataset({ content, fileName: "t.jsonl" });

    expect(result.samples).toHaveLength(10);
    expect(result.report.duplicatesRemoved).toBe(2);
  });

  it("blocks datasets below the minimum sample count", () => {
    const content = jsonl(repeat(3, (i) => ({ text: `t${i}` })));
    const result = analyzeDataset({ content, fileName: "t.jsonl" });

    expect(result.canImport).toBe(false);
    expect(codes(result.report.fatalErrors)).toEqual(["too_few_samples"]);
  });

  it("blocks files whose fields are not recognized", () => {
    const content = jsonl(repeat(20, () => ({ foo: "a", bar: "b" })));
    const result = analyzeDataset({ content, fileName: "x.jsonl" });

    expect(result.canImport).toBe(false);
    expect(result.report.fatalErrors[0]?.code).toBe("unknown_schema");
    expect(result.report.fatalErrors[0]?.message).toContain("foo, bar");
  });
});

describe("analyzeDataset — JSON", () => {
  it("supports Alpaca with optional input", () => {
    const rows = repeat(10, (i) => ({
      instruction: `Traduis ${i}`,
      input: i % 2 === 0 ? "hello" : "",
      output: "bonjour",
    }));
    const result = analyzeDataset({ content: JSON.stringify(rows), fileName: "alpaca.json" });

    expect(result.report.recordSchema).toBe("alpaca");
    expect(result.samples[0]).toEqual({ prompt: "Traduis 0\n\nhello", completion: "bonjour" });
    expect(result.samples[1]).toEqual({ prompt: "Traduis 1", completion: "bonjour" });
  });

  it("requires a top-level array", () => {
    const result = analyzeDataset({ content: '{"text": "a"}', fileName: "x.json" });
    expect(codes(result.report.fatalErrors)).toEqual(["json_not_array"]);
  });
});

describe("analyzeDataset — CSV", () => {
  it("detects semicolon-delimited files and question/answer columns", () => {
    const content = [
      "Question;Answer",
      ...repeat(10, (i) => `Quelle est la capitale n°${i} ?;"Paris; évidemment"`),
    ].join("\n");
    const result = analyzeDataset({ content, fileName: "faq.csv" });

    expect(result.canImport).toBe(true);
    expect(result.report.recordSchema).toBe("question_answer");
    expect(result.samples[0]).toEqual({
      prompt: "Quelle est la capitale n°0 ?",
      completion: "Paris; évidemment",
    });
  });

  it("reports rows with a wrong number of columns", () => {
    const content = ["prompt,completion", ...repeat(10, (i) => `p${i},c${i}`), "a,b,c"].join("\n");
    const result = analyzeDataset({ content, fileName: "data.csv" });

    expect(result.samples).toHaveLength(10);
    expect(result.report.rowIssues).toEqual([
      expect.objectContaining({ row: 12, code: "invalid_csv_row" }),
    ]);
  });

  it("explains which columns are accepted", () => {
    const content = ["nom,age", "a,1"].join("\n");
    const result = analyzeDataset({ content, fileName: "people.csv" });
    expect(result.report.fatalErrors[0]?.message).toMatch(/Colonnes non reconnues.*nom, age/);
  });
});

describe("analyzeDataset — plain text", () => {
  it("creates one sample per paragraph", () => {
    const content = repeat(12, (i) => `Paragraphe ${i}\nsur deux lignes.`).join("\n\n\n");
    const result = analyzeDataset({ content, fileName: "notes.txt" });

    expect(result.format).toBe("text");
    expect(result.samples).toHaveLength(12);
    expect(result.samples[0]).toEqual({ text: "Paragraphe 0\nsur deux lignes." });
  });

  it("suggests blank lines when the file is a single block", () => {
    const content = repeat(50, (i) => `ligne ${i}`).join("\n");
    const result = analyzeDataset({ content, fileName: "notes.txt" });

    expect(result.canImport).toBe(false);
    expect(result.report.fatalErrors[0]?.message).toContain("ligne vide");
  });

  it("splits very long paragraphs", () => {
    const longParagraph = "Une phrase assez longue pour le test. ".repeat(400);
    const content = [longParagraph, ...repeat(10, (i) => `court ${i}`)].join("\n\n");
    const result = analyzeDataset({ content, fileName: "doc.md" });

    expect(result.samples.length).toBeGreaterThan(11);
    expect(codes(result.report.warnings)).toContain("long_paragraphs_split");
    for (const sample of result.samples) {
      expect("text" in sample && sample.text.length).toBeLessThanOrEqual(
        DATASET_LIMITS.textChunkChars,
      );
    }
  });

  it("strips the UTF-8 BOM and rejects binary content", () => {
    expect(analyzeDataset({ content: "﻿", fileName: "a.txt" }).report.fatalErrors[0]?.code).toBe(
      "empty_file",
    );
    expect(
      analyzeDataset({ content: "abc\u0000def", fileName: "a.txt" }).report.fatalErrors[0]?.code,
    ).toBe("binary_file");
  });
});

describe("analyzeDataset — misc", () => {
  it("rejects unsupported extensions", () => {
    const result = analyzeDataset({ content: "x", fileName: "model.bin" });
    expect(codes(result.report.fatalErrors)).toEqual(["unsupported_file_type"]);
  });
});

describe("helpers", () => {
  it("detects the kind of pasted content", () => {
    expect(detectPastedKind('{"text": "a"}\n{"text": "b"}')).toBe("jsonl");
    expect(detectPastedKind('[{"text": "a"}]')).toBe("json");
    expect(detectPastedKind("Bonjour\n\nAu revoir")).toBe("txt");
    expect(detectPastedKind("[pas du json")).toBe("txt");
  });

  it("serializes samples to JSONL", () => {
    expect(toJsonl([{ text: "a" }, { prompt: "p", completion: "c" }])).toBe(
      '{"text":"a"}\n{"prompt":"p","completion":"c"}\n',
    );
    expect(toJsonl([])).toBe("");
  });

  it("splits text on sentence boundaries before cutting words", () => {
    const chunks = splitLongText("Phrase un. Phrase deux. Phrase trois.", 25);
    expect(chunks).toEqual(["Phrase un. Phrase deux.", "Phrase trois."]);
    expect(splitLongText("x".repeat(25), 10)).toEqual([
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });
});
