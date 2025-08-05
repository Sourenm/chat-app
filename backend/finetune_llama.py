from transformers import Trainer, TrainingArguments, AutoModelForCausalLM, AutoTokenizer, DataCollatorForLanguageModeling
from datasets import load_dataset
from peft import get_peft_model, LoraConfig, TaskType

import argparse

print("🚀 Starting finetune_llama.py")

parser = argparse.ArgumentParser()
parser.add_argument("--base_model")
parser.add_argument("--train_file")
parser.add_argument("--output_dir")
parser.add_argument("--num_epochs", type=int)
parser.add_argument("--learning_rate", type=float)
parser.add_argument("--lora_r", type=int)
parser.add_argument("--lora_alpha", type=int)
parser.add_argument("--lora_dropout", type=float)
args = parser.parse_args()

print(f"📦 Loading base model: {args.base_model}")
model = AutoModelForCausalLM.from_pretrained(args.base_model)
tokenizer = AutoTokenizer.from_pretrained(args.base_model)
if tokenizer.pad_token is None:
    print("ℹ️ No pad_token found. Setting pad_token = eos_token")
    tokenizer.pad_token = tokenizer.eos_token

print("🔧 Applying LoRA configuration")
peft_config = LoraConfig(
    r=args.lora_r,
    lora_alpha=args.lora_alpha,
    lora_dropout=args.lora_dropout,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)
model = get_peft_model(model, peft_config)

print(f"📂 Loading dataset from: {args.train_file}")
dataset = load_dataset("json", data_files=args.train_file, split="train")

print("🪄 Tokenizing dataset...")
def tokenize_fn(example):
    return tokenizer(example["text"], truncation=True, padding="max_length")

tokenized = dataset.map(tokenize_fn, batched=True)
collator = DataCollatorForLanguageModeling(tokenizer, mlm=False)

print("🧠 Starting training loop...")
training_args = TrainingArguments(
    output_dir=args.output_dir,
    per_device_train_batch_size=4,
    num_train_epochs=args.num_epochs,
    learning_rate=args.learning_rate,
    logging_steps=10,
    save_steps=500,
    save_total_limit=2,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized,
    data_collator=collator,
)

trainer.train()

print(f"💾 Saving adapter to: {args.output_dir}")
model.save_pretrained(args.output_dir)
tokenizer.save_pretrained(args.output_dir)

print("✅ Fine-tuning complete.")
