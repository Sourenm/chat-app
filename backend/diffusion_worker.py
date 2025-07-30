# diffusion_worker.py

import asyncio
import base64
import uuid
import os

TXT2IMG_SCRIPT = "/Users/sourena/Downloads/chat-app/mlx-examples/stable_diffusion/txt2image.py"

async def generate_image(prompt: str) -> str:
    output_path = f"/tmp/{uuid.uuid4().hex}.png"

    command = [
        "python", TXT2IMG_SCRIPT,
        prompt,
        "--output", output_path
    ]

    try:
        print(f"🚀 Running txt2image.py with prompt: {prompt}")
        print(f"🧾 Command: {' '.join(command)}")

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            print("❌ Subprocess failed:")
            print(stderr)
            raise RuntimeError(f"txt2image.py failed with code {process.returncode}: {stderr}")

        if not os.path.exists(output_path):
            raise RuntimeError("Expected output image file was not created.")

        with open(output_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"

    finally:
        if os.path.exists(output_path):
            os.remove(output_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("prompt", type=str, help="Text prompt to generate an image")
    args = parser.parse_args()

    try:
        result = generate_image(args.prompt)
        print("✅ Image generated successfully.")
        print(result[:200] + "...")  # print first 200 chars of base64
    except Exception as e:
        print("❌ Error:", str(e))
