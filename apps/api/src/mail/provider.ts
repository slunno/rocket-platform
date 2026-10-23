import nodemailer from 'nodemailer';
import { env } from '../env.js';

export type PasswordResetMessage = {
  email: string;
  displayName: string;
  resetUrl: string;
};

export interface MailProvider {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });

export class LogMailProvider implements MailProvider {
  async sendPasswordReset(message: PasswordResetMessage) {
    console.info(`[mail:log] link de recuperação para ${message.email}: ${message.resetUrl}`);
  }
}

export class SmtpMailProvider implements MailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  async sendPasswordReset(message: PasswordResetMessage) {
    const displayName = escapeHtml(message.displayName);
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.email,
      subject: 'Redefina sua senha do Rocket',
      text: `Olá, ${message.displayName}. Use este link para redefinir sua senha: ${message.resetUrl}`,
      html: `<p>Olá, ${displayName}.</p><p><a href="${escapeHtml(message.resetUrl)}">Redefinir senha</a></p><p>O link expira em 20 minutos e pode ser usado uma única vez.</p>`,
    });
  }
}

export const mailProvider: MailProvider =
  env.MAIL_PROVIDER === 'smtp' ? new SmtpMailProvider() : new LogMailProvider();
