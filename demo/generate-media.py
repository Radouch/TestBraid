#!/usr/bin/env python3
"""Regenerate the demo lesson's images, videos and media metadata.

Development-only tool; release builds use the committed output and never run
it. Requires Pillow and ffmpeg. The media are simple synthetic shapes so the
demo content carries no third-party licence.

Writes, under demo/storage/:
  media-files/<uuid>.<ext>  private originals, the layout PrivateMediaService reads
  media/<uuid>.json         metadata; sizeBytes must equal the real file size,
                            because PrivateMediaService::previewSource rejects
                            a mismatch and publication would then fail.

IDs are fixed UUIDv4 values (JsonFileRepository::validId) so that the
hand-written test JSON files keep pointing at the same media.
"""
import json
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

STORAGE = Path(__file__).resolve().parent / 'storage'
LESSON_ID = 'e7472376-d56a-4384-ad1c-a1606dabddb7'
CREATED_AT = '2026-10-29T12:00:00Z'
SIZE = 480
BACKGROUND = (248, 249, 250)
RED, BLUE, GREEN, ORANGE = (220, 53, 69), (13, 110, 253), (25, 135, 84), (253, 126, 20)

IMAGES = {
    '0821a7ae-ef1a-4c6d-8618-13d729a27d37': ('red-circle.png', 'circle', RED),
    'f8dae869-472e-4880-bc0d-dd088106fc24': ('blue-square.png', 'square', BLUE),
    '7775be41-c799-473b-a4ae-f38fdb7120e1': ('blue-circle.png', 'circle', BLUE),
    '07a23619-a0d3-4d4d-964e-0d571b79f577': ('green-triangle.png', 'triangle', GREEN),
}
VIDEOS = {
    '89dc324e-2d9d-4627-8807-2d72d4682c0c': ('ball-left-to-right.mp4', 'slide'),
    '0c0b43d6-8550-4e43-8b67-39f62060b93a': ('ball-bouncing.mp4', 'bounce'),
}


def shape(draw: ImageDraw.ImageDraw, kind: str, colour: tuple, box: tuple) -> None:
    left, top, right, bottom = box
    if kind == 'circle':
        draw.ellipse(box, fill=colour)
    elif kind == 'square':
        draw.rectangle(box, fill=colour)
    else:
        draw.polygon([((left + right) / 2, top), (right, bottom), (left, bottom)], fill=colour)


def write_metadata(media_id: str, kind: str, name: str, path: Path) -> None:
    extension = path.suffix[1:]
    metadata = {
        'schemaVersion': 1,
        'id': media_id,
        'kind': kind,
        'mimeType': 'image/png' if extension == 'png' else 'video/mp4',
        'extension': extension,
        'sizeBytes': path.stat().st_size,
        'originalName': name,
        'createdAt': CREATED_AT,
        'groupId': LESSON_ID,
    }
    (STORAGE / 'media' / f'{media_id}.json').write_text(json.dumps(metadata, indent=4) + '\n')


def ball_position(motion: str, t: float) -> tuple:
    """Ball centre for animation progress t in [0, 1]."""
    if motion == 'slide':
        return 60 + t * (SIZE - 120), SIZE / 2
    # Two bounces starting from the top, so the first frame (the poster the
    # learner sees before pressing play) shows the ball above the controls.
    return SIZE / 2, SIZE - 60 - abs(math.cos(t * 2 * math.pi)) * (SIZE - 160)


def render_video(motion: str, target: Path) -> None:
    frames, fps = 75, 25  # three seconds
    with tempfile.TemporaryDirectory() as work:
        for index in range(frames):
            image = Image.new('RGB', (SIZE, SIZE), BACKGROUND)
            draw = ImageDraw.Draw(image)
            x, y = ball_position(motion, index / (frames - 1))
            shape(draw, 'circle', ORANGE, (x - 40, y - 40, x + 40, y + 40))
            image.save(Path(work) / f'{index:03d}.png')
        # Baseline H.264 in yuv420p plays in every current browser; faststart
        # puts the index first so playback can begin before the full download.
        subprocess.run([
            'ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(fps),
            '-i', str(Path(work) / '%03d.png'), '-c:v', 'libx264', '-profile:v', 'baseline',
            '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart',
            '-map_metadata', '-1', '-an', str(target),
        ], check=True)


def main() -> None:
    (STORAGE / 'media-files').mkdir(parents=True, exist_ok=True)
    (STORAGE / 'media').mkdir(parents=True, exist_ok=True)
    for media_id, (name, kind, colour) in IMAGES.items():
        path = STORAGE / 'media-files' / f'{media_id}.png'
        image = Image.new('RGB', (SIZE, SIZE), BACKGROUND)
        shape(ImageDraw.Draw(image), kind, colour, (90, 90, SIZE - 90, SIZE - 90))
        image.save(path, optimize=True)
        write_metadata(media_id, 'image', name, path)
    for media_id, (name, motion) in VIDEOS.items():
        path = STORAGE / 'media-files' / f'{media_id}.mp4'
        render_video(motion, path)
        write_metadata(media_id, 'video', name, path)


if __name__ == '__main__':
    main()
