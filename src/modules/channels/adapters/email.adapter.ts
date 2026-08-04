import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { ChannelCredentials, IChannelAdapter, PublishPayload, PublishResult } from '../channel.types';

/**
 * Outbound email via SMTP (reuses Flow's existing SMTP configuration).
 * Agent-drafted emails go through the orchestrator's hold-buffer before this is called.
 */
@Injectable()
export class EmailAdapter implements IChannelAdapter {
  readonly channel = PublishChannel.EMAIL;
  private readonly logger = new Logger(EmailAdapter.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('mail.port') || 465;
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mail.host'),
      port,
      secure: port === 465,
      auth: {
        user: this.configService.get<string>('mail.user'),
        pass: this.configService.get<string>('mail.password'),
      },
      // Hard timeouts so health checks and sends never hang the caller
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
    });
  }

  async publish(payload: PublishPayload, credentials: ChannelCredentials | null): Promise<PublishResult> {
    if (!payload.toAddress) return { success: false, error: 'Email requires a toAddress' };
    const from = credentials?.externalId || this.configService.get<string>('mail.from') || 'noreply@flow.dev';
    try {
      const info = await this.transporter.sendMail({
        from,
        to: payload.toAddress,
        subject: payload.subject || payload.title || '(no subject)',
        html: (payload.body || payload.caption || '').replace(/\n/g, '<br/>'),
      });
      this.logger.log(`Email sent to ${payload.toAddress}`);
      return { success: true, externalPostId: info.messageId };
    } catch (err: any) {
      return { success: false, error: `SMTP send failed: ${err.message}` };
    }
  }

  async verify(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await Promise.race([
        this.transporter.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP verify timed out (8s)')), 8_000)),
      ]);
      return { ok: true, detail: 'SMTP connection verified' };
    } catch (err: any) {
      return { ok: false, detail: `SMTP verify failed: ${err.message}` };
    }
  }
}
