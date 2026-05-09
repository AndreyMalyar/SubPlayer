from fastapi import FastAPI
from fastapi.responses import FileResponse
import edge_tts
import tempfile
import os
import subprocess
import json
from pydub import AudioSegment
import base64

app = FastAPI()

def srt_time_to_seconds(time_str):
    h, m, s = time_str.replace(',', '.').split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

@app.post("/tts-synced")
async def tts_synced(data: dict):
    subtitles = data.get("subtitles", [])
    voice = data.get("voice", "ru-RU-SvetlanaNeural")
    sub = subtitles[0]
    start = srt_time_to_seconds(sub["start"])
    end = srt_time_to_seconds(sub["end"])
    duration = end - start

    # Генерируем аудио
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tmp.close()
    communicate = edge_tts.Communicate(sub["text"], voice)
    await communicate.save(tmp.name)

    # Получаем длину сгенерированного аудио
    probe = subprocess.run([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", tmp.name
    ], capture_output=True, text=True)
    tts_duration = float(json.loads(probe.stdout)["format"]["duration"])

    output = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    output.close()

    if tts_duration > duration:
        # ускоряем - не помещается в отрезок
        ratio = tts_duration / duration
        ratio = min(ratio, 2.0) # atempo максимум 2.0
        cmd = [
            "ffmpeg", "-y", "-i", tmp.name,
            "-filter:a", f"atempo={ratio:.4f}",
            output.name
        ]
    else:
        # нормальная скорость
        cmd = [
            "ffmpeg", "-y", "-i", tmp.name,
            "-c:a", "copy",
            output.name
        ]

    subprocess.run(cmd, check=True)
    os.unlink(tmp.name)
    return FileResponse(output.name, media_type="audio/mpeg")

@app.post("/tts-merge")
async def tts_merge(data: dict):
    chunks = data.get("chunks", [])
    total_duration_ms = data.get("total_duration_ms", 0)

    # Создаем пустую дорожку на всю длину видео
    timeline = AudioSegment.silent(duration=total_duration_ms)

    for chunk in chunks:
        audio_bytes = base64.b64decode(chunk["audio_base64"])
        start_ms = chunk["start_ms"]

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tmp.write(audio_bytes)
        tmp.close()

        audio = AudioSegment.from_mp3(tmp.name)
        timeline = timeline.overlay(audio, position=start_ms)
        os.unlink(tmp.name)

    # Сохраняем результат
    output = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    output.close()
    timeline.export(output.name, format="mp3")
    return FileResponse(output.name, media_type="audio/mpeg")