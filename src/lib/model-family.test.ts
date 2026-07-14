import { describe, it, expect } from "vitest";
import { modelFamily, modelFamilyLabel } from "@/lib/model-family";

describe("modelFamily", () => {
  it("maps the agent labels that actually appear in data/", () => {
    expect(modelFamily("groq-qwen-3-32b/qwen/qwen3-32b")).toBe("qwen");
    expect(modelFamily("groq-llama-3.3-70b/meta-llama/llama-3.3-70b-versatile")).toBe("llama");
    expect(modelFamily("claude-opus-4-7")).toBe("claude");
    expect(modelFamily("openai/gpt-oss-120b")).toBe("gpt-oss");
  });

  it("is case-insensitive", () => {
    expect(modelFamily("Qwen3-32B")).toBe("qwen");
    expect(modelFamily("META-LLAMA/Llama-4")).toBe("llama");
  });

  it("falls through to `other` rather than throwing on an unknown provider", () => {
    expect(modelFamily("some-model-nobody-has-heard-of")).toBe("other");
    expect(modelFamily("")).toBe("other");
  });

  // The module's ordering is load-bearing, not incidental: `gpt-oss` is tested
  // before the broader tokens. A label carrying both must resolve to the more
  // specific one, or a GPT-OSS run would be misattributed to another family and
  // the ensemble would look more diverse than it is.
  it("prefers the specific token when a label carries more than one", () => {
    expect(modelFamily("gpt-oss-120b-served-via-llama-stack")).toBe("gpt-oss");
  });

  it("matches deepseek and mistral", () => {
    expect(modelFamily("deepseek-ai/deepseek-r1")).toBe("deepseek");
    expect(modelFamily("mistralai/mistral-large")).toBe("mistral");
  });
});

describe("modelFamilyLabel", () => {
  it("gives every family a display label", () => {
    expect(modelFamilyLabel("qwen")).toBe("Qwen");
    expect(modelFamilyLabel("gpt-oss")).toBe("GPT-OSS");
    expect(modelFamilyLabel("deepseek")).toBe("DeepSeek");
    expect(modelFamilyLabel("other")).toBe("Other");
  });

  it("labels whatever modelFamily can return", () => {
    const labels = [
      "claude",
      "llama",
      "qwen",
      "deepseek",
      "mistral",
      "gpt-oss",
      "other",
    ] as const;
    for (const family of labels) {
      expect(modelFamilyLabel(family)).toBeTruthy();
    }
  });
});
