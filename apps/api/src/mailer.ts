import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; template: string };

export const sentMail: MailMessage[] = [];

export async function sendMail(message: MailMessage) {
  sentMail.push({ to: message.to, subject: message.subject, text: "", template: message.template });
  const mode = process.env.MAIL_MODE ?? "console";
  if (mode === "smtp") {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "portal@example.com",
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
  if (mode === "twilio" && process.env.TWILIO_LIVE === "true") {
    throw new Error("twilio_live_not_enabled_in_this_build");
  }
}
