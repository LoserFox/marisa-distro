#!/usr/bin/env python3
"""生成 README 预览 gif：按 manifest 的 playback 把每个状态的 sheet 帧合成动画预览。

输出：docs/preview/<状态>.gif（透明背景，帧序按播放模式——loop 循环 / pingpong 往返 /
once 保持末帧 / blink 常态帧0+一次动作）。帧数受控（每状态约 12 帧，体积小）。
依赖：Pillow + numpy（与 scripts/slice-sheet.py 同款）。
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, '.dsh-plugin', 'assets', 'manifest.json')
CHAR_DIR = os.path.join(ROOT, '.dsh-plugin', 'assets', 'characters', 'whale-girl')
OUT_DIR = os.path.join(ROOT, 'docs', 'preview')

# 每状态输出帧数上限（控制 gif 体积）；once 保持末帧的帧数。
MAX_FRAMES = 8
HOLD_FRAMES = 3
PREVIEW_SCALE = 0.5  # 256px → 128px（README 表格预览尺寸）  # once 末帧停留 / blink 常态帧0停留


def frame_sequence(frames, playback):
    """按播放模式排帧序（0-based）。"""
    if frames == 1:
        return [0]
    if playback == 'pingpong':
        seq = list(range(frames)) + list(range(frames - 2, 0, -1))
        return seq
    if playback == 'once':
        return list(range(frames)) + [frames - 1] * HOLD_FRAMES
    if playback == 'blink':
        # 常态帧0停留 + 一次动作 0→1→…→N-1→0
        return [0] * HOLD_FRAMES + list(range(1, frames)) + [0]
    # loop：循环到 MAX_FRAMES
    return [i % frames for i in range(MAX_FRAMES)]


def main():
    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)
    states = manifest['characters']['whale-girl']['states']
    os.makedirs(OUT_DIR, exist_ok=True)
    previews = {}
    for name, cfg in sorted(states.items()):
        sheet_path = os.path.join(CHAR_DIR, cfg['sheet'])
        if not os.path.exists(sheet_path):
            print(f'[skip] {name}: {cfg["sheet"]} 缺失', file=sys.stderr)
            continue
        sheet = Image.open(sheet_path)
        fw = sheet.width // cfg['frames']
        seq = frame_sequence(cfg['frames'], cfg['playback'])
        duration = max(60, int(1000 / cfg['fps']))
        # GIF 透明是 1-bit（半透明/透明像素量化后出黑边/黑底）——预览统一白底，
        # RGBA 帧先合成到白底再存 GIF（README 表格在深浅主题下都干净）。
        frames = []
        for idx in seq:
            f = sheet.crop((fw * idx, 0, fw * (idx + 1), sheet.height)).convert('RGBA')
            bg = Image.new('RGBA', f.size, (255, 255, 255, 255))
            frames.append(Image.alpha_composite(bg, f).convert('RGB').resize((int(f.width * PREVIEW_SCALE), int(f.height * PREVIEW_SCALE)), Image.LANCZOS))
        out = os.path.join(OUT_DIR, f'{name}.gif')
        frames[0].save(out, save_all=True, append_images=frames[1:], duration=duration, loop=0, disposal=2)
        previews[name] = out
        print(f'[ok] {name}: {len(seq)} 帧 @ {duration}ms -> {os.path.basename(out)}')
    # 输出 README 表格用的状态清单
    print('\nPREVIEWS=' + ','.join(previews))


if __name__ == '__main__':
    main()
