import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberRoleDto, CreateApiKeyDto } from './dto/organization.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, Roles, Public } from '../../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('api/organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create organization' })
  create(@Body() dto: CreateOrganizationDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all organizations (Super Admin)' })
  findAll(@Query() query: PaginationDto) { return this.service.findAll(query); }

  @Get('my')
  @ApiOperation({ summary: 'List current user organizations' })
  findMyOrgs(@CurrentUser('id') userId: string) { return this.service.findUserOrganizations(userId); }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update organization' })
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Delete organization' })
  delete(@Param('id') id: string) { return this.service.delete(id); }

  // ---- Members ----
  @Get(':id/members')
  @ApiOperation({ summary: 'List organization members' })
  getMembers(@Param('id') id: string, @Query() query: PaginationDto) { return this.service.getMembers(id, query); }

  @Post(':id/members/invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite member to organization' })
  inviteMember(@Param('id') id: string, @Body() dto: InviteMemberDto) { return this.service.inviteMember(id, dto); }

  @Patch(':id/members/:memberId/role')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update member role' })
  updateRole(@Param('id') id: string, @Param('memberId') memberId: string, @Body() dto: UpdateMemberRoleDto) {
    return this.service.updateMemberRole(id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove member' })
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.service.removeMember(id, memberId);
  }

  @Public()
  @Post('accept-invite/:token')
  @ApiOperation({ summary: 'Accept organization invite' })
  acceptInvite(@Param('token') token: string, @CurrentUser('id') userId: string) {
    return this.service.acceptInvite(token, userId);
  }

  // ---- API Keys ----
  @Get(':id/api-keys')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List organization API keys' })
  getApiKeys(@Param('id') id: string) { return this.service.getApiKeys(id); }

  @Post(':id/api-keys')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate new API key' })
  createApiKey(@Param('id') id: string, @Body() dto: CreateApiKeyDto) { return this.service.createApiKey(id, dto.name); }

  @Delete(':id/api-keys/:keyId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Revoke API key' })
  revokeApiKey(@Param('id') id: string, @Param('keyId') keyId: string) { return this.service.revokeApiKey(id, keyId); }
}
