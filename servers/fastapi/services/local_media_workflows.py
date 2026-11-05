import secrets


def image_workflow(
    prompt: str,
    width: int = 512,
    height: int = 512,
    source_image: str | None = None,
    strength: float = 0.65,
):
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "v1-5-pruned-emaonly.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "_meta": {"title": "Input Prompt"}, "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, watermark, distorted text", "clip": ["1", 1]}},
    }
    if source_image:
        workflow["4"] = {"class_type": "LoadImage", "inputs": {"image": source_image}}
        workflow["5"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["1", 2]}}
        latent_image = ["5", 0]
        denoise = strength
    else:
        workflow["4"] = {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}}
        latent_image = ["4", 0]
        denoise = 1
    workflow.update({
        "6": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": latent_image, "seed": secrets.randbelow(2**32), "steps": 24, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": denoise}},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": "creative_hub"}},
    })
    return workflow
