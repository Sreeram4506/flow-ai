import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { ConnectAccountDto } from './dto';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Channels (Social Accounts)')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/channels')
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Get('accounts') @ApiOperation({ summary: 'List connected accounts (tokens never returned)' })
  list(@OrgId() orgId: string) { return this.service.listAccounts(orgId); }

  @Post('accounts') @ApiOperation({ summary: 'Connect/update a social or email account' })
  connect(@OrgId() orgId: string, @Body() dto: ConnectAccountDto) { return this.service.connectAccount(orgId, dto); }

  @Delete('accounts/:id') @ApiOperation({ summary: 'Disconnect an account (wipes tokens)' })
  disconnect(@OrgId() orgId: string, @Param('id') id: string) { return this.service.disconnectAccount(orgId, id); }

  @Get('health') @ApiOperation({ summary: 'Verify connectivity of every channel' })
  health(@OrgId() orgId: string) { return this.service.healthCheck(orgId); }
}
