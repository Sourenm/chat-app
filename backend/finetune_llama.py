import argparse, os
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM, AutoTokenizer, DataCollatorForLanguageModeling,
    Trainer, TrainingArguments
)
from peft import get_peft_model, LoraConfig, TaskType

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base_model", required=True)
    p.add_argument("--train_file", required=True)
    p.add_argument("--output_dir", required=True)               # e.g., ./adapters/alpaca_tune
    p.add_argument("--num_epochs", type=int, default=3)
    p.add_argument("--learning_rate", type=float, default=2e-4)
    p.add_argument("--lora_r", type=int, default=16)
    p.add_argument("--lora_alpha", type=int, default=32)
    p.add_argument("--lora_dropout", type=float, default=0.05)
    args = p.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print("🚀 Loading base + tokenizer")
    tok = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    tok.pad_token = tok.eos_token

    base = AutoModelForCausalLM.from_pretrained(args.base_model)

    print("🪄 Applying LoRA")
    peft_cfg = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"]  # safe default for LLaMA-like
    )
    model = get_peft_model(base, peft_cfg)

    print("📚 Loading dataset")
    ds = load_dataset("json", data_files=args.train_file)["train"]

    def tok_fn(ex):
        return tok(ex["text"], truncation=True, max_length=2048)

    ds_tok = ds.map(tok_fn, batched=True, remove_columns=ds.column_names)
    collator = DataCollatorForLanguageModeling(tokenizer=tok, mlm=False)

    print("⚙️ Training")
    targs = TrainingArguments(
        output_dir=args.output_dir,           # checkpoints -> same folder
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        num_train_epochs=args.num_epochs,
        learning_rate=args.learning_rate,
        logging_steps=10,
        save_steps=500,
        save_total_limit=2,
        report_to=["tensorboard"],
        fp16=False
    )

    trainer = Trainer(model=model, args=targs, train_dataset=ds_tok, data_collator=collator)
    trainer.train()

    print(f"💾 Saving adapter to: {args.output_dir}")
    # IMPORTANT: save the PEFT adapter (this writes adapter_config.json + weights)
    model.save_pretrained(args.output_dir)
    tok.save_pretrained(args.output_dir)

    print("✅ Done")

if __name__ == "__main__":
    main()
