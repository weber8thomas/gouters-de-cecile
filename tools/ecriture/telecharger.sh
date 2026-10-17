#!/usr/bin/env bash
# Récupère les poids et données tiers (licences libres) dans vendor/ (non versionné),
# crée l'environnement Python tools/ecriture/.venv, puis convertit les poids en NumPy.
#
#   bash tools/ecriture/telecharger.sh
#
# Versions figées (commits / révisions) : le tracé est déterministe pour une graine donnée
# sur une même installation ; changer de poids change toutes les écritures.
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/../.." && pwd)"
V="$RACINE/vendor"
mkdir -p "$V"

# --- 1. environnement Python ------------------------------------------------------------
if [ ! -x "$ICI/.venv/bin/python" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv "$ICI/.venv" --python 3.13
    uv pip install --python "$ICI/.venv/bin/python" -r "$ICI/requirements.txt"
  else
    python3 -m venv "$ICI/.venv"
    "$ICI/.venv/bin/pip" install -r "$ICI/requirements.txt"
  fi
fi

sparse_clone () {  # dépôt commit dossier chemins…
  local url="$1" commit="$2" dest="$3"; shift 3
  rm -rf "$dest"
  git clone -q --filter=blob:none --no-checkout "$url" "$dest"
  git -C "$dest" sparse-checkout set --no-cone "$@"
  git -C "$dest" checkout -q "$commit"
}

# --- 2. réseau d'écriture : X-rayLaser/pytorch-handwriting-synthesis-toolkit (MIT) -------
XRAY_COMMIT=899e9432dfe0998ba2ef31582d11c2d5f24a5185
if [ ! -f "$V/xray/checkpoints/Epoch_52/model.pt" ]; then
  sparse_clone https://github.com/X-rayLaser/pytorch-handwriting-synthesis-toolkit.git \
    "$XRAY_COMMIT" "$V/xray" /LICENSE /readme.md /checkpoints/Epoch_52/
fi

# --- 3. lignes d'amorce (les « mains ») : Grzego/handwriting-generation (MIT) ------------
GRZEGO_COMMIT=26a618b647e3a0ae195f9bf84370e9d091caf5ad
if [ ! -f "$V/grzego/data/styles.pkl" ]; then
  sparse_clone https://github.com/Grzego/handwriting-generation.git \
    "$GRZEGO_COMMIT" "$V/grzego" /LICENSE /README.md /data/
fi

# --- 4. relecteur : TrOCR small handwritten (microsoft/unilm, MIT), export ONNX Xenova ---
HF_REV=2432e24d184b1d964d07ed04f5d9e21d31a59141
HF="https://huggingface.co/Xenova/trocr-small-handwritten/resolve/$HF_REV"
mkdir -p "$V/trocr"
for f in onnx/encoder_model.onnx onnx/decoder_model_quantized.onnx tokenizer.json config.json; do
  dest="$V/trocr/$(basename "$f")"
  [ -s "$dest" ] || curl -fsSL -o "$dest" "$HF/$f"
done
cat > "$V/trocr/PROVENANCE.txt" <<TXT
TrOCR small handwritten (Li et al., 2021, https://github.com/microsoft/unilm/tree/master/trocr),
licence MIT du dépôt microsoft/unilm (aucune licence séparée pour les poids).
Export ONNX : https://huggingface.co/Xenova/trocr-small-handwritten (révision $HF_REV).
Sert uniquement à relire les candidats générés (choix du plus lisible) ; rien n'est copié dans le tracé.
TXT

# --- 5. conversion en NumPy (sans PyTorch ni TensorFlow) ----------------------------------
"$ICI/.venv/bin/python" -I "$ICI/convertir_poids.py"
du -sh "$V"/xray "$V"/grzego "$V"/trocr "$V"/poids 2>/dev/null || true
echo "ok : python tools/ecriture/ecrire.py --style soignee \"Le cake citron de Julie\""
