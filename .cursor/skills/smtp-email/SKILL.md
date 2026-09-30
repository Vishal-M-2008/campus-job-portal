---
name: smtp-email
description: Sends transactional email through a generic SMTP adapter with a Twilio stub and Mailpit in development. Use when editing mail, notifications, or password reset.
---

# Email

Interface `Mailer.send({ to, subject, text })`.

- `console` mailer when `MAIL_MODE=console` (default for tests).
- `smtp` via nodemailer when `MAIL_MODE=smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`). Mailpit listens on 1025 locally.
- `twilio` stub when `MAIL_MODE=twilio`. It records the payload and does not call Twilio unless `TWILIO_LIVE=true`. There is no SMS product path.

Events: application received, job approved, status change, interview scheduled, password reset, interview reschedule. Do not log message bodies that contain tokens. Log the template name and request id.
