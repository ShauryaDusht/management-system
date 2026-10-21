import hashlib
import logging
import os
from datetime import date, timedelta
from django.conf import settings
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags

from .models import LiftLicense, LiftComplianceSetting

logger = logging.getLogger(__name__)


def get_urgent_licenses(window_days=90):
    """
    Finds all lift licenses that are either already expired or expiring within `window_days`.
    Automatically categorizes them into 30, 60, and 90-day alert tiers:
      - expired: days_left < 0
      - tier_30: 0 <= days_left <= 30 (Critical action window)
      - tier_60: 31 <= days_left <= 60 (Urgent 60-day renewal notice)
      - tier_90: 61 <= days_left <= 90 (Advance 90-day notice)
    """
    today = date.today()
    max_days = int(window_days) if window_days is not None else 90
    cutoff_date = today + timedelta(days=max_days)

    queryset = LiftLicense.objects.filter(till__isnull=False, till__lte=cutoff_date).order_by('till')

    expired = []
    tier_30 = []
    tier_60 = []
    tier_90 = []

    for lift in queryset:
        days_left = (lift.till - today).days
        item = {
            'id': lift.id,
            'lift': lift.lift,
            'loc': lift.loc or 'Campus',
            'no': lift.no or 'N/A',
            'prov': lift.prov or 'OEM Unspecified',
            'till': lift.till.strftime('%d.%m.%Y'),
            'iso_till': lift.till.isoformat(),
            'days_left': days_left,
            'eng': lift.eng or 'Unassigned',
            'rem': lift.rem or '',
        }

        if days_left < 0:
            item['status'] = 'expired'
            item['tier'] = 'expired'
            item['tier_label'] = 'EXPIRED'
            item['urgency'] = 'critical'
            expired.append(item)
        elif days_left <= 30:
            item['status'] = 'due'
            item['tier'] = '30'
            item['tier_label'] = '≤30 DAYS (CRITICAL)'
            item['urgency'] = 'critical'
            tier_30.append(item)
        elif days_left <= 60:
            item['status'] = 'due'
            item['tier'] = '60'
            item['tier_label'] = '60 DAYS NOTICE'
            item['urgency'] = 'warning'
            tier_60.append(item)
        else:
            item['status'] = 'soon'
            item['tier'] = '90'
            item['tier_label'] = '90 DAYS ADVANCE'
            item['urgency'] = 'info'
            tier_90.append(item)

    all_urgent = expired + tier_30 + tier_60 + tier_90

    return {
        'today': today.strftime('%d.%m.%Y'),
        'window_days': max_days,
        'schedule_tiers': [30, 60, 90],
        'expired': expired,
        'tier_30': tier_30,
        'tier_60': tier_60,
        'tier_90': tier_90,
        'all_urgent': all_urgent,
        'total_urgent': len(all_urgent),
        'expired_count': len(expired),
        'tier_30_count': len(tier_30),
        'tier_60_count': len(tier_60),
        'tier_90_count': len(tier_90),
    }


def render_license_alert_html(data):
    """
    Builds a professional, responsive HTML email for the automated 30, 60 & 90 days
    lift compliance alert schedule.
    """
    total_urgent = data['total_urgent']
    expired_count = data['expired_count']
    tier_30_count = data['tier_30_count']
    tier_60_count = data['tier_60_count']
    tier_90_count = data['tier_90_count']

    rows_html = ""
    index = 1
    for item in data['all_urgent']:
        tier = item['tier']
        days_left = item['days_left']

        if tier == 'expired':
            badge_bg = '#dc2626'
            badge_text = f"EXPIRED ({abs(days_left)}d ago)"
            row_bg = '#fff5f5'
            till_color = '#dc2626'
        elif tier == '30':
            badge_bg = '#b91c1c'
            badge_text = f"🚨 ≤30d NOTICE ({days_left}d left)" if days_left > 0 else "EXPIRES TODAY"
            row_bg = '#fef2f2'
            till_color = '#b91c1c'
        elif tier == '60':
            badge_bg = '#d97706'
            badge_text = f"⚠️ 60d NOTICE ({days_left}d left)"
            row_bg = '#fffbeb'
            till_color = '#b45309'
        else:
            badge_bg = '#2563eb'
            badge_text = f"ℹ️ 90d ADVANCE ({days_left}d left)"
            row_bg = '#ffffff'
            till_color = '#1d4ed8'

        rows_html += f"""
        <tr style="background-color: {row_bg}; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 12px; font-size: 13px; text-align: center; color: #6b7280;">{index}</td>
            <td style="padding: 10px 12px; font-size: 12px;">
                <span style="background-color: {badge_bg}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block; white-space: nowrap;">
                    {badge_text}
                </span>
            </td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #111827;">{item['lift']}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #374151;">{item['loc']}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-family: monospace; color: #1f2937;">{item['no']}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #4b5563;">{item['prov']}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: {till_color};">{item['till']}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #374151;">{item['eng']}</td>
        </tr>
        """
        index += 1

    server_ip = getattr(settings, 'SERVER_IP', 'localhost')
    admin_url = f"http://{server_ip}:5173/admin/lifts" if server_ip in ('localhost', '127.0.0.1') else f"https://{server_ip}:9443/admin/lifts"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Elevator License Compliance Alert</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px;">
        <div style="max-width: 860px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%); padding: 24px 28px; color: #ffffff;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; opacity: 0.9; margin-bottom: 6px;">
                    IITGN Campus Infrastructure & Estate Maintenance &bull; Automated Alert System
                </div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                    Elevator License Compliance Alert
                </h1>
                <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95;">
                    Automated Multi-Tier Notice: <strong>{total_urgent} elevator license(s)</strong> require renewal action across your automated <strong>30, 60 & 90 Days</strong> schedule.
                </p>
            </div>

            <!-- Summary KPI Cards across 30, 60, 90 tiers -->
            <div style="padding: 18px 24px 12px 24px; display: flex; gap: 12px; flex-wrap: wrap; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <div style="flex: 1; min-width: 130px; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #fee2e2; border-left: 4px solid #dc2626;">
                    <div style="font-size: 11px; color: #991b1b; font-weight: 700; text-transform: uppercase;">Overdue / Expired</div>
                    <div style="font-size: 22px; font-weight: 800; color: #991b1b; margin-top: 4px;">{expired_count}</div>
                    <div style="font-size: 11px; color: #991b1b; margin-top: 2px;">Action Immediate</div>
                </div>
                <div style="flex: 1; min-width: 130px; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #fee2e2; border-left: 4px solid #b91c1c;">
                    <div style="font-size: 11px; color: #991b1b; font-weight: 700; text-transform: uppercase;">&le; 30 Days Notice</div>
                    <div style="font-size: 22px; font-weight: 800; color: #b91c1c; margin-top: 4px;">{tier_30_count}</div>
                    <div style="font-size: 11px; color: #991b1b; margin-top: 2px;">Critical Tier</div>
                </div>
                <div style="flex: 1; min-width: 130px; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #fef3c7; border-left: 4px solid #d97706;">
                    <div style="font-size: 11px; color: #92400e; font-weight: 700; text-transform: uppercase;">31–60 Days Notice</div>
                    <div style="font-size: 22px; font-weight: 800; color: #b45309; margin-top: 4px;">{tier_60_count}</div>
                    <div style="font-size: 11px; color: #92400e; margin-top: 2px;">Inspection Tier</div>
                </div>
                <div style="flex: 1; min-width: 130px; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #dbeafe; border-left: 4px solid #2563eb;">
                    <div style="font-size: 11px; color: #1e40af; font-weight: 700; text-transform: uppercase;">61–90 Days Notice</div>
                    <div style="font-size: 22px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">{tier_90_count}</div>
                    <div style="font-size: 11px; color: #1e40af; margin-top: 2px;">Advance Notice</div>
                </div>
            </div>

            <!-- Table of Lifts -->
            <div style="padding: 24px 28px; overflow-x: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 15px; color: #111827;">Action Required Lifts ({total_urgent} total)</h3>
                    <span style="font-size: 12px; color: #6b7280; font-weight: 600;">Automated Multi-Tier Expiry Schedule</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background-color: #f3f4f6; color: #4b5563; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                            <th style="padding: 10px 12px; text-align: center;">#</th>
                            <th style="padding: 10px 12px;">Urgency Tier</th>
                            <th style="padding: 10px 12px;">Lift Identifier</th>
                            <th style="padding: 10px 12px;">Location</th>
                            <th style="padding: 10px 12px;">License No.</th>
                            <th style="padding: 10px 12px;">OEM Provider</th>
                            <th style="padding: 10px 12px;">Valid Till</th>
                            <th style="padding: 10px 12px;">Contact</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>
            </div>

            <!-- CTA Section -->
            <div style="padding: 20px 28px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                <a href="{admin_url}" style="background-color: #991b1b; color: #ffffff; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                    Open Lift Compliance Dashboard &rarr;
                </a>
            </div>

            <!-- Footer -->
            <div style="padding: 18px 28px; background-color: #ffffff; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; line-height: 1.5;">
                <p style="margin: 0;">
                    <strong>Automated Schedule:</strong> Alerts are automatically dispatched to designated engineers at <strong>90 days, 60 days, and 30 days</strong> before elevator license expiry.
                </p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">
                    Generated on {data['today']} &bull; Recipient: Designated Campus Electrical & Lift Engineers
                </p>
            </div>

        </div>
    </body>
    </html>
    """
    return html


def send_lift_expiry_alert(window_days=90, recipient=None, force=False):
    """
    Main function to fetch urgent licenses across the automated 30, 60 & 90 days
    schedule and dispatch the consolidated alert email.
    """
    active_config = None
    try:
        active_config = LiftComplianceSetting.get_active()
    except Exception:
        pass

    if not recipient:
        recipient = active_config.alert_email if active_config else getattr(
            settings, 'LIFT_ALERT_EMAIL', 'je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in'
        )

    # Normalize recipient(s) to a clean list of email strings
    if isinstance(recipient, (list, tuple)):
        recipients = [str(r).strip() for r in recipient if str(r).strip()]
    elif isinstance(recipient, str):
        recipients = [r.strip() for r in recipient.replace(';', ',').split(',') if r.strip()]
    else:
        recipients = [str(recipient).strip()]

    recipient_display = ', '.join(recipients) if recipients else 'je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in'

    target_window = int(window_days) if window_days is not None else 90
    data = get_urgent_licenses(window_days=target_window)

    if data['total_urgent'] == 0:
        logger.info(f"Lift License Alert: No licenses expiring within {target_window} days.")
        return {
            'sent': False,
            'message': f'No lift licenses expiring within {target_window} days.',
            'count': 0,
            'window_days': target_window,
        }

    today = date.today()

    # Deduplication: Ensure only 1 consolidated automated email is sent per day unless forced
    if not force and active_config:
        if active_config.last_alert_date == today:
            logger.info(f"Lift License Alert: Already sent today ({today}). Suppressing duplicate.")
            return {
                'sent': False,
                'already_sent': True,
                'message': f"Alert already sent today ({today}) to {recipient_display}. No duplicate sent.",
                'count': data['total_urgent'],
                'window_days': target_window,
            }

    cache_hash = hashlib.md5(f"{recipient_display}_multitier_{today.isoformat()}".encode('utf-8')).hexdigest()
    cache_key = f"lift_alert_sent_{cache_hash}"
    if not force and cache.get(cache_key):
        logger.info(f"Lift License Alert: Already sent today to {recipient_display} (cached).")
        return {
            'sent': False,
            'already_sent': True,
            'message': f'Alert already sent today to {recipient_display}.',
            'count': data['total_urgent'],
            'window_days': target_window,
        }

    subject = f"[Action Required] IITGN Elevator License Alert: {data['total_urgent']} Lifts (30, 60 & 90 Days Notice)"
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'IITGN Elevator Compliance <works@iitgn.ac.in>')
    html_content = render_license_alert_html(data)
    text_content = strip_tags(html_content)

    # Save preview copy for debugging & verification
    try:
        preview_dir = os.path.join(settings.BASE_DIR, 'media', 'email_previews')
        os.makedirs(preview_dir, exist_ok=True)
        preview_path = os.path.join(preview_dir, 'latest_lift_alert.html')
        with open(preview_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
    except Exception as e:
        logger.warning(f"Failed to save email preview: {e}")

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=recipients,
            reply_to=['noreply@iitgn.ac.in'],
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        cache.set(cache_key, True, timeout=86400)

        if active_config:
            from django.utils import timezone
            active_config.last_alert_sent_at = timezone.now()
            active_config.last_alert_date = today
            active_config.last_alert_window = target_window
            active_config.save(update_fields=['last_alert_sent_at', 'last_alert_date', 'last_alert_window'])

        logger.info(f"Lift License Alert: Successfully sent automated alert to {recipient_display} ({data['total_urgent']} lifts across 30, 60, 90d schedule).")
        return {
            'sent': True,
            'recipient': recipient_display,
            'recipients': recipients,
            'count': data['total_urgent'],
            'window_days': target_window,
            'tier_breakdown': {
                'expired': data['expired_count'],
                '30_days': data['tier_30_count'],
                '60_days': data['tier_60_count'],
                '90_days': data['tier_90_count'],
            },
            'message': f"Automated 30/60/90 days alert successfully sent to {recipient_display} for {data['total_urgent']} expiring lifts.",
        }

    except Exception as exc:
        logger.error(f"Failed to send lift alert email to {recipient_display}: {exc}")
        return {
            'sent': False,
            'recipient': recipient_display,
            'recipients': recipients,
            'count': data['total_urgent'],
            'error': str(exc),
            'message': f"Failed to send email via SMTP: {exc}",
            'preview_saved': True,
        }


def check_and_send_daily_alerts(force=False):
    """
    Automated hook: Checks if today's 30/60/90 days alert has been sent.
    If not already sent today, sends it automatically.
    """
    from .models import LiftComplianceSetting
    today = date.today()
    try:
        config = LiftComplianceSetting.get_active()
        if not force and config.last_alert_date == today:
            return {'sent': False, 'already_sent': True, 'message': 'Already sent today.'}
    except Exception:
        pass
    return send_lift_expiry_alert(window_days=90, force=force)
