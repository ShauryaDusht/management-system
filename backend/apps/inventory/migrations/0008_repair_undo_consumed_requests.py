from django.db import migrations


def repair_inconsistent_requests_and_set_undo_consumed(apps, schema_editor):
    ItemRequest = apps.get_model('inventory', 'ItemRequest')
    ItemIssue = apps.get_model('inventory', 'ItemIssue')
    HKStockRequest = apps.get_model('housekeeping', 'HKStockRequest')

    # 1. Any request whose issue is reversed
    reversed_issue_req_ids = list(
        ItemIssue.objects.filter(is_reversed=True).values_list('request_id', flat=True)
    )

    for req in ItemRequest.objects.filter(id__in=reversed_issue_req_ids):
        update_fields = ['undo_consumed']
        req.undo_consumed = True
        if req.status != 'rejected':
            req.status = 'rejected'
            update_fields.append('status')
        issue = ItemIssue.objects.filter(request_id=req.id).first()
        if not req.rejection_reason and issue and issue.reversal_reason:
            req.rejection_reason = issue.reversal_reason
            update_fields.append('rejection_reason')
        req.save(update_fields=update_fields)

        # Sync HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request_id=req.id).first()
        if hk_req:
            hk_fields = []
            if hk_req.status != 'rejected':
                hk_req.status = 'rejected'
                hk_fields.append('status')
            if hk_req.covered_quantity != 0:
                hk_req.covered_quantity = 0
                hk_fields.append('covered_quantity')
            if hk_fields:
                hk_req.save(update_fields=hk_fields)

    # 2. Any request with adjustments
    adj_req_ids = list(
        ItemIssue.objects.filter(adjustments__isnull=False).values_list('request_id', flat=True)
    )
    ItemRequest.objects.filter(id__in=adj_req_ids).update(undo_consumed=True)

    # 3. Any request with [UNDO_REJECTED] in notes
    for req in ItemRequest.objects.filter(notes__contains='[UNDO_REJECTED]'):
        if not req.undo_consumed:
            req.undo_consumed = True
            req.save(update_fields=['undo_consumed'])


class Migration(migrations.Migration):
    """One-time data repair for undo_consumed. Idempotent, so safe on databases that already
    ran the repair as part of the original combined 0007."""

    dependencies = [
        ('inventory', '0007_itemrequest_undo_consumed'),
        ('housekeeping', '0027_hkstockrequest_covered_quantity'),
    ]

    operations = [
        migrations.RunPython(
            repair_inconsistent_requests_and_set_undo_consumed,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
