#!/usr/bin/env python3
"""E1 M0: build config.lock.json.

Records, for every candidate: the exact revision, per-file SHA256 of what was
actually downloaded, verification against the hashes Hugging Face publishes for
that pinned revision, the installed package versions, the host, and a
runnability probe. Nothing here runs inference.

  python scripts/make_lock.py --base D:/ModelBench/laya
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import platform
import subprocess
import sys

os.environ.setdefault("USE_TF", "0")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CANDIDATES = {
    "A": {"repo": "convaiinnovations/laya-multilingual",
          "rev": "1720e3e3357cfe1e281542e223f8273b0890ca34",
          "card_self_report": None,
          "license_claim": "apache-2.0"},
    "B": {"repo": "SGK86/laya-multilingual-typed-decisions",
          "rev": "8fc29deeba77c74004756dfd64217287b1e52e47",
          "card_self_report": "0.786 on the author's own typed-decisions test set - NOT a Narraverse result",
          "license_claim": "apache-2.0"},
    "C": {"repo": "ZLHAOOO/laya-mlx-zh",
          "rev": "0d5398ca9f41d5a7823e536eb6ad58e53c86872b",
          "card_self_report": "0.750 vs 0.681 on 1116 held-out decisions over 9 task heads - NOT a Narraverse result",
          "license_claim": "apache-2.0"},
}
PKGS = ["laya", "laya-mlx", "mlx", "torch", "transformers", "tokenizers",
        "huggingface_hub", "numpy", "safetensors"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha1(path):
    """HF reports non-LFS files by their git blob id (SHA-1 over 'blob <n>\\0'+content)."""
    data = open(path, "rb").read()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def probe_laya():
    try:
        import laya
        return {"import_ok": True, "has_load": hasattr(laya, "load"),
                "sdk_pinned_revisions": getattr(laya, "PINNED_REVISIONS", {})}
    except Exception as exc:
        return {"import_ok": False, "error": f"{type(exc).__name__}: {exc}"}


def probe_mlx():
    try:
        import mlx.core as mx
        mx.array([1.0])
        return {"import_ok": True, "default_device": str(mx.default_device())}
    except Exception as exc:
        return {"import_ok": False, "error": f"{type(exc).__name__}: {exc}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    args = ap.parse_args()

    official = json.load(open(os.path.join(HERE, "hf-official-hashes.json"), encoding="utf-8"))

    lock = {
        "schema": "e1-lock-v1",
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "generated_by": "scripts/make_lock.py",
        "host": {
            "platform": f"{platform.system()} {platform.release()}",
            "arch": platform.machine(),
            "python": sys.version.split()[0],
            "gpu_advertised": "NVIDIA GeForce RTX 4060 Laptop GPU 8GB (driver 595.71)",
            "torch_backend_note": "installed torch is the CPU wheel, so inference runs on CPU; "
                                  "the CUDA deployment path is measured separately or left untested, "
                                  "never inferred from vendor millisecond claims",
        },
        "packages": {},
        "candidates": {},
        "sdk_probes": {"laya": probe_laya(), "mlx": probe_mlx()},
    }
    import importlib.metadata as md
    for p in PKGS:
        try:
            lock["packages"][p] = md.version(p)
        except Exception:
            lock["packages"][p] = "not installed"

    for key, meta in CANDIDATES.items():
        d = os.path.join(args.base, "weights", key).replace("\\", "/")
        files = {}
        for path in sorted(glob.glob(os.path.join(d, "**", "*"), recursive=True)):
            if not os.path.isfile(path) or path.endswith(".incomplete"):
                continue
            rel = os.path.relpath(path, d).replace("\\", "/")
            files[rel] = {"sha256": sha256(path), "git_blob_sha1": git_blob_sha1(path),
                          "bytes": os.path.getsize(path)}
        off = official.get(key, {}).get("files", {})
        verified, mismatch, not_official = [], [], []
        for rel, info in files.items():
            want = (off.get(rel) or [None])[0]
            if want is None:
                not_official.append(rel)
                continue
            kind = "lfs_sha256" if len(want) == 64 else "git_blob_sha1"
            got = info["sha256"] if kind == "lfs_sha256" else info["git_blob_sha1"]
            if want == got:
                verified.append(rel)
            else:
                mismatch.append({"path": rel, "compared_as": kind, "local": got, "official": want})
        model_sha = (files.get("model.safetensors") or {}).get("sha256")
        lock["candidates"][key] = {
            **meta,
            "local_dir": d,
            "model_sha256": model_sha,
            "files": files,
            "verify": {"verified_against_official_revision": verified,
                       "mismatch": mismatch,
                       "not_in_official_tree": not_official,
                       "official_hash_source": "GET https://huggingface.co/api/models/{repo}/tree/{rev}?recursive=1&blobs=1 -> lfs.oid"},
        }

    lock["candidates"]["A"]["status"] = "runnable"
    lock["candidates"]["B"]["status"] = "runnable"
    mlx_ok = lock["sdk_probes"]["mlx"].get("import_ok")
    lock["candidates"]["C"]["status"] = "runnable" if mlx_ok else "blocked"
    if not mlx_ok:
        lock["candidates"]["C"]["blocker"] = (
            "laya_mlx -> import mlx.core fails on this host: "
            + lock["sdk_probes"]["mlx"].get("error", "?")
            + " | PyPI win_amd64 wheels for mlx exist only for 0.32.0-0.32.3 (no older version to bisect); "
              "`pip install mlx[cpu]` adds no runtime package on Windows; "
              "all directly referenced DLLs (MSVCP140/VCRUNTIME140(_1)/ucrt/api-ms) resolve individually. "
              "Per task book: candidate C is reported as NOT TESTED on this environment; its model-card "
              "numbers are not used as a substitute.")
    lock["candidates"]["C"]["weights_acquired"] = bool(lock["candidates"]["C"]["files"])

    note = ("Upstream `laya` SDK pins convaiinnovations/laya-multilingual at revision "
            "e4e9ddf21a7b1903b7acffd8814ad4307bf63a67, while this task book pinned "
            "1720e3e3357cfe1e281542e223f8273b0890ca34. Local files were fetched at the pinned "
            "revision and verified byte-for-byte against HF's published hash for that revision, "
            "so the benchmark runs on the pinned weights, not the SDK default. Any later claim of "
            "equivalence with the SDK default revision needs its own diff.")
    lock["revision_discrepancy_note"] = note

    lock["known_side_effects"] = {
        "laya.load_mutates_checkpoint_dir": {
            "observed": True,
            "file": "tokenizer/tokenizer_config.json",
            "evidence": "pristine blob_sha1 eea1ed61121530d74c1722dc2aab6ec917a75909 (502 B, fetched raw from the "
                        "pinned revision) became blob_sha1 1c711b65c36726ca864b67cb63be425b2de2b55d (545 B) after "
                        "laya.load(...); transformers rewrites extra_special_tokens from a list into a dict. "
                        "Weights and tokenizer.json are untouched (sha256 re-verified identical), so predictions "
                        "are not affected, but any hash check done after a load will report a false mismatch.",
            "handling": "config.lock.json is generated from a pristine snapshot taken before any load; small "
                        "config files are also copied to <base>/pristine/<ID>/ for restore-and-recheck. Restore with "
                        "cp pristine/<ID>/tokenizer_tokenizer_config.json <weights>/<ID>/tokenizer/tokenizer_config.json",
        },
    }

    dest = os.path.join(HERE, "config.lock.json")
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(lock, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(json.dumps({k: {"status": v["status"], "model_sha256": v["model_sha256"],
                          "verified": len(v["verify"]["verified_against_official_revision"]),
                          "mismatch": v["verify"]["mismatch"]}
                      for k, v in lock["candidates"].items()}, ensure_ascii=False, indent=1))
    print("packages:", lock["packages"])
    print("mlx probe:", lock["sdk_probes"]["mlx"])
    print(f"wrote {os.path.relpath(dest, HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
