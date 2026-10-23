import nodemailer from 'nodemailer';
import { env } from '../env.js';

export type PasswordResetMessage = {
  email: string;
  displayName: string;
  resetUrl: string;
};

export type WorkspaceInviteMessage = {
  email: string;
  inviterName: string;
  workspaceName: string;
  teamName?: string;
  role: 'MEMBER' | 'GUEST';
  inviteUrl: string;
  expiresAt: Date;
};

export interface MailProvider {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
  sendWorkspaceInvite(message: WorkspaceInviteMessage): Promise<void>;
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

  async sendWorkspaceInvite(message: WorkspaceInviteMessage) {
    console.info(`[mail:log] convite do espaço para ${message.email}: ${message.inviteUrl}`);
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

  async sendWorkspaceInvite(message: WorkspaceInviteMessage) {
    const inviterName = escapeHtml(message.inviterName);
    const workspaceName = escapeHtml(message.workspaceName);
    const teamLine = message.teamName ? `Equipe: ${message.teamName}. ` : '';
    const expiry = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(message.expiresAt);
    const roleLabel = message.role === 'GUEST' ? 'convidado' : 'membro';
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.email,
      subject: `Convite para ${message.workspaceName} no Rocket`,
      text: `Olá! ${message.inviterName} convidou você como ${roleLabel} para ${message.workspaceName}. ${teamLine}Aceite o convite: ${message.inviteUrl}. O link expira em ${expiry}.`,
      html: `<p>Olá!</p><p><strong>${inviterName}</strong> convidou você como ${roleLabel} para <strong>${workspaceName}</strong>${message.teamName ? ` na equipe <strong>${escapeHtml(message.teamName)}</strong>` : ''}.</p><p><a href="${escapeHtml(message.inviteUrl)}">Aceitar convite</a></p><p>O link expira em ${escapeHtml(expiry)}.</p>`,
    });
  }
}

export const mailProvider: MailProvider =
  env.MAIL_PROVIDER === 'smtp' ? new SmtpMailProvider() : new LogMailProvider();
