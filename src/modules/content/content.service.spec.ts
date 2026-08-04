import { ForbiddenException } from '@nestjs/common';
import { ContentService } from './content.service';

/**
 * ContentService.generate() is the entry point behind both
 * `POST /api/content/generate` and its Bull job — the only other caller of
 * this same pipeline, agent-executor.service.ts, already checked the org
 * kill-switch and daily token budget before running a step, but this path
 * didn't check either, so an org could keep triggering billed
 * research/image/video generation after flipping its own kill-switch off, or
 * past its configured daily token budget. These tests assert the guard runs
 * — and, just as importantly, that it runs *before* any of the actual
 * pipeline stages (research, media generation, brand context) fire, since a
 * kill-switch that stops the record from saving but not the billed API calls
 * underneath it wouldn't fix the actual problem.
 */
describe('ContentService.generate — kill-switch and token budget guard', () => {
  const ORG_ID = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';

  let settingsService: { isHalted: jest.Mock; consumeTokenBudget: jest.Mock };
  let brandService: { buildBrandContext: jest.Mock };
  let researchService: { research: jest.Mock };
  let service: ContentService;

  beforeEach(() => {
    settingsService = {
      isHalted: jest.fn().mockResolvedValue(false),
      consumeTokenBudget: jest.fn().mockResolvedValue({ allowed: true, remaining: 1000 }),
    };
    // Only what generate() needs before it would reach the guard, plus enough
    // past it to prove the guard is what's under test, not a downstream
    // failure. Deliberately not a full pipeline double — that's scraper/
    // research/image/video's own test surface, not this one's.
    brandService = { buildBrandContext: jest.fn().mockResolvedValue('brand context') };
    researchService = {
      research: jest.fn().mockResolvedValue({
        topic: 't',
        summary: 's',
        facts: [],
        angle: 'a',
        audience: 'aud',
        keyPoints: [],
        sources: [],
        readPages: [],
        grounding: 'unverified',
      }),
    };

    service = new ContentService(
      {} as any, // prisma — unused before the guard short-circuits in the halted/over-budget tests
      brandService as any,
      {} as any, // channelsService
      settingsService as any,
      { generateImage: jest.fn() } as any,
      { generateVideo: jest.fn() } as any,
      researchService as any,
      { analyze: jest.fn() } as any,
      { server: undefined } as any, // gateway
      { generateText: jest.fn().mockResolvedValue('') } as any,
    );
  });

  it('refuses to run when the org kill-switch is active', async () => {
    settingsService.isHalted.mockResolvedValue(true);

    await expect(service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x' } as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(brandService.buildBrandContext).not.toHaveBeenCalled();
    expect(researchService.research).not.toHaveBeenCalled();
  });

  it('refuses to run when the daily token budget is exhausted', async () => {
    settingsService.consumeTokenBudget.mockResolvedValue({ allowed: false, remaining: 0 });

    await expect(service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x' } as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(brandService.buildBrandContext).not.toHaveBeenCalled();
  });

  it('checks the kill-switch before consuming any token budget', async () => {
    settingsService.isHalted.mockResolvedValue(true);

    await expect(service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x' } as any)).rejects.toThrow();
    expect(settingsService.consumeTokenBudget).not.toHaveBeenCalled();
  });

  it('proceeds into the pipeline once both checks pass', async () => {
    await service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x' } as any).catch(() => undefined);

    expect(settingsService.isHalted).toHaveBeenCalledWith(ORG_ID);
    expect(settingsService.consumeTokenBudget).toHaveBeenCalledWith(ORG_ID, expect.any(Number));
    expect(brandService.buildBrandContext).toHaveBeenCalledWith(ORG_ID);
  });

  it('reserves a larger token estimate for a video generation request than an image one', async () => {
    await service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x' } as any).catch(() => undefined);
    const imageEstimate = settingsService.consumeTokenBudget.mock.calls[0][1];

    settingsService.consumeTokenBudget.mockClear();
    await service.generate(ORG_ID, { channel: 'INSTAGRAM', topic: 'x', withVideo: true } as any).catch(() => undefined);
    const videoEstimate = settingsService.consumeTokenBudget.mock.calls[0][1];

    expect(videoEstimate).toBeGreaterThan(imageEstimate);
  });
});
