import os
import subprocess
import sys
from pathlib import Path

from elevenlabs.client import ElevenLabs


VOICE_MAP = {
    "red": "JBFqnCBsd6RMkjVDRZzb",
    "blue": "JBFqnCBsd6RMkjVDRZzb",
    "green": "JBFqnCBsd6RMkjVDRZzb",
    "yellow": "JBFqnCBsd6RMkjVDRZzb",
    "purple": "JBFqnCBsd6RMkjVDRZzb",
}


def load_env(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def elevenlabs_tts(
    text: str,
    agent: str = "red",
    output_path: str | None = None,
    play: bool = True,
) -> Path:
    load_env()
    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set ELEVENLABS_API_KEY in .env or your shell.")

    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or VOICE_MAP.get(agent, VOICE_MAP["red"])
    model_id = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    target = Path(output_path or f"{agent}.mp3")

    client = ElevenLabs(api_key=api_key)
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id=model_id,
    )
    with target.open("wb") as f:
        for chunk in audio:
            f.write(chunk)

    if play:
        play_mp3(target)
    return target


def play_mp3(path: Path) -> None:
    commands = [
        ["termux-media-player", "play", str(path)],
        ["termux-open", "--content-type", "audio/mpeg", str(path)],
    ]
    for command in commands:
        try:
            subprocess.Popen(command)
            return
        except FileNotFoundError:
            continue


if __name__ == "__main__":
    agent = os.environ.get("ELEVENLABS_AGENT", "red")
    text = " ".join(sys.argv[1:]).strip() or "Colour Ceauxdid online"
    out = elevenlabs_tts(text=text, agent=agent, output_path=f"{agent}.mp3")
    print(f"done: {out}")
