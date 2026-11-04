"""Regenerate one dependency lock in a clean, constrained virtual environment.

Existing exact pins are constraints, so regeneration does not silently upgrade
transitive dependencies. To upgrade a package, update its existing lock pin and
its deps-*-top.txt pin together, then regenerate the affected profiles.
No dependency-reporting or testing tool is installed in the production profile.
"""

import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile
import venv


ROOT = Path(__file__).resolve().parents[1]
PROFILES = {
    "production": ("deps-top.txt", "requirements.txt", ()),
    "dev": (
        "deps-dev-top.txt",
        "requirements-dev.txt",
        ("requirements.txt", "requirements-storage-all.txt"),
    ),
    "oss": ("deps-oss-top.txt", "requirements-oss.txt", ("requirements.txt",)),
    "r2": ("deps-r2-top.txt", "requirements-r2.txt", ("requirements.txt",)),
    "google-ocr": (
        "deps-google-ocr-top.txt",
        "requirements-google-ocr.txt",
        ("requirements.txt",),
    ),
}
PIN = re.compile(r"([A-Za-z0-9_.-]+)(?:\[[^]]+\])?==([^\s;]+)$")
DEV_PACKAGES = {"pytest", "mongomock", "ruff", "pipdeptree", "coverage", "execnet"}


def canonical_name(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def read_pins(path):
    """Read the existing indented locks, including compatibility -r groups."""
    pins = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("-r "):
            incoming = read_pins(path.parent / line[3:].strip())
        else:
            match = PIN.fullmatch(line)
            if not match:
                raise ValueError(f"Expected an exact pin in {path.name}: {raw}")
            incoming = {canonical_name(match[1]): match[2]}
        for name, version in incoming.items():
            if name in pins and pins[name] != version:
                raise ValueError(f"Conflicting pins for {name} in {path.name}")
            pins[name] = version
    return pins


def ensure_production(pins):
    leaked = sorted(
        name for name in pins if name in DEV_PACKAGES or name.startswith("pytest-")
    )
    if leaked:
        raise ValueError(f"Development dependencies in production: {', '.join(leaked)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", choices=PROFILES)
    parser.add_argument("--check", action="store_true", help="Validate pins without installing")
    args = parser.parse_args()
    definition, lock_name, includes = PROFILES[args.profile]
    roots = read_pins(ROOT / definition)
    pins = read_pins(ROOT / lock_name)
    inherited = {}
    for include in includes:
        inherited.update(read_pins(ROOT / include))
    for name, version in inherited.items():
        if name in pins and pins[name] != version:
            raise ValueError(f"{lock_name} conflicts with inherited pin for {name}")
        pins[name] = version
    for name, version in roots.items():
        if pins.get(name) != version:
            raise ValueError(f"Update {lock_name} to match {name}=={version} before regenerating")
    if args.profile == "production":
        ensure_production(pins)
    if args.check:
        print(f"{args.profile}: {len(pins)} exact pins validated")
        return

    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    with tempfile.TemporaryDirectory(prefix=".requirements-lock-", dir=ROOT) as directory:
        staging = Path(directory)
        venv.EnvBuilder(with_pip=True).create(staging / "venv")
        python = staging / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        constraints = staging / "constraints.txt"
        constraints.write_text(
            "".join(f"{name}=={version}\n" for name, version in sorted(pins.items())),
            encoding="utf-8",
        )
        subprocess.run(
            [str(python), "-m", "pip", "install", "-c", str(constraints), "-r", str(ROOT / definition)],
            check=True, env=env,
        )
        subprocess.run([str(python), "-m", "pip", "check"], check=True, env=env)
        frozen = subprocess.check_output(
            [str(python), "-m", "pip", "freeze", "--all", "--exclude", "pip", "--exclude", "wheel"],
            env=env, text=True,
        )
        resolved_path = staging / "resolved.txt"
        resolved_path.write_text(frozen, encoding="utf-8")
        resolved = read_pins(resolved_path)
        if args.profile == "production":
            ensure_production(resolved)
        content = f"# GENERATED: python scripts/lock_requirements.py {args.profile}\n"
        content += "# Existing lock versions are retained as constraints.\n"
        content += "".join(f"-r {include}\n" for include in includes)
        content += "".join(
            f"{name}=={version}\n" for name, version in sorted(resolved.items())
            if inherited.get(name) != version
        )
        # Only replace a lock after successful resolution and pip check.
        replacement = staging / lock_name
        replacement.write_text(content, encoding="utf-8")
        replacement.replace(ROOT / lock_name)


if __name__ == "__main__":
    main()
