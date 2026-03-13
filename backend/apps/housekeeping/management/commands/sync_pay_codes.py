import json
import re
import zipfile
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.housekeeping.models import HKWorker


XLSX_NS = {
    'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
PERSON_SUFFIXES = ('KUMAR', 'KUMARI', 'BHAI', 'BEN', 'SINH', 'SINGH', 'JI')


def normalize_text(value):
    text = str(value or '').upper().strip()
    text = re.sub(r'[^A-Z0-9 ]+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def compact_text(value):
    return normalize_text(value).replace(' ', '')


def tokenize(value):
    return [token for token in normalize_text(value).split(' ') if token]


def token_key(value):
    return ' '.join(sorted(tokenize(value)))


def token_variants(token):
    normalized = normalize_text(token)
    if not normalized:
        return []

    variants = {normalized}
    for suffix in PERSON_SUFFIXES:
        if normalized.endswith(suffix) and len(normalized) > len(suffix) + 1:
            variants.add(normalized[: -len(suffix)])
    return [variant for variant in variants if variant]


def token_similarity(left, right):
    best = 0.0
    for left_variant in token_variants(left):
        for right_variant in token_variants(right):
            if left_variant == right_variant:
                best = max(best, 1.0)
            if left_variant.startswith(right_variant) or right_variant.startswith(left_variant):
                prefix_len = min(len(left_variant), len(right_variant))
                if prefix_len >= 5:
                    best = max(best, 0.95)
                elif prefix_len >= 4:
                    best = max(best, 0.9)
                else:
                    best = max(best, prefix_len / max(len(left_variant), len(right_variant)))
            best = max(best, SequenceMatcher(None, left_variant, right_variant).ratio())
    return best


def workbook_name_variants(value):
    tokens = tokenize(value)
    variants = {normalize_text(value)}
    if not tokens:
        return []

    variants.add(tokens[0])
    variants.add(tokens[-1])
    if len(tokens) >= 2:
        variants.add(tokens[1])
        variants.add(f'{tokens[0]} {tokens[-1]}')
        variants.add(f'{tokens[1]} {tokens[0]}')
        variants.add(f'{tokens[1]} {tokens[-1]}')
    if len(tokens) >= 3:
        variants.add(f'{tokens[0]} {tokens[1]}')
        variants.add(f'{tokens[1]} {tokens[2]}')
    return [variant for variant in variants if variant]


def score_person_name(short_name, workbook_name):
    current_tokens = tokenize(short_name)
    workbook_tokens = tokenize(workbook_name)
    if not current_tokens or not workbook_tokens:
        return 0

    given_candidates = workbook_tokens[:2] if len(workbook_tokens) >= 2 else workbook_tokens[:1]
    surname_candidates = [workbook_tokens[0], workbook_tokens[-1]] if len(workbook_tokens) >= 2 else workbook_tokens[:1]

    current_first = current_tokens[0]
    current_last = current_tokens[-1]
    given_score = max((token_similarity(current_first, token) for token in given_candidates), default=0.0)
    surname_score = 0.0
    if len(current_tokens) > 1:
        surname_score = max((token_similarity(current_last, token) for token in surname_candidates), default=0.0)

    variant_score = max(
        (
            SequenceMatcher(None, compact_text(short_name), compact_text(variant)).ratio()
            for variant in workbook_name_variants(workbook_name)
        ),
        default=0.0,
    )

    best = int(variant_score * 2600)
    if len(current_tokens) == 1:
        if given_score >= 0.99:
            return max(best, 3600)
        if given_score >= 0.92:
            return max(best, 3200)
        if given_score >= 0.85:
            return max(best, 2800)
        return best

    if given_score >= 0.99 and surname_score >= 0.99:
        return max(best, 5200)
    if given_score >= 0.95 and surname_score >= 0.9:
        return max(best, 4800)
    if given_score >= 0.85 and surname_score >= 0.85:
        return max(best, 4200)
    if given_score >= 0.95 and surname_score >= 0.7:
        return max(best, 3800)
    return best


def cleaned_username(username):
    base = str(username or '').replace('.', ' ').replace('_', ' ')
    base = re.sub(r'\b(CARETAKER|SUPERVISOR|HOUSEKEEPING|INVENTORY|MANAGER|ADMIN|SWM)\b', ' ', base, flags=re.I)
    return normalize_text(base)


def load_workbook_rows(path):
    workbook_path = Path(path)
    if not workbook_path.exists():
        raise CommandError(f'Workbook not found: {workbook_path}')

    with zipfile.ZipFile(workbook_path) as archive:
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        rel_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in relationships}

        shared_strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for string_item in shared_root.findall('a:si', XLSX_NS):
                text = ''.join(node.text or '' for node in string_item.findall('.//a:t', XLSX_NS))
                shared_strings.append(text)

        first_sheet = workbook.find('a:sheets', XLSX_NS)[0]
        rel_id = first_sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rel_id]
        if not target.startswith('xl/'):
            target = f'xl/{target}'

        sheet_root = ET.fromstring(archive.read(target))
        out = []
        for row in sheet_root.findall('.//a:sheetData/a:row', XLSX_NS)[2:]:
            cells = {}
            for cell in row.findall('a:c', XLSX_NS):
                ref = cell.attrib.get('r', '')
                col = ''.join(ch for ch in ref if ch.isalpha())
                cell_type = cell.attrib.get('t')
                value_node = cell.find('a:v', XLSX_NS)
                value = '' if value_node is None or value_node.text is None else value_node.text
                if cell_type == 's' and value != '':
                    value = shared_strings[int(value)]
                cells[col] = value
            designation = ' '.join((cells.get('D') or '').split())
            row_data = {
                'sr_no': (cells.get('A') or '').strip(),
                'pay_code': (cells.get('B') or '').strip(),
                'name': ' '.join((cells.get('C') or '').split()),
                'designation': designation,
                'kind': 'staff' if ('CARETAKER' in designation.upper() or 'SUPERVISOR' in designation.upper()) else 'worker',
            }
            if row_data['name']:
                out.append(row_data)
        return out


def best_candidate(rows, objects, scorer, min_score, ambiguity_gap, object_id_key, object_conflict_gap=None):
    assignments = []
    object_row_scores = {}
    for row in rows:
        scored = []
        for obj in objects:
            score = scorer(obj, row)
            if score > 0:
                scored.append((score, obj))
                object_row_scores.setdefault(obj[object_id_key], []).append((score, row))
        scored.sort(key=lambda item: item[0], reverse=True)
        assignments.append({'row': row, 'candidates': scored})

    if object_conflict_gap is None:
        object_conflict_gap = ambiguity_gap

    conflict_object_ids = set()
    for obj in objects:
        if not obj.get('single_name_conflict_sensitive'):
            continue
        candidates = sorted(
            [item for item in object_row_scores.get(obj[object_id_key], []) if item[0] >= min_score],
            key=lambda item: item[0],
            reverse=True,
        )
        if len(candidates) >= 2 and (candidates[0][0] - candidates[1][0]) < object_conflict_gap:
            conflict_object_ids.add(obj[object_id_key])

    assignments.sort(
        key=lambda item: item['candidates'][0][0] if item['candidates'] else 0,
        reverse=True,
    )

    matched = []
    unmatched = []
    used_ids = set()

    for item in assignments:
        row = item['row']
        candidates = [
            (score, obj)
            for score, obj in item['candidates']
            if obj[object_id_key] not in used_ids
        ]
        if not candidates:
            unmatched.append({'row': row, 'reason': 'no_candidate', 'suggestions': []})
            continue

        top_score, top_obj = candidates[0]
        if top_obj[object_id_key] in conflict_object_ids:
            unmatched.append({
                'row': row,
                'reason': 'object_conflict',
                'suggestions': [
                    {
                        'score': round(score, 2),
                        'id': obj[object_id_key],
                        'label': obj.get('label', ''),
                    }
                    for score, obj in candidates[:3]
                ],
            })
            continue

        second_score = candidates[1][0] if len(candidates) > 1 else 0
        if top_score < min_score:
            unmatched.append({
                'row': row,
                'reason': 'low_confidence',
                'suggestions': [
                    {
                        'score': round(score, 2),
                        'id': obj[object_id_key],
                        'label': obj.get('label', ''),
                    }
                    for score, obj in candidates[:3]
                ],
            })
            continue
        if second_score and (top_score - second_score) < ambiguity_gap:
            unmatched.append({
                'row': row,
                'reason': 'ambiguous',
                'suggestions': [
                    {
                        'score': round(score, 2),
                        'id': obj[object_id_key],
                        'label': obj.get('label', ''),
                    }
                    for score, obj in candidates[:3]
                ],
            })
            continue

        used_ids.add(top_obj[object_id_key])
        matched.append({'row': row, 'match': top_obj, 'score': round(top_score, 2)})

    unused_objects = [obj for obj in objects if obj[object_id_key] not in used_ids]
    return matched, unmatched, unused_objects


class Command(BaseCommand):
    help = 'Sync HK staff pay codes and worker pay codes/names from the Excel pay-code list.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--path',
            default='/app/tmp/Pay Code List.xlsx',
            help='Absolute path to the pay-code workbook.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview matches and changes without updating the database.',
        )
        parser.add_argument(
            '--report-path',
            default='/app/tmp/pay_code_sync_report.json',
            help='Where to write the JSON import report.',
        )

    def _staff_objects(self):
        User = get_user_model()
        staff_users = []
        for user in User.objects.filter(role__in=['caretaker', 'supervisor']).order_by('role', 'first_name', 'last_name', 'username'):
            label = f"{user.get_full_name() or user.username} ({user.username})"
            staff_users.append(
                {
                    'id': user.id,
                    'obj': user,
                    'label': label,
                    'full_name': user.get_full_name() or '',
                    'first_name': user.first_name or '',
                    'last_name': user.last_name or '',
                    'username': user.username or '',
                    'pay_code': user.pay_code or '',
                    'single_name_conflict_sensitive': len(tokenize(user.get_full_name() or user.first_name or cleaned_username(user.username))) <= 1,
                }
            )
        return staff_users

    def _worker_objects(self):
        workers = []
        for worker in HKWorker.objects.select_related('area').order_by('name'):
            area_name = worker.area.name if worker.area else ''
            workers.append(
                {
                    'id': worker.id,
                    'obj': worker,
                    'label': f"{worker.name} [{area_name}]",
                    'name': worker.name or '',
                    'pay_code': worker.punching_no or '',
                }
            )
        return workers

    def _score_staff(self, user_row, workbook_row):
        aliases = [
            user_row['full_name'],
            user_row['first_name'],
            f"{user_row['first_name']} {user_row['last_name']}".strip(),
            cleaned_username(user_row['username']),
        ]

        best_score = 0
        for alias in aliases:
            best_score = max(best_score, score_person_name(alias, workbook_row['name']))

        if workbook_row['pay_code'] and user_row['pay_code'] and workbook_row['pay_code'] == user_row['pay_code']:
            best_score += 2500
        return best_score

    def _score_worker(self, worker_row, workbook_row):
        best_score = score_person_name(worker_row['name'], workbook_row['name'])
        if workbook_row['pay_code'] and worker_row['pay_code'] and workbook_row['pay_code'] == worker_row['pay_code']:
            best_score += 2500
        return best_score

    def handle(self, *args, **options):
        workbook_path = options['path']
        dry_run = options['dry_run']
        report_path = Path(options['report_path'])

        rows = load_workbook_rows(workbook_path)
        staff_rows = [row for row in rows if row['kind'] == 'staff']
        worker_rows = [row for row in rows if row['kind'] == 'worker']

        staff_objects = self._staff_objects()
        worker_objects = self._worker_objects()

        matched_staff, unmatched_staff, unused_staff = best_candidate(
            staff_rows,
            staff_objects,
            self._score_staff,
            min_score=2600,
            ambiguity_gap=120,
            object_id_key='id',
            object_conflict_gap=900,
        )
        matched_workers, unmatched_workers, unused_workers = best_candidate(
            worker_rows,
            worker_objects,
            self._score_worker,
            min_score=3000,
            ambiguity_gap=120,
            object_id_key='id',
        )

        staff_updates = []
        worker_updates = []

        for item in matched_staff:
            row = item['row']
            user = item['match']['obj']
            changed = {}
            if (user.pay_code or '') != row['pay_code']:
                changed['pay_code'] = row['pay_code']
            if changed:
                staff_updates.append({
                    'id': user.id,
                    'username': user.username,
                    'display_name': user.get_full_name() or user.username,
                    'changes': changed,
                    'score': item['score'],
                    'source_name': row['name'],
                })

        for item in matched_workers:
            row = item['row']
            worker = item['match']['obj']
            changed = {}
            if (worker.punching_no or '') != row['pay_code']:
                changed['pay_code'] = row['pay_code']
            if normalize_text(worker.name) != normalize_text(row['name']):
                changed['name'] = row['name']
            if changed:
                worker_updates.append({
                    'id': worker.id,
                    'worker_name': worker.name,
                    'changes': changed,
                    'score': item['score'],
                    'source_name': row['name'],
                })

        report = {
            'dry_run': dry_run,
            'workbook_path': workbook_path,
            'totals': {
                'xlsx_rows': len(rows),
                'staff_rows': len(staff_rows),
                'worker_rows': len(worker_rows),
                'staff_users_in_db': len(staff_objects),
                'workers_in_db': len(worker_objects),
                'matched_staff_rows': len(matched_staff),
                'matched_worker_rows': len(matched_workers),
                'staff_updates': len(staff_updates),
                'worker_updates': len(worker_updates),
                'unmatched_staff_rows': len(unmatched_staff),
                'unmatched_worker_rows': len(unmatched_workers),
                'unmatched_staff_in_db': len(unused_staff),
                'unmatched_workers_in_db': len(unused_workers),
            },
            'staff_updates': staff_updates,
            'worker_updates': worker_updates,
            'unmatched_staff_rows': unmatched_staff,
            'unmatched_worker_rows': unmatched_workers,
            'unused_staff_in_db': [
                {
                    'id': row['id'],
                    'label': row['label'],
                    'pay_code': row['pay_code'],
                }
                for row in unused_staff
            ],
            'unused_workers_in_db': [
                {
                    'id': row['id'],
                    'label': row['label'],
                    'pay_code': row['pay_code'],
                }
                for row in unused_workers
            ],
        }

        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')

        self.stdout.write(self.style.SUCCESS(f'Report written to {report_path}'))
        self.stdout.write(json.dumps(report['totals'], indent=2))

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run only. No database changes were applied.'))
            return

        with transaction.atomic():
            for item in matched_staff:
                row = item['row']
                user = item['match']['obj']
                changed = {}
                if (user.pay_code or '') != row['pay_code']:
                    changed['pay_code'] = row['pay_code']
                if changed:
                    user.pay_code = row['pay_code']
                    user.save(update_fields=['pay_code'])

            for item in matched_workers:
                row = item['row']
                worker = item['match']['obj']
                update_fields = []
                if (worker.punching_no or '') != row['pay_code']:
                    worker.punching_no = row['pay_code']
                    update_fields.append('punching_no')
                if normalize_text(worker.name) != normalize_text(row['name']):
                    worker.name = row['name']
                    update_fields.append('name')
                if update_fields:
                    worker.save(update_fields=update_fields)

        self.stdout.write(self.style.SUCCESS('Pay code sync completed.'))
