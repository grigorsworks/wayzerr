#!/bin/sh
# Downloads what Wayzerr needs for voice typing and does not keep in this repository:
#  - the small Whisper speech-to-text model (about 77 MB) into src/stt/models
#  - the Transformers.js library file src/stt/transformers.min.js (Apache-2.0, version 4.3.0, checked against a known checksum)
# It comes from https://huggingface.co/Xenova/whisper-base (a conversion of OpenAI's Whisper, MIT licensed).
set -e
cd "$(dirname "$0")/.."
BASE="https://huggingface.co/Xenova/whisper-base/resolve/main"
OUT="src/stt/models/Xenova/whisper-base"
mkdir -p "$OUT/onnx"
for f in added_tokens.json tokenizer_config.json special_tokens_map.json config.json tokenizer.json generation_config.json normalizer.json merges.txt vocab.json preprocessor_config.json onnx/encoder_model_quantized.onnx onnx/decoder_model_merged_quantized.onnx; do
  [ -f "$OUT/$f" ] || { echo "downloading $f"; curl -fL --retry 3 -o "$OUT/$f" "$BASE/$f"; }
done
LIB="src/stt/transformers.min.js"
if [ ! -f "$LIB" ]; then
  echo "downloading transformers.min.js"
  curl -fL --retry 3 -o "$LIB" "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js"
fi
GOT=$(shasum -a 256 "$LIB" | cut -d' ' -f1)
[ "$GOT" = "1475fd440e9932ab206682ee42cb18f6097403e9ee77ea62084c592d0f83597d" ] || { echo "transformers.min.js does not match the expected checksum"; rm -f "$LIB"; exit 1; }
echo "done: $OUT"
