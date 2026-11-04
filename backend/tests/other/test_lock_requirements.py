"""Guard dependency scopes without downloading packages or changing lock files."""

import pytest

from scripts.lock_requirements import PROFILES, ROOT, ensure_production, read_pins


@pytest.mark.parametrize("profile", PROFILES)
def test_locked_roots_match_definition(profile):
    definition, lock, includes = PROFILES[profile]
    locked = read_pins(ROOT / lock)
    for include in includes:
        locked.update(read_pins(ROOT / include))
    roots = read_pins(ROOT / definition)
    assert all(locked.get(name) == version for name, version in roots.items())
    if profile == "production":
        ensure_production(locked)
        assert "curl-cffi" in roots
        assert "pillow-avif-plugin" in roots
        assert "asgiref" not in locked


@pytest.mark.parametrize("package", ["pytest", "pytest-cov", "mongomock", "ruff", "pipdeptree"])
def test_production_rejects_development_dependencies(package):
    with pytest.raises(ValueError, match="Development dependencies"):
        ensure_production({package: "1.0"})


def test_lock_reader_rejects_conflicting_included_pins(tmp_path):
    (tmp_path / "base.txt").write_text("Flask==2.2.5\n", encoding="utf-8")
    lock = tmp_path / "optional.txt"
    lock.write_text("-r base.txt\nflask==3.0.0\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Conflicting pins"):
        read_pins(lock)
