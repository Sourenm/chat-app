# diffusion_worker.py

import asyncio
import base64
import uuid
import os

TXT2IMG_SCRIPT = "/Users/sourena/Downloads/chat-app/mlx-examples/stable_diffusion/txt2image.py"
IMG2IMG_SCRIPT = "/Users/sourena/Downloads/chat-app/mlx-examples/stable_diffusion/image2image.py"

async def generate_image(prompt: str, init_image: str | None = None) -> str:
    output_path = f"/tmp/{uuid.uuid4().hex}.png"

    if init_image:
        # Save base64 input image to temp file
        init_image_path = f"/tmp/{uuid.uuid4().hex}_input.png"
        with open(init_image_path, "wb") as f:
            header, encoded = init_image.split(",", 1)
            f.write(base64.b64decode(encoded))

        command = [
            "python", IMG2IMG_SCRIPT,
            init_image_path,
            prompt,
            "--output", output_path,
        ]
    else:
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