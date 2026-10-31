#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path

# Load .env from project root (one level above backend/)
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')


def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    # Add apps directory to sys.path so 'substation', 'wtp_stp', etc. can be imported directly
    apps_dir = str(Path(__file__).resolve().parent / 'apps')
    if apps_dir not in sys.path:
        sys.path.insert(0, apps_dir)

    # Normalize file-path test arguments (e.g. apps/substation/test_torrent_demand.py -> apps.substation.test_torrent_demand)
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        for i in range(2, len(sys.argv)):
            arg = sys.argv[i]
            if (arg.endswith('.py') or '/' in arg or '\\' in arg) and not arg.startswith('-'):
                clean_path = os.path.normpath(arg).replace('\\', '/')
                if clean_path.endswith('.py'):
                    clean_path = clean_path[:-3]
                # Strip leading backend/ or ./ if present
                clean_path = clean_path.lstrip('./')
                if clean_path.startswith('backend/'):
                    clean_path = clean_path[len('backend/'):]
                dotted = clean_path.replace('/', '.')
                sys.argv[i] = dotted

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
