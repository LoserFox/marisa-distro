# 生成提示词

封面和头像源图使用内置 `imagegen` 的 `stylized-concept` 模式生成，详情页横幅使用内置 `imagegen` 的 `illustration-story` 模式生成。最终上传文件再由 `scripts/build-wechat-submission.mjs` 做确定性的裁切、透明背景处理、缩放和压缩。

## 封面与头像源图

```text
Use case: stylized-concept
Asset type: WeChat sticker album cover source and chat icon source
Primary request: Create a clean, polished front-facing full-body character cutout of the same blue-haired whale maid girl from the reference, preserving her recognizable navy-and-white maid outfit, blue whale ears/tail motif, hair color, eye color, proportions, and cute chibi illustration style. She should smile warmly and wave with one hand. One tiny navy-blue whale companion may sit beside her feet.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; absolutely uniform, no gradient, texture, shadow, floor, reflection, or lighting variation.
Composition/framing: centered, full body fully visible, generous even padding, readable at small icon size.
Style/medium: high-quality clean anime chibi sticker illustration matching the reference.
Constraints: no text, no letters, no logo, no watermark, no frame, no white sticker outline or halo around the character, crisp dark linework, opaque subject, do not use #00ff00 anywhere in the subject.
Avoid: confetti, checkmark, speech bubble, label panel, decorative background elements, cast shadow, contact shadow, white border.
```

## 详情页与艺术家主页横幅源图

```text
Use case: illustration-story
Asset type: WeChat sticker album detail-page banner, final crop will be 750×400 landscape
Primary request: Create a polished wide anime-chibi illustration featuring the same blue-haired whale maid girl and two small navy-blue whale companions from the reference in a cozy playful debugging scene. She is seated at a small navy laptop, smiling with relief while one whale holds a tiny wrench and the other celebrates. Preserve the recognizable character design, navy-and-white maid outfit, whale ears and tail motif, blue hair, and cute proportions.
Scene/backdrop: lively ocean-blue and warm aqua workshop background with subtle bubbles, rounded UI-like shapes, soft coral accents, and clear separation from the characters. The background must be fully opaque and colorful, not white and not transparent.
Composition/framing: very wide horizontal composition; keep all important characters within the central 80% safe area, generous breathing room on both sides, no cropped heads or bodies, suitable for cropping to 750×400.
Style/medium: clean premium chibi anime illustration matching the reference.
Lighting/mood: bright, friendly, triumphant, playful.
Constraints: no text, no letters, no numbers, no logos, no watermark, no speech bubbles, no white background, no transparent background, no sticker-like white outline around characters.
Avoid: brand names, interface screenshots, dense clutter, dark gloomy mood.
```
