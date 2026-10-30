# SAM 3D Body reconstruction setup — work in progress

**Status: ACCESS APPROVED; RECONSTRUCTION NOT YET VERIFIED.** The user reports that official DINOv3 access has been accepted. WSL authentication and a CUDA PyTorch operation have been verified; see the Sprint 0.3 report for download and installation progress. The CLI adapter and its tests remain preliminary until exercised with real weights, detector and an authorized photo. Do not interpret a model-estimated mesh as an exact digital twin.

## Access and source

The official checkout is `external/sam-3d-body`, commit `b5c765a0d89d789985e186d396315e7590887b94`; it is ignored by the project. Follow the [official README](https://github.com/facebookresearch/sam-3d-body) and [installation instructions](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md). The code and checkpoint are governed by the [SAM License](https://github.com/facebookresearch/sam-3d-body/blob/main/LICENSE); review the applicable terms. The official detector uses Detectron2 (Apache-2.0) and its ViTDet weights; review the [Detectron2 model zoo](https://github.com/facebookresearch/detectron2/blob/main/MODEL_ZOO.md) and associated asset terms. No upstream source was modified.

Request access to [facebook/sam-3d-body-dinov3](https://huggingface.co/facebook/sam-3d-body-dinov3). Once access is granted, authenticate locally in the AI environment with `hf auth login`; never paste a token into chat, files in this repository, or command history. Download the official snapshot into `external/checkpoints/sam-3d-body-dinov3` using `hf download facebook/sam-3d-body-dinov3 --local-dir <path>`. The adapter requires `model.ckpt`, `model_config.yaml`, and `assets/mhr_model.pt`. An HTTP 401 does not distinguish an invalid credential from an account without access; check the account and approval status.

## Environment and detector

Sprint 0.3 uses the separately installed Miniforge environment `/home/levi/miniforge3/envs/sam_3d_body`, not the older Pixi environment described below. Its Python 3.11.18, PyTorch 2.7.1+cu126 and torchvision 0.22.1+cu126 were inspected, and a CUDA tensor operation on the RTX 3060 succeeded. The official dependencies and Detectron2 remain to be verified; `services/reconstruction/constraints-sam3d-cu126.txt` contains the provisional constraints used for installation. The historical Pixi setup below is not evidence that the newer environment is complete.

The approved official checkpoint is now present at `/home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3`; `hf cache verify facebook/sam-3d-body-dinov3 --local-dir /home/levi/sam3d-lab/checkpoints/sam-3d-body-dinov3 --fail-on-missing-files` verified all five files against the official repository. The MHR TorchScript asset also loaded on CPU. Dependency installation and the separately isolated CUDA compiler setup are still in progress; neither SAM initialization nor inference has been verified. The existing CLI's `--checkpoint-dir` option must be set to this WSL directory rather than its older project-local default.

An isolated Pixi Python 3.11 environment was initiated under ignored `external/sam3d-env` in Ubuntu WSL2, using the project-local Pixi executable at `external/pixi-bin/pixi`. Installing CUDA PyTorch and the official research dependencies is not yet verified. Upstream asks for Python 3.11, PyTorch, its dependency list and Detectron2 at revision `a1ce2f9`. Use the official installation instructions rather than a CPU-only environment: the inspected estimator at this commit explicitly sends its batch to `cuda` despite the demo's apparent CPU fallback. The WSL NVIDIA driver reported an RTX 3060 Laptop GPU with 6 GiB VRAM; feasibility of the full detector plus model on this GPU is unknown. `nvcc` was not found on the WSL PATH; a compatible CUDA toolkit/compiler may be needed to build Detectron2 with GPU support. Do not install into the unrelated MHR environment.

The CLI requires the official ViTDet detector weights at `external/checkpoints/vitdet/model_final_f05665.pkl`. Their official URL is specified in the upstream `tools/build_detector.py`; obtain the file from that URL after checking its terms. A single-person detector is mandatory here: there is no silent full-image fallback. The default field-of-view estimate is used; neither SAM 3D segmentation nor MoGe is enabled. Detector accuracy, occlusion and full-body visibility cannot be guaranteed by bounding-box heuristics.

The attempted CUDA PyTorch install used `torch==2.7.1` and `torchvision==0.22.1` from `https://download.pytorch.org/whl/cu128` in that isolated environment. It was interrupted while downloading runtime wheels after the user confirmed the checkpoint request was pending; PyTorch and Detectron2 are not verified in this environment. A later WSL launch returned `HCS/ERROR_NO_SYSTEM_RESOURCES`, so the environment could not be rechecked. Treat these as selected versions, not a verified lockfile. Once access is granted and WSL starts normally, finish the install, verify `torch.cuda.is_available()` and record `pip freeze`; then follow the upstream dependency and Detectron2 installation steps and test their imports. The Pixi Python lock alone does not pin pip-installed model dependencies.

## Intended invocation

After completing the environment and downloading assets, from the project root in WSL using the isolated environment:

```bash
external/pixi-bin/pixi run --manifest-path external/sam3d-env/pixi.toml python services/reconstruction/reconstruct.py \
  --input samples/input/photo.jfif \
  --output outputs/reconstruction-person-front
```

`--checkpoint-dir` and `--detector-dir` override the default local asset locations. The output must be a new directory inside ignored `outputs/`. Inputs must be photographs the user is authorized to process. The adapter checks image decoding and minimum dimensions, requires exactly one detection and rejects a small or edge-clipped box, but those heuristics cannot prove a full body is visible. The optional MHR and detector asset paths are not hard-coded into the upstream source.

## Planned output schema

On success the adapter intends to create `metadata.json`, `reconstruction.npz`, and the official renderer's `preview.png`. This schema has **not been validated against a real inference result**. The NPZ stores finite numeric fields returned by the upstream estimator verbatim, plus `mesh_faces`; `metadata.json` lists each array's name, shape and dtype, explicitly records fields returned as `None`, and includes checkpoint SHA-256, device, GPU, PyTorch/CUDA versions, input dimensions, inference time, peak PyTorch GPU allocation, warnings and schema version. Load NPZ with `allow_pickle=False`. Source inspection indicates that the estimator can return `pred_vertices`, `shape_params`, `body_pose_params`, `hand_pose_params`, `expr_params`, `pred_cam_t`, `focal_length`, keypoints and other MHR data. Exact fields, coordinate conventions and dimensions must be checked against the first real result; absence is not replaced with fabricated values.

The preview may include the source photograph. All outputs, image inputs, credentials and checkpoints are private local artifacts and remain excluded from Git. If visualization fails, the adapter reports an error rather than publishing a partial result. Unit tests exercise error paths with mocks only; they do not prove model inference works.
