"""Check retained evidence against the generated staging files without writing."""

import subprocess
import sys
from pathlib import Path


def main():
    builder = Path(__file__).with_name("build_research_data.py")
    return subprocess.call([sys.executable, str(builder), "--check"])


if __name__ == "__main__":
    raise SystemExit(main())
