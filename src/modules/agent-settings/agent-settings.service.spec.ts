import { BadRequestException } from '@nestjs/common';
import { AgentSettingsService } from './agent-settings.service';

/**
 * `autoSendEmail` + an empty `emailAllowlist` means "send to anyone,
 * unsupervised" — exactly the shape a successful prompt injection (scraped
 * page content, an inbound email) can exploit through the agent's
 * `draft_email` tool, which lets an attacker-chosen `to` address ride along
 * with a real send. `update()` is the single place every settings change
 * flows through (the controller and the kill-switch endpoint both call it),
 * so it's the correct place to make that combination impossible to save.
 */
describe('AgentSettingsService.update — autoSendEmail / emailAllowlist guard', () => {
  const ORG_ID = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';

  let prisma: any;
  let service: AgentSettingsService;
  let currentSettings: { autoSendEmail: boolean; emailAllowlist: string[] };

  beforeEach(() => {
    currentSettings = { autoSendEmail: false, emailAllowlist: [] };
    prisma = {
      agentSettings: {
        upsert: jest.fn().mockImplementation(() => Promise.resolve(currentSettings)),
        update: jest.fn().mockImplementation((args: any) => {
          currentSettings = { ...currentSettings, ...args.data };
          return Promise.resolve(currentSettings);
        }),
      },
    };
    service = new AgentSettingsService(prisma);
  });

  it('rejects enabling autoSendEmail with no allowlist at all', async () => {
    await expect(service.update(ORG_ID, { autoSendEmail: true })).rejects.toThrow(BadRequestException);
    expect(prisma.agentSettings.update).not.toHaveBeenCalled();
  });

  it('rejects enabling autoSendEmail alongside an explicitly empty allowlist', async () => {
    await expect(
      service.update(ORG_ID, { autoSendEmail: true, emailAllowlist: [] }),
    ).rejects.toThrow(/non-empty emailAllowlist/);
  });

  it('rejects setting an empty allowlist onto a settings row that already has autoSendEmail on', async () => {
    currentSettings = { autoSendEmail: true, emailAllowlist: ['ceo@flow.dev'] };
    await expect(service.update(ORG_ID, { emailAllowlist: [] })).rejects.toThrow(BadRequestException);
  });

  it('allows enabling autoSendEmail once a non-empty allowlist is supplied in the same call', async () => {
    await expect(
      service.update(ORG_ID, { autoSendEmail: true, emailAllowlist: ['ceo@flow.dev'] }),
    ).resolves.toMatchObject({ autoSendEmail: true, emailAllowlist: ['ceo@flow.dev'] });
  });

  it('allows enabling autoSendEmail when an allowlist was already set on a previous call', async () => {
    currentSettings = { autoSendEmail: false, emailAllowlist: ['ceo@flow.dev'] };
    await expect(service.update(ORG_ID, { autoSendEmail: true })).resolves.toMatchObject({
      autoSendEmail: true,
    });
  });

  it('allows unrelated settings changes that leave autoSendEmail off', async () => {
    await expect(service.update(ORG_ID, { maxPostsPerDay: 5 })).resolves.toMatchObject({
      autoSendEmail: false,
    });
  });
});
