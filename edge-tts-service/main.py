from fastapi import FastAPI
from fastapi.responses import FileResponse
import edge_tts
import tempfile
import os
import subprocess
import json

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
    # Подгоняем скорость под длину субтитра
    ratio = tts_duration / duration
    ratio = max(0.5, min(ratio, 2.0))

    output = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    output.close()

    # Только atempo — никакого adelay!
    if ratio > 1:
        # ускоряем
        cmd = [
            "ffmpeg", "-y", "-i", tmp.name,
            "-filter:a", f"atempo={ratio:.4f}",
            output.name
        ]
    else:
        # нормальная скорость + тишина до нужной длины
        cmd = [
            "ffmpeg", "-y", "-i", tmp.name,
            "-filter:a", f"apad=whole_dur={duration:.4f}",
            output.name
        ]
    subprocess.run(cmd, check=True)
    os.unlink(tmp.name)
    return FileResponse(output.name, media_type="audio/mpeg")