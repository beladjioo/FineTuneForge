"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UsageSnippet({ repoId, baseModelId }: { repoId: string; baseModelId: string }) {
  const [copied, setCopied] = useState(false);
  const code = `# pip install transformers peft accelerate
from peft import AutoPeftModelForCausalLM
from transformers import AutoTokenizer

# Base : ${baseModelId} + votre adapter LoRA
model = AutoPeftModelForCausalLM.from_pretrained("${repoId}", device_map="auto")
tokenizer = AutoTokenizer.from_pretrained("${repoId}")

messages = [{"role": "user", "content": "Bonjour !"}]
inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt").to(model.device)
output = model.generate(inputs, max_new_tokens=200)
print(tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True))`;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-muted p-4 pr-12 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2"
        onClick={copy}
        aria-label="Copier le code"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
