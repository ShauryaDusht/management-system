"""
Automated Handover Notification System (No-Reply)
Handles automated department handover email alerts for IITGN Housing Clearance workflow.

Safety & Constraints:
- Email sending is disabled by default via EstateSettings.enable_email_alerts.
- If test_recipient_email is configured, all alerts are redirected strictly to that test address.
- Strictly sent as No-Reply (noreply@iitgn.ac.in, Reply-To: noreply@iitgn.ac.in).
- Fully non-blocking execution via background thread with graceful error handling.
"""

import logging
import threading
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

logger = logging.getLogger(__name__)

# Handover Event Types
EVENT_ESTATE_TO_CIVIL = 'estate_to_civil'
EVENT_CIVIL_TO_ELECTRICAL = 'civil_to_electrical'
EVENT_ELECTRICAL_TO_HK = 'electrical_to_hk'
EVENT_HK_TO_ESTATE = 'hk_to_estate'
EVENT_ESTATE_ALLOTTED = 'estate_allotted'

EVENT_DETAILS = {
    EVENT_ESTATE_TO_CIVIL: {
        'title': 'Key Handed Over to Civil Team',
        'from_dept': 'Estate Office',
        'to_dept': 'Civil Team',
        'action_required': 'Civil Inspection & Renovation Works',
        'badge_color': '#2563eb',  # Blue
    },
    EVENT_CIVIL_TO_ELECTRICAL: {
        'title': 'Civil Clearance Complete -> Handover to Electrical',
        'from_dept': 'Civil Team',
        'to_dept': 'Electrical Team',
        'action_required': 'Electrical Inspection, Wiring & Fitting Checks',
        'badge_color': '#059669',  # Green
    },
    EVENT_ELECTRICAL_TO_HK: {
        'title': 'Electrical Clearance Complete -> Handover to Housekeeping',
        'from_dept': 'Electrical Team',
        'to_dept': 'Housekeeping Team',
        'action_required': 'Deep Cleaning, Sanitization & Housekeeping Inventory Prep',
        'badge_color': '#7c3aed',  # Purple
    },
    EVENT_HK_TO_ESTATE: {
        'title': 'All Clearances Finished -> Ready for Allotment',
        'from_dept': 'Housekeeping Team',
        'to_dept': 'Estate Office',
        'action_required': 'Final Verification & Housing Allotment Order Issue',
        'badge_color': '#d97706',  # Amber
    },
    EVENT_ESTATE_ALLOTTED: {
        'title': 'Housing Unit Officially Allotted',
        'from_dept': 'Estate Office',
        'to_dept': 'Occupant & Department Teams',
        'action_required': 'Possession & Meter Reading Verification',
        'badge_color': '#0d9488',  # Teal
    },
}


def _build_html_email(clearance, event_type, event_info, actor_name, remarks, is_test=False, target_dept=''):
    house_no = escape(str(clearance.house_no or 'N/A'))
    house_type = escape(str(clearance.house_type or 'N/A'))
    priority = escape(str(clearance.priority or 'Standard'))
    remarks_safe = escape(str(remarks or 'No specific remarks recorded.'))
    actor_safe = escape(str(actor_name or event_info['from_dept']))

    test_banner = ""
    if is_test:
        test_banner = """
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 13px; font-weight: 600;">
            TEST MODE ACTIVE: This email alert is redirected for testing verification. No real staff were emailed.
        </div>
        """

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{event_info['title']}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 10px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">

        <!-- Header -->
        <tr>
          <td style="background-color: #0f2b48; padding: 24px 28px; text-align: left;">
            <div style="color: #93c5fd; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">
              IIT Gandhinagar &bull; Estate Management Portal
            </div>
            <div style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 6px;">
              Department Handover Alert
            </div>
            <div style="display: inline-block; background-color: rgba(255,255,255,0.12); color: #f8fafc; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; margin-top: 8px;">
              [AUTOMATED NO-REPLY NOTIFICATION]
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 28px;">
            {test_banner}

            <!-- Event Header Card -->
            <div style="background-color: #f8fafc; border-left: 4px solid {event_info['badge_color']}; padding: 14px 18px; border-radius: 4px; margin-bottom: 24px;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
                {event_info['title']}
              </div>
              <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                Action Required by: <strong style="color: #1e293b;">{event_info['to_dept']}</strong>
              </div>
            </div>

            <!-- Quarter Details Table -->
            <table role="presentation" width="100%" style="border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b; width: 40%;">Quarter / House No:</td>
                <td style="padding: 10px 0; font-weight: 700; color: #0f172a; font-size: 16px;">{house_no} ({house_type})</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b;">Current Priority:</td>
                <td style="padding: 10px 0; font-weight: 600; color: #b45309;">Priority {priority}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b;">Handed Over By:</td>
                <td style="padding: 10px 0; font-weight: 600; color: #334155;">{actor_safe} ({event_info['from_dept']})</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b;">Next Action Assigned:</td>
                <td style="padding: 10px 0; font-weight: 600; color: {event_info['badge_color']};">{event_info['action_required']}</td>
              </tr>
            </table>

            <!-- Remarks Box -->
            <div style="margin-bottom: 24px;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px;">
                Department Remarks / Notes:
              </div>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #334155; line-height: 1.6; font-style: italic;">
                "{remarks_safe}"
              </div>
            </div>

            <!-- Portal Notice -->
            <div style="text-align: center; margin: 30px 0 10px 0;">
              <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
                Please log in to the Estate Management Portal to review the clearance details and update progress.
              </div>
            </div>

            <!-- No-Reply Warning Box -->
            <div style="background-color: #f1f5f9; border-radius: 6px; padding: 12px 14px; margin-top: 24px; font-size: 12px; color: #64748b; text-align: center;">
              <strong>NO-REPLY NOTICE:</strong> This is a system-generated alert sent from an unattended mailbox (noreply@iitgn.ac.in). Replies to this message will not be read or answered.
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.6;">
            Estate Office &bull; Indian Institute of Technology Gandhinagar<br>
            Palaj, Gandhinagar - 382355, Gujarat, India<br>
            Estate Portal Clearance & Allotment Automation Service
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
"""
    return html


def _send_email_thread(subject, text_content, html_content, recipient_list):
    """Internal helper to dispatch email safely in background thread."""
    try:
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'IITGN Estate Office <noreply@iitgn.ac.in>')
        no_reply_email = getattr(settings, 'NO_REPLY_EMAIL', 'noreply@iitgn.ac.in')

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=recipient_list,
            reply_to=[no_reply_email],
            headers={
                'X-Auto-Response-Suppress': 'All',
                'Precedence': 'bulk',
                'Auto-Submitted': 'auto-generated',
            }
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)
        logger.info(f"[Clearance Email Alert] Successfully sent '{subject}' to {recipient_list}")
    except Exception as e:
        logger.warning(f"[Clearance Email Alert] Could not send email alert: {e}")


def send_handover_alert(clearance, event_type, actor=None, custom_remarks=None):
    """
    Sends an automated, strictly no-reply email notification upon department handover.

    Checks:
    1. If EstateSettings.enable_email_alerts is False, exits immediately without sending.
    2. If EstateSettings.test_recipient_email is set, sends ONLY to test_recipient_email.
    3. Runs asynchronously in a daemon thread with zero UI delay.
    """
    from apps.estate_billing.models import EstateSettings

    try:
        estate_settings = EstateSettings.get_settings()
    except Exception as e:
        logger.warning(f"[Clearance Email Alert] Could not load EstateSettings: {e}")
        return

    # User constraint: emails disabled by default
    if not estate_settings.enable_email_alerts:
        logger.debug("[Clearance Email Alert] Email alerts are disabled in Estate Settings. Skipping.")
        return

    event_info = EVENT_DETAILS.get(event_type)
    if not event_info:
        logger.warning(f"[Clearance Email Alert] Unknown event_type '{event_type}'")
        return

    # Department-level alert opt-out check
    if event_type == EVENT_ESTATE_TO_CIVIL:
        if not getattr(estate_settings, 'enable_civil_alerts', True):
            logger.info(f"[Clearance Email Alert] Civil Team email alerts are turned OFF. Skipping alert for Quarter {clearance.house_no}.")
            return
    elif event_type == EVENT_CIVIL_TO_ELECTRICAL:
        if not getattr(estate_settings, 'enable_electrical_alerts', True):
            logger.info(f"[Clearance Email Alert] Electrical Team email alerts are turned OFF. Skipping alert for Quarter {clearance.house_no}.")
            return
    elif event_type == EVENT_ELECTRICAL_TO_HK:
        if not getattr(estate_settings, 'enable_hk_alerts', True):
            logger.info(f"[Clearance Email Alert] Housekeeping email alerts are turned OFF. Skipping alert for Quarter {clearance.house_no}.")
            return
    elif event_type == EVENT_HK_TO_ESTATE:
        if not getattr(estate_settings, 'enable_estate_alerts', True):
            logger.info(f"[Clearance Email Alert] Estate Office email alerts are turned OFF. Skipping alert for Quarter {clearance.house_no}.")
            return
    elif event_type == EVENT_ESTATE_ALLOTTED:
        # Quarter is officially allotted; no further handover email alert is sent
        logger.info(f"[Clearance Email Alert] Quarter {clearance.house_no} officially allotted. No alert email required.")
        return

    # Determine recipient email(s)
    recipients = []
    test_mode = False

    # Safe testing override
    if estate_settings.test_recipient_email and estate_settings.test_recipient_email.strip():
        recipients = [e.strip() for e in estate_settings.test_recipient_email.split(',') if e.strip()]
        test_mode = True
    else:
        # Department target mapping (Configured directly in .env)
        civil_email = getattr(settings, 'CIVIL_ALERT_EMAIL', '').strip() or getattr(estate_settings, 'civil_alert_email', '').strip()
        elec_email = getattr(settings, 'ELECTRICAL_ALERT_EMAIL', '').strip() or getattr(estate_settings, 'electrical_alert_email', '').strip()
        hk_email = getattr(settings, 'HK_ALERT_EMAIL', '').strip() or getattr(estate_settings, 'hk_alert_email', '').strip()
        estate_email = getattr(settings, 'ESTATE_ALERT_EMAIL', '').strip() or getattr(estate_settings, 'estate_alert_email', '').strip()

        def _parse_emails(val):
            if not val:
                return []
            return [e.strip() for e in str(val).split(',') if e.strip() and '@' in e]

        if event_type == EVENT_ESTATE_TO_CIVIL:
            recipients.extend(_parse_emails(civil_email))
        elif event_type == EVENT_CIVIL_TO_ELECTRICAL:
            recipients.extend(_parse_emails(elec_email))
        elif event_type == EVENT_ELECTRICAL_TO_HK:
            recipients.extend(_parse_emails(hk_email))
        elif event_type == EVENT_HK_TO_ESTATE:
            recipients.extend(_parse_emails(estate_email))

    # Filter out empty or placeholder entries and deduplicate
    seen = set()
    cleaned_recipients = []
    for r in recipients:
        r_clean = r.strip()
        if r_clean and '@' in r_clean and r_clean.lower() not in seen:
            seen.add(r_clean.lower())
            cleaned_recipients.append(r_clean)
    recipients = cleaned_recipients
    if not recipients:
        logger.info(f"[Clearance Email Alert] No valid recipient email configured for event '{event_type}'. Skipping.")
        return

    # Determine remarks to display
    remarks = custom_remarks
    if not remarks:
        if event_type == EVENT_CIVIL_TO_ELECTRICAL:
            remarks = clearance.civil_remarks or clearance.remarks
        elif event_type == EVENT_ELECTRICAL_TO_HK:
            remarks = clearance.electrical_remarks or clearance.remarks
        elif event_type == EVENT_HK_TO_ESTATE:
            remarks = clearance.hk_remarks or clearance.remarks
        elif event_type == EVENT_ESTATE_TO_CIVIL:
            remarks = clearance.estate_remarks or clearance.remarks
        elif event_type == EVENT_ESTATE_ALLOTTED:
            remarks = clearance.estate_remarks or clearance.remarks

    actor_name = ""
    if actor:
        actor_name = getattr(actor, 'get_full_name', lambda: '')() or getattr(actor, 'username', '')

    subject_prefix = "[NO-REPLY]"
    if test_mode:
        subject_prefix += " [TEST ALERT]"
    subject = f"{subject_prefix} IITGN Housing Handover: Quarter {clearance.house_no} -> {event_info['to_dept']}"

    text_content = (
        f"{event_info['title']}\n"
        f"Quarter: {clearance.house_no} ({clearance.house_type})\n"
        f"From: {event_info['from_dept']}\n"
        f"To: {event_info['to_dept']}\n"
        f"Action: {event_info['action_required']}\n"
        f"Remarks: {remarks or 'None'}\n\n"
        f"PLEASE DO NOT REPLY TO THIS EMAIL. This is an automated message."
    )

    html_content = _build_html_email(
        clearance=clearance,
        event_type=event_type,
        event_info=event_info,
        actor_name=actor_name,
        remarks=remarks,
        is_test=test_mode,
        target_dept=event_info['to_dept']
    )

    thread = threading.Thread(
        target=_send_email_thread,
        args=(subject, text_content, html_content, recipients),
        daemon=True
    )
    thread.start()


def send_test_email(recipient_email, triggered_by=None):
    """
    Sends a test verification email to confirm Gmail SMTP setup.
    Enforces No-Reply sender and recipient constraints.
    """
    recipient_email = (recipient_email or '').strip()
    if not recipient_email or '@' not in recipient_email:
        return False, "Invalid recipient email address."

    subject = "[NO-REPLY] [TEST] IITGN Estate Notification System Verification"
    actor_str = getattr(triggered_by, 'username', 'Administrator')

    text_content = (
        "This is a test notification from the IITGN Estate Clearance Management System.\n"
        "Your automated No-Reply email notifications are successfully configured and ready.\n\n"
        "Please do not reply to this email."
    )

    html_content = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f1f5f9; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: #0f2b48; padding: 20px 24px;">
      <div style="color: #93c5fd; font-size: 11px; font-weight: 700; letter-spacing: 1.5px;">IIT GANDHINAGAR &bull; ESTATE OFFICE</div>
      <div style="color: #ffffff; font-size: 18px; font-weight: 700; margin-top: 4px;">Email Notification System Test</div>
      <div style="display: inline-block; background: rgba(255,255,255,0.15); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-top: 6px;">[NO-REPLY AUTOMATED]</div>
    </div>
    <div style="padding: 24px;">
      <div style="background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 12px 16px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 16px;">
        SMTP Connection & Delivery Verified Successfully!
      </div>
      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        This test email confirms that your outgoing mail server configuration is active and can deliver automated clearance handover alerts.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b;">Triggered By:</td>
          <td style="padding: 8px 0; font-weight: 600;">{escape(actor_str)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b;">Sender Identity:</td>
          <td style="padding: 8px 0; font-weight: 600;">IITGN Estate Office &lt;noreply@iitgn.ac.in&gt;</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Reply-To:</td>
          <td style="padding: 8px 0; font-weight: 600;">noreply@iitgn.ac.in (Unattended)</td>
        </tr>
      </table>
      <div style="background-color: #f8fafc; border-radius: 6px; padding: 12px; font-size: 12px; color: #64748b; text-align: center; margin-top: 20px;">
        <strong>Notice:</strong> Please do not reply to this email.
      </div>
    </div>
  </div>
</body>
</html>
"""

    try:
        thread = threading.Thread(
            target=_send_email_thread,
            args=(subject, text_content, html_content, [recipient_email]),
            daemon=True
        )
        thread.start()
        return True, "Test email queued for delivery."
    except Exception as e:
        return False, str(e)
