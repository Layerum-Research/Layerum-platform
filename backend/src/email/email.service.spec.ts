import { BadGatewayException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { Resend } from 'resend';
import { EmailService } from './email.service';

jest.mock('resend');
jest.mock('nodemailer');

describe('EmailService', () => {
  const MockResend = Resend as jest.MockedClass<typeof Resend>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    for (const name of [
      'EMAIL_PROVIDER',
      'EMAIL_FROM',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASS',
    ]) {
      delete process.env[name];
    }
  });

  it('sends email via Resend with correct params', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null });
    MockResend.mockImplementation(() => ({ emails: { send: sendMock } }) as unknown as Resend);

    const service = new EmailService();
    await service.sendTextEmail({
      to: 'user@example.com',
      subject: 'Hello',
      textBody: 'Body text',
      replyTo: 'sender@example.com',
    });

    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body text',
      replyTo: 'sender@example.com',
    });
  });

  it('uses the sender passed by the caller instead of the default one', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null });
    MockResend.mockImplementation(() => ({ emails: { send: sendMock } }) as unknown as Resend);

    await new EmailService().sendTextEmail({
      to: 'user@example.com',
      subject: 'Hello',
      textBody: 'Body text',
      from: 'alerts@example.com',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'alerts@example.com' }),
    );
  });

  it('throws BadGatewayException when Resend returns an error', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'invalid_to' } });
    MockResend.mockImplementation(() => ({ emails: { send: sendMock } }) as unknown as Resend);

    const service = new EmailService();
    await expect(
      service.sendTextEmail({ to: 'bad', subject: 'x', textBody: 'y' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws BadGatewayException when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const service = new EmailService();
    await expect(
      service.sendTextEmail({ to: 'u@e.com', subject: 'x', textBody: 'y' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  describe('smtp provider', () => {
    const mockCreateTransport = createTransport as jest.Mock;

    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'smtp';
      process.env.SMTP_HOST = 'smtp.example.com';
    });

    it('sends through nodemailer with defaults and no auth', async () => {
      const sendMail = jest.fn().mockResolvedValue({});
      mockCreateTransport.mockReturnValue({ sendMail });
      process.env.EMAIL_FROM = 'hello@example.com';

      await new EmailService().sendTextEmail({
        to: 'user@example.com',
        subject: 'Hello',
        textBody: 'Body',
        replyTo: 'r@example.com',
      });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
      });
      expect(sendMail).toHaveBeenCalledWith({
        from: 'hello@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Body',
        replyTo: 'r@example.com',
      });
    });

    it('uses secure and auth when configured and reuses the transporter', async () => {
      const sendMail = jest.fn().mockResolvedValue({});
      mockCreateTransport.mockReturnValue({ sendMail });
      process.env.SMTP_PORT = '465';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';

      const service = new EmailService();
      const input = { to: 'a@example.com', subject: 's', textBody: 'b' };
      await service.sendTextEmail(input);
      await service.sendTextEmail(input);

      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'user', pass: 'pass' },
      });
    });

    it('throws BadGatewayException when SMTP_HOST is missing', async () => {
      delete process.env.SMTP_HOST;
      await expect(
        new EmailService().sendTextEmail({ to: 'a@e.com', subject: 's', textBody: 'b' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws BadGatewayException when delivery fails', async () => {
      mockCreateTransport.mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('connect refused')),
      });
      await expect(
        new EmailService().sendTextEmail({ to: 'a@e.com', subject: 's', textBody: 'b' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  it('fails explicitly for an unknown EMAIL_PROVIDER', async () => {
    process.env.EMAIL_PROVIDER = 'carrier-pigeon';
    await expect(
      new EmailService().sendTextEmail({ to: 'a@e.com', subject: 's', textBody: 'b' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuses to send when no sender address is configured', async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const service = new EmailService();

    await expect(
      service.sendTextEmail({ to: 'user@example.com', subject: 'Hi', textBody: 'Hello' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(MockResend).not.toHaveBeenCalled();
  });
});
