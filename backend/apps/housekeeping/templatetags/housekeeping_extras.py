import re

from django import template

register = template.Library()


@register.filter
def public_task_description(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return ""

    parts = [part.strip() for part in text.split("|")]
    public_parts = []
    for part in parts:
        lowered = part.lower()
        if lowered.startswith("days:") or lowered.startswith("sundays:"):
            continue
        if part:
            public_parts.append(part)
    return " ".join(public_parts).strip()
