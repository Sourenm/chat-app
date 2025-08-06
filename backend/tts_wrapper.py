from TTS.api import TTS

# Load only once
tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False, gpu=False)

def generate_audio(text: str, path: str):
    tts.tts_to_file(text=text, file_path=path)
