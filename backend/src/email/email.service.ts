import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';

type SendTextEmailInput = {
  to: string;
  subject: string;
  textBody: string;
  replyTo?: string | null;
  from?: string | null;
};

export type EmailSender = {
  sendTextEmail(input: SendTextEmailInput): Promise<{ success: boolean }>;
};

@Injectable()
export class EmailService implements EmailSender {
  private readonly logger = new Logger(EmailService.name);
  private smtpTransporter: Transporter | null = null;

  async sendTextEmail(input: SendTextEmailInput) {
    const provider = (process.env.EMAIL_PROVIDER?.trim() || 'resend').toLowerCase();
    const from =
      input.from?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim();
    if (!from) {
      this.logger.error('EMAIL_FROM is missing');
      throw new BadGatewayException('Email service is not configured');
    }

    if (provider === 'resend') return this.sendWithResend(input, from);
    if (provider === 'smtp') return this.sendWithSmtp(input, from);

    this.logger.error(`Unknown EMAIL_PROVIDER: ${provider}`);
    throw new BadGatewayException('Email service is not configured');
  }

  private async sendWithResend(input: SendTextEmailInput, from: string) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      this.logger.error('RESEND_API_KEY is missing');
      throw new BadGatewayException('Email service is not configured');
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.textBody,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      this.logger.error(`Resend failed: ${error.message}`);
      throw new BadGatewayException('Failed to deliver email');
    }

    return { success: true };
  }

  private async sendWithSmtp(input: SendTextEmailInput, from: string) {
    const transporter = this.getSmtpTransporter();

    try {
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.textBody,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      });
    } catch (error) {
      this.logger.error(
        `SMTP failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadGatewayException('Failed to deliver email');
    }

    return { success: true };
  }

  private getSmtpTransporter() {
    if (this.smtpTransporter) return this.smtpTransporter;

    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      this.logger.error('SMTP_HOST is missing');
      throw new BadGatewayException('Email service is not configured');
    }

    const port = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
    const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase();
    const secure = secureRaw ? secureRaw === 'true' : port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS ?? '';

    this.smtpTransporter = createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
    return this.smtpTransporter;
  }
}
