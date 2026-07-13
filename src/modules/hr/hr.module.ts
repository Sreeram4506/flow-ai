// ================ HR MODULE ================
import { Module, Injectable, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Get, Post, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { paginate } from '../../common/utils';
import { AttendanceStatus, LeaveStatus, LeaveType } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() userId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() designation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joiningDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() salary?: number;
}
export class CheckInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LeaveType }) @IsEnum(LeaveType) type: LeaveType;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiProperty() @Type(() => Number) @IsNumber() totalDays: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  async createEmployee(orgId: string, dto: CreateEmployeeDto) {
    return this.prisma.employee.create({ data: { ...dto, organizationId: orgId, joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined } });
  }

  async getEmployees(orgId: string, query: PaginationDto) {
    const where: any = { organizationId: orgId };
    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({ where, skip: query.skip, take: query.take, include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.employee.count({ where }),
    ]);
    return paginate(employees, total, query.page!, query.limit!);
  }

  async checkIn(userId: string, dto: CheckInDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (existing?.checkIn) return existing;
    return this.prisma.attendance.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, checkIn: new Date(), status: AttendanceStatus.PRESENT, notes: dto.notes },
      update: { checkIn: new Date(), status: AttendanceStatus.PRESENT },
    });
  }

  async checkOut(userId: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const attendance = await this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (!attendance || !attendance.checkIn) throw new NotFoundException('No check-in found for today');
    const totalHours = (new Date().getTime() - attendance.checkIn.getTime()) / 3600000;
    return this.prisma.attendance.update({ where: { id: attendance.id }, data: { checkOut: new Date(), totalHours: Math.round(totalHours * 100) / 100 } });
  }

  async getAttendance(userId: string, month?: string) {
    const where: any = { userId };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }
    return this.prisma.attendance.findMany({ where, orderBy: { date: 'desc' } });
  }

  async createLeaveRequest(userId: string, dto: CreateLeaveRequestDto) {
    return this.prisma.leaveRequest.create({ data: { userId, type: dto.type, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), totalDays: dto.totalDays, reason: dto.reason } });
  }

  async getLeaveRequests(orgId: string, query: PaginationDto & { status?: LeaveStatus }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    const [requests, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where, skip: query.skip, take: query.take, include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paginate(requests, total, query.page!, query.limit!);
  }

  async approveLeave(id: string, userId: string) {
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: LeaveStatus.APPROVED, approvedById: userId, approvedAt: new Date() } });
  }

  async rejectLeave(id: string) {
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: LeaveStatus.REJECTED } });
  }
}

@ApiTags('HR') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/hr')
export class HrController {
  constructor(private readonly service: HrService) {}

  @Post('employees') @ApiOperation({ summary: 'Create employee profile' })
  createEmployee(@OrgId() orgId: string, @Body() dto: CreateEmployeeDto) { return this.service.createEmployee(orgId, dto); }

  @Get('employees') @ApiOperation({ summary: 'List employees' })
  getEmployees(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.getEmployees(orgId, query); }

  @Post('attendance/check-in') @ApiOperation({ summary: 'Check in' })
  checkIn(@CurrentUser('id') userId: string, @Body() dto: CheckInDto) { return this.service.checkIn(userId, dto); }

  @Post('attendance/check-out') @ApiOperation({ summary: 'Check out' })
  checkOut(@CurrentUser('id') userId: string) { return this.service.checkOut(userId); }

  @Get('attendance') @ApiOperation({ summary: 'Get attendance' })
  getAttendance(@CurrentUser('id') userId: string, @Query('month') month?: string) { return this.service.getAttendance(userId, month); }

  @Post('leaves') @ApiOperation({ summary: 'Create leave request' })
  createLeave(@CurrentUser('id') userId: string, @Body() dto: CreateLeaveRequestDto) { return this.service.createLeaveRequest(userId, dto); }

  @Get('leaves') @ApiOperation({ summary: 'List leave requests' })
  getLeaves(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.getLeaveRequests(orgId, query); }

  @Post('leaves/:id/approve') @ApiOperation({ summary: 'Approve leave' })
  approveLeave(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.approveLeave(id, userId); }

  @Post('leaves/:id/reject') @ApiOperation({ summary: 'Reject leave' })
  rejectLeave(@Param('id') id: string) { return this.service.rejectLeave(id); }
}

@Module({ controllers: [HrController], providers: [HrService], exports: [HrService] })
export class HrModule {}
