import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host') || 'smtp.resend.com';
    const port = this.configService.get<number>('mail.port') || 465;
    const user = this.configService.get<string>('mail.user') || 'resend';
    const password = this.configService.get<string>('mail.password');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass: password,
      },
    });
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    const from = this.configService.get<string>('mail.from') || 'noreply@flow.dev';
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email successfully sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    const link = `${frontendUrl}/verify-email?token=${token}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Verify your email address</h2>
        <p style="color: #334155; line-height: 1.6;">Thanks for signing up for Flow! Please click the link below to verify your email address and activate your account:</p>
        <p style="margin: 24px 0;"><a href="${link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);">Verify Email</a></p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Or copy and paste this URL into your browser:</p>
        <p style="color: #6366f1; font-size: 14px; word-break: break-all;">${link}</p>
      </div>
    `;
    return this.sendMail(to, 'Verify your email address - Flow', html);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    const link = `${frontendUrl}/forgot-password?token=${token}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Reset your password</h2>
        <p style="color: #334155; line-height: 1.6;">You requested to reset your password. Click the link below to set a new password:</p>
        <p style="margin: 24px 0;"><a href="${link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);">Reset Password</a></p>
        <p style="color: #64748b; font-size: 14px;">This link is valid for 1 hour.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Or copy and paste this URL into your browser:</p>
        <p style="color: #6366f1; font-size: 14px; word-break: break-all;">${link}</p>
      </div>
    `;
    return this.sendMail(to, 'Reset your password - Flow', html);
  }

  async sendMagicLinkEmail(to: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    const link = `${frontendUrl}/magic-link?token=${token}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Sign in to Flow</h2>
        <p style="color: #334155; line-height: 1.6;">Click the link below to sign in to your Flow account without a password:</p>
        <p style="margin: 24px 0;"><a href="${link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);">Sign In</a></p>
        <p style="color: #64748b; font-size: 14px;">This link is valid for 10 minutes.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Or copy and paste this URL into your browser:</p>
        <p style="color: #6366f1; font-size: 14px; word-break: break-all;">${link}</p>
      </div>
    `;
    return this.sendMail(to, 'Sign in to Flow', html);
  }
}
