# Install the official ROCm build of CTranslate2 so Faster-Whisper transcription
# runs on the RX 7900 XTX. CTranslate2 exposes the Radeon GPU under the `cuda`
# device name; transcribe() in ingest_video.py auto-selects cuda/float16 when a
# GPU is present and falls back to CPU int8 (override with ENGRAM_WHISPER_DEVICE
# / ENGRAM_WHISPER_COMPUTE_TYPE).
#
# This installs ONLY the ctranslate2 ROCm wheel. It does NOT install a separate
# ROCm SDK: the wheel links the same TheRock-style ROCm runtime that the venv's
# torch (ROCm 7.10 nightly, for MobileSAM) already ships, and
# ingest_video._enable_rocm_dll_dirs() puts that runtime on the DLL search path
# at import time. So do NOT install the repo.radeon.com rocm_sdk_* packages here
# — that would downgrade the runtime out from under torch and break GPU SAM.
# Run the README "Setup" steps (torch ROCm nightly + SAM) BEFORE this.
#
# Note: the wheel pulls a newer numpy as a dependency; verified compatible with
# torch/torchvision/opencv/mobile-sam in this venv.

param(
    [string]$Version = "4.7.2",
    [string]$VenvPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ScriptDir = $PSScriptRoot                                   # tools\video-ingest
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
if (-not $VenvPath) {
    $VenvPath = Join-Path $ProjectRoot ".venv-video-ingest"
}
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    throw "venv python not found at $VenvPython (pass -VenvPath to override)."
}

$TempDir = Join-Path $env:TEMP "engram-ctranslate2-rocm-$Version"
$ZipPath = Join-Path $TempDir "rocm-python-wheels-Windows.zip"
$ReleaseUrl = "https://github.com/OpenNMT/CTranslate2/releases/download/v$Version/rocm-python-wheels-Windows.zip"

New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
Invoke-WebRequest -Uri $ReleaseUrl -OutFile $ZipPath
Expand-Archive -LiteralPath $ZipPath -DestinationPath $TempDir -Force

$Wheel = Get-ChildItem -Path $TempDir -Recurse -Filter "ctranslate2-$Version-cp312-cp312-win_amd64.whl" |
    Select-Object -First 1
if (-not $Wheel) {
    throw "Could not find the Python 3.12 Windows CTranslate2 ROCm wheel in $ZipPath."
}

uv pip install --python $VenvPython --reinstall $Wheel.FullName

# Verify against the torch ROCm runtime already in the venv (the helper registers
# its DLL dirs; a bare `import ctranslate2` would otherwise not find them).
& $VenvPython -c "import sys; sys.path.insert(0, r'$ScriptDir'); import ingest_video as m; m._enable_rocm_dll_dirs(); import ctranslate2 as c; print('CTranslate2', c.__version__, '| GPU count', c.get_cuda_device_count(), '| cuda types', sorted(c.get_supported_compute_types('cuda')))"
