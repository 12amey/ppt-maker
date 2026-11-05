/**
 * ComfyUI Manager for Presenton Desktop
 * Handles auto-installation, model downloads, and lifecycle management of ComfyUI.
 * Supports both image and video generation workflows.
 */

import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import { safeLog, safeWarn, safeError } from "./safe-console";

// ─── Constants ───────────────────────────────────────────────────────────────

export const COMFYUI_DEFAULT_PORT = 8188;
export const COMFYUI_DEFAULT_URL = `http://127.0.0.1:${COMFYUI_DEFAULT_PORT}`;

/** Portable ComfyUI release for Windows (CPU+CUDA) */
const COMFYUI_PORTABLE_VERSION = "0.3.43";
const COMFYUI_PORTABLE_FILENAME = `ComfyUI_windows_portable_nvidia.7z`;
const COMFYUI_PORTABLE_URL = `https://github.com/comfyanonymous/ComfyUI/releases/download/v${COMFYUI_PORTABLE_VERSION}/${COMFYUI_PORTABLE_FILENAME}`;

/** SDXL base model for high-quality image generation */
const SDXL_MODEL_URL =
  "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors";
const SDXL_MODEL_FILENAME = "sd_xl_base_1.0.safetensors";

/** AnimateDiff for video generation */
const ANIMATEDIFF_MODEL_URL =
  "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt";
const ANIMATEDIFF_MOTION_FILENAME = "mm_sd_v15_v2.ckpt";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComfyUIStatus =
  | "not_installed"
  | "installing"
  | "downloading_models"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export type ComfyUIProgressEvent = {
  status: ComfyUIStatus;
  message: string;
  progress?: number; // 0–100
};

export type ComfyUIManagerOptions = {
  baseDir: string; // App data directory (e.g. %APPDATA%/Presenton)
  onProgress?: (event: ComfyUIProgressEvent) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (bytesReceived: number, totalBytes: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;

    const doRequest = (requestUrl: string) => {
      protocol
        .get(requestUrl, (response) => {
          if (
            response.statusCode === 301 ||
            response.statusCode === 302 ||
            response.statusCode === 307 ||
            response.statusCode === 308
          ) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error("Redirect with no location header"));
              return;
            }
            // Follow redirect
            const redirectProtocol = redirectUrl.startsWith("https") ? https : http;
            file.close();
            const file2 = fs.createWriteStream(destPath);
            redirectProtocol.get(redirectUrl, (res2) => {
              const total = parseInt(res2.headers["content-length"] || "0", 10);
              let received = 0;
              res2.on("data", (chunk: Buffer) => {
                received += chunk.length;
                if (onProgress) onProgress(received, total);
              });
              res2.pipe(file2);
              file2.on("finish", () => {
                file2.close();
                resolve();
              });
              file2.on("error", reject);
              res2.on("error", reject);
            }).on("error", reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            return;
          }

          const total = parseInt(response.headers["content-length"] || "0", 10);
          let received = 0;

          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (onProgress) onProgress(received, total);
          });

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", reject);
          response.on("error", reject);
        })
        .on("error", reject);
    };

    doRequest(url);
  });
}

async function extract7z(archivePath: string, destDir: string): Promise<void> {
  // Use the bundled 7zip-bin from electron package
  let sevenZipPath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sevenZipBin = require("7zip-bin");
    sevenZipPath = sevenZipBin.path7za;
  } catch {
    // Fallback to system 7z
    sevenZipPath = "7z";
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(sevenZipPath, ["x", archivePath, `-o${destDir}`, "-y"], {
      stdio: "pipe",
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`7z exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

function waitForHttp(
  url: string,
  timeoutMs = 120_000,
  intervalMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const protocol = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      const req = protocol.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        setTimeout(attempt, intervalMs);
      });
      req.setTimeout(2_000, () => {
        req.destroy();
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

// ─── ComfyUIManager ───────────────────────────────────────────────────────────

export class ComfyUIManager {
  private comfyuiDir: string;
  private modelsDir: string;
  private motionDir: string;
  private process: ChildProcess | null = null;
  private status: ComfyUIStatus = "not_installed";
  private onProgress: (event: ComfyUIProgressEvent) => void;

  constructor(options: ComfyUIManagerOptions) {
    this.comfyuiDir = path.join(options.baseDir, "ComfyUI");
    this.modelsDir = path.join(this.comfyuiDir, "ComfyUI", "models", "checkpoints");
    this.motionDir = path.join(
      this.comfyuiDir,
      "ComfyUI",
      "models",
      "animatediff_models"
    );
    this.onProgress = options.onProgress ?? (() => {});
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get currentStatus(): ComfyUIStatus {
    return this.status;
  }

  get isInstalled(): boolean {
    return fs.existsSync(path.join(this.comfyuiDir, "ComfyUI", "main.py"));
  }

  get isRunning(): boolean {
    return this.status === "running" && this.process !== null && !this.process.killed;
  }

  get comfyuiUrl(): string {
    return COMFYUI_DEFAULT_URL;
  }

  /**
   * Ensure ComfyUI is installed, models are downloaded, and the server is running.
   * Safe to call multiple times – skips steps that are already done.
   */
  async ensureReady(): Promise<void> {
    if (!this.isInstalled) {
      await this.install();
    }

    await this.ensureModels();

    if (!this.isRunning) {
      await this.start();
    }
  }

  /**
   * Download and extract the ComfyUI portable package.
   */
  async install(): Promise<void> {
    this.setStatus("installing", "Downloading ComfyUI portable...");
    fs.mkdirSync(this.comfyuiDir, { recursive: true });

    const archivePath = path.join(this.comfyuiDir, COMFYUI_PORTABLE_FILENAME);

    try {
      await downloadFile(COMFYUI_PORTABLE_URL, archivePath, (recv, total) => {
        const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
        this.setStatus("installing", `Downloading ComfyUI... ${pct}%`, pct);
      });

      this.setStatus("installing", "Extracting ComfyUI...");
      await extract7z(archivePath, this.comfyuiDir);
      fs.unlinkSync(archivePath);
      safeLog("[ComfyUI] Installation complete.");
    } catch (err) {
      this.setStatus("error", `Installation failed: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Download required AI models if not already present.
   */
  async ensureModels(): Promise<void> {
    fs.mkdirSync(this.modelsDir, { recursive: true });
    fs.mkdirSync(this.motionDir, { recursive: true });

    const sdxlPath = path.join(this.modelsDir, SDXL_MODEL_FILENAME);
    if (!fs.existsSync(sdxlPath)) {
      this.setStatus("downloading_models", "Downloading SDXL base model (≈6.9 GB)...");
      await downloadFile(SDXL_MODEL_URL, sdxlPath, (recv, total) => {
        const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
        this.setStatus(
          "downloading_models",
          `Downloading SDXL model... ${pct}%`,
          pct
        );
      });
      safeLog("[ComfyUI] SDXL model downloaded.");
    }

    const motionPath = path.join(this.motionDir, ANIMATEDIFF_MOTION_FILENAME);
    if (!fs.existsSync(motionPath)) {
      this.setStatus(
        "downloading_models",
        "Downloading AnimateDiff motion module (≈1.8 GB)..."
      );
      await downloadFile(ANIMATEDIFF_MODEL_URL, motionPath, (recv, total) => {
        const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
        this.setStatus(
          "downloading_models",
          `Downloading AnimateDiff... ${pct}%`,
          pct
        );
      });
      safeLog("[ComfyUI] AnimateDiff motion module downloaded.");
    }
  }

  /**
   * Start the ComfyUI server.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.setStatus("starting", "Starting ComfyUI server...");

    // Determine python executable inside the portable package
    const pythonExe = path.join(
      this.comfyuiDir,
      "python_embeded",
      "python.exe"
    );
    const comfyMain = path.join(this.comfyuiDir, "ComfyUI", "main.py");

    if (!fs.existsSync(pythonExe)) {
      this.setStatus("error", "ComfyUI Python not found. Reinstall may be needed.");
      throw new Error("ComfyUI embedded Python not found.");
    }

    this.process = spawn(
      pythonExe,
      [
        "-s",
        comfyMain,
        "--port",
        String(COMFYUI_DEFAULT_PORT),
        "--listen",
        "127.0.0.1",
      ],
      {
        cwd: path.join(this.comfyuiDir, "ComfyUI"),
        stdio: "pipe",
        env: { ...process.env },
      }
    );

    this.process.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes("To see the GUI go to:") || line.includes("Starting server")) {
        safeLog("[ComfyUI]", line.trim());
      }
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      safeWarn("[ComfyUI STDERR]", chunk.toString().trim());
    });

    this.process.on("exit", (code) => {
      safeLog(`[ComfyUI] Process exited with code ${code}`);
      this.process = null;
      if (this.status === "running") {
        this.setStatus("stopped", "ComfyUI stopped unexpectedly.");
      }
    });

    this.process.on("error", (err) => {
      safeError("[ComfyUI] Process error:", err);
      this.setStatus("error", `ComfyUI process error: ${err.message}`);
    });

    // Wait until HTTP server is up
    try {
      await waitForHttp(`${COMFYUI_DEFAULT_URL}/system_stats`, 120_000);
      this.setStatus("running", "ComfyUI is running.");
      safeLog(`[ComfyUI] Server ready at ${COMFYUI_DEFAULT_URL}`);
    } catch (err) {
      this.setStatus("error", `ComfyUI did not start: ${String(err)}`);
      this.stop();
      throw err;
    }
  }

  /**
   * Stop the ComfyUI server.
   */
  stop(): void {
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    if (this.status !== "error") {
      this.setStatus("stopped", "ComfyUI stopped.");
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private setStatus(
    status: ComfyUIStatus,
    message: string,
    progress?: number
  ): void {
    this.status = status;
    this.onProgress({ status, message, progress });
    safeLog(`[ComfyUI Status] ${status}: ${message}${progress !== undefined ? ` (${progress}%)` : ""}`);
  }
}

// ─── Default Workflows ────────────────────────────────────────────────────────

/**
 * Returns a default SDXL image generation workflow for ComfyUI API format.
 * The node titled "Input Prompt" is where the prompt gets injected by Presenton.
 */
export function getDefaultImageWorkflow(): object {
  return {
    "1": {
      inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      class_type: "CheckpointLoaderSimple",
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      inputs: {
        text: "A beautiful professional presentation slide background",
        clip: ["1", 1],
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "Input Prompt" },
    },
    "3": {
      inputs: { text: "low quality, blurry, distorted, text, watermark", clip: ["1", 1] },
      class_type: "CLIPTextEncode",
      _meta: { title: "Negative Prompt" },
    },
    "4": {
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      class_type: "EmptyLatentImage",
      _meta: { title: "Empty Latent Image" },
    },
    "5": {
      inputs: {
        seed: 42,
        steps: 25,
        cfg: 7.5,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" },
    },
    "6": {
      inputs: { samples: ["5", 0], vae: ["1", 2] },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode" },
    },
    "7": {
      inputs: { filename_prefix: "presenton_image", images: ["6", 0] },
      class_type: "SaveImage",
      _meta: { title: "Save Image" },
    },
  };
}

/**
 * Returns a default AnimateDiff video workflow for ComfyUI API format.
 * Generates a short MP4 video clip from a text prompt.
 */
export function getDefaultVideoWorkflow(): object {
  return {
    "1": {
      inputs: { ckpt_name: "v1-5-pruned-emaonly.ckpt" },
      class_type: "CheckpointLoaderSimple",
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      inputs: {
        text: "A smooth professional animation for a presentation slide",
        clip: ["1", 1],
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "Input Prompt" },
    },
    "3": {
      inputs: { text: "low quality, blurry, static, text", clip: ["1", 1] },
      class_type: "CLIPTextEncode",
      _meta: { title: "Negative Prompt" },
    },
    "4": {
      inputs: {
        model_name: "mm_sd_v15_v2.ckpt",
        beta_schedule: "linear (AnimateDiff)",
      },
      class_type: "ADE_AnimateDiffLoaderWithContext",
      _meta: { title: "AnimateDiff Loader" },
    },
    "5": {
      inputs: {
        motion_model: ["4", 0],
        model: ["1", 0],
      },
      class_type: "ADE_ApplyAnimateDiffModel",
      _meta: { title: "Apply AnimateDiff" },
    },
    "6": {
      inputs: { width: 512, height: 512, batch_size: 16 },
      class_type: "EmptyLatentImage",
      _meta: { title: "Empty Latent Image" },
    },
    "7": {
      inputs: {
        seed: 42,
        steps: 20,
        cfg: 7.5,
        sampler_name: "euler_ancestral",
        scheduler: "linear",
        denoise: 1.0,
        model: ["5", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["6", 0],
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" },
    },
    "8": {
      inputs: { samples: ["7", 0], vae: ["1", 2] },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode" },
    },
    "9": {
      inputs: {
        frame_rate: 8,
        loop_count: 0,
        filename_prefix: "presenton_video",
        format: "video/h264-mp4",
        pix_fmt: "yuv420p",
        crf: 19,
        save_metadata: true,
        images: ["8", 0],
      },
      class_type: "VHS_VideoCombine",
      _meta: { title: "Video Combine" },
    },
  };
}
