import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, CreateClientContactDto } from './dto/client.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Clients (CRM)')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Post() @ApiOperation({ summary: 'Create client' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateClientDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List clients' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get client with full history' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update client' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateClientDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Archive client' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post(':id/contacts') @ApiOperation({ summary: 'Add contact to client' })
  addContact(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: CreateClientContactDto) { return this.service.addContact(orgId, id, dto); }

  @Delete(':id/contacts/:contactId') @ApiOperation({ summary: 'Remove contact' })
  removeContact(@OrgId() orgId: string, @Param('id') id: string, @Param('contactId') contactId: string) { return this.service.removeContact(orgId, id, contactId); }

  @Get(':id/stats') @ApiOperation({ summary: 'Get client financial stats' })
  getStats(@OrgId() orgId: string, @Param('id') id: string) { return this.service.getClientStats(orgId, id); }
}
