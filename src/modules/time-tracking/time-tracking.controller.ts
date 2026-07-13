import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TimeTrackingService } from './time-tracking.service';
import { StartTimerDto, StopTimerDto, ManualTimeEntryDto } from './dto/time-tracking.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Time Tracking')
@ApiBearerAuth()
@Controller('api/time-tracking')
export class TimeTrackingController {
  constructor(private readonly service: TimeTrackingService) {}

  @Post('start') @ApiOperation({ summary: 'Start timer' })
  start(@CurrentUser('id') userId: string, @Body() dto: StartTimerDto) { return this.service.startTimer(userId, dto); }

  @Post('stop') @ApiOperation({ summary: 'Stop timer' })
  stop(@CurrentUser('id') userId: string, @Body() dto: StopTimerDto) { return this.service.stopTimer(userId, dto.entryId); }

  @Get('running') @ApiOperation({ summary: 'Get running timer' })
  getRunning(@CurrentUser('id') userId: string) { return this.service.getRunningTimer(userId); }

  @Post('manual') @ApiOperation({ summary: 'Create manual time entry' })
  manual(@CurrentUser('id') userId: string, @Body() dto: ManualTimeEntryDto) { return this.service.createManualEntry(userId, dto); }

  @Get() @ApiOperation({ summary: 'List time entries' })
  findAll(@CurrentUser('id') userId: string, @Query() query: PaginationDto) { return this.service.findAll(userId, query); }

  @Delete(':id') @ApiOperation({ summary: 'Delete time entry' })
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.service.delete(userId, id); }

  @Get('stats') @ApiOperation({ summary: 'Get productivity stats' })
  stats(@CurrentUser('id') userId: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.service.getProductivityStats(userId, startDate, endDate); }
}
