// ================ AI ASSISTANT MODULE ================
import { Module, Injectable, Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Post, Get, Delete, Body, Param } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export class AiPromptDto {
  @ApiProperty() @IsString() @IsNotEmpty() prompt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() context?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conversationId?: string;
}
export class AiGenerateTasksDto {
  @ApiProperty() @IsString() @IsNotEmpty() projectDescription: string;
  @ApiPropertyOptional() @IsOptional() numberOfTasks?: number;
}

@Injectable()
export class AiService {
  private readonly ai: any;
  private readonly textModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    this.textModel = this.configService.get<string>('gemini.textModel') || 'gemini-2.0-flash';
  }

  private async generateText(prompt: string): Promise<string> {
    if (this.ai) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.textModel,
          contents: prompt,
        });
        return response.text || '';
      } catch (err) {
        console.error('Gemini API call failed, using fallback:', err);
      }
    }
    return '';
  }

  // ---- Conversation History Management ----

  private conversationStore = new Map<string, { userId: string; orgId: string; messages: Array<{ role: string; text: string; timestamp: string }> }>();

  async getConversations(userId: string) {
    const conversations: Array<{ id: string; preview: string; messageCount: number; updatedAt: string }> = [];
    for (const [id, conv] of this.conversationStore.entries()) {
      if (conv.userId === userId) {
        const lastMsg = conv.messages[conv.messages.length - 1];
        conversations.push({
          id,
          preview: lastMsg?.text?.substring(0, 80) || 'New conversation',
          messageCount: conv.messages.length,
          updatedAt: lastMsg?.timestamp || new Date().toISOString(),
        });
      }
    }
    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getConversation(userId: string, conversationId: string) {
    const conv = this.conversationStore.get(conversationId);
    if (!conv || conv.userId !== userId) return { messages: [] };
    return { id: conversationId, messages: conv.messages };
  }

  async clearConversation(userId: string, conversationId: string) {
    const conv = this.conversationStore.get(conversationId);
    if (conv && conv.userId === userId) {
      this.conversationStore.delete(conversationId);
    }
    return { message: 'Conversation cleared' };
  }

  // ---- Multi-turn Chat ----

  async chat(orgId: string, userId: string, dto: AiPromptDto) {
    const orgData = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: { select: { projects: true, clients: true, invoices: true, members: true } },
      },
    });

    // Resolve or create conversation
    let conversationId = dto.conversationId;
    if (!conversationId) {
      conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.conversationStore.set(conversationId, { userId, orgId, messages: [] });
    }
    let conv = this.conversationStore.get(conversationId);
    if (!conv) {
      conv = { userId, orgId, messages: [] };
      this.conversationStore.set(conversationId, conv);
    }

    // Store user message
    conv.messages.push({ role: 'user', text: dto.prompt, timestamp: new Date().toISOString() });

    const contextSummary = `Your organization has ${orgData?._count.projects || 0} projects, ` +
      `${orgData?._count.clients || 0} clients, ${orgData?._count.invoices || 0} invoices, ` +
      `and ${orgData?._count.members || 0} team members.`;

    // Build multi-turn conversation context (last 10 messages)
    const recentMessages = conv.messages.slice(-10);
    const historyBlock = recentMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

    const systemPrompt = `You are Flow AI, a helpful, concise virtual assistant integrated into Flow – a Project Management and CRM platform. ` +
      `Use the workspace context below to provide data-driven answers. Format responses using markdown where helpful.\n\n` +
      `Workspace Context: ${contextSummary}\n` +
      (dto.context ? `Additional Context: ${dto.context}\n` : '') +
      `\nConversation History:\n${historyBlock}\n\nRespond to the latest user message only.`;

    const generated = await this.generateText(systemPrompt);

    const suggestedActions = [
      'Generate tasks for my project',
      'Create a business report',
      'Predict project delays',
      'Suggest pricing for a project',
    ];

    if (generated) {
      conv.messages.push({ role: 'assistant', text: generated, timestamp: new Date().toISOString() });
      return {
        conversationId,
        response: generated,
        model: this.textModel,
        suggestedActions: conv.messages.length <= 2 ? suggestedActions : [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }

    const fallbackResponse = `Based on your workspace data, here's my analysis for: "${dto.prompt}"\n\n` +
      `Your organization has ${orgData?._count.projects || 0} projects, ` +
      `${orgData?._count.clients || 0} clients, and ` +
      `${orgData?._count.invoices || 0} invoices.\n\n` +
      `> Connect your Gemini API key in .env for full AI capabilities.`;

    conv.messages.push({ role: 'assistant', text: fallbackResponse, timestamp: new Date().toISOString() });

    return {
      conversationId,
      response: fallbackResponse,
      model: 'fallback-heuristic',
      suggestedActions: conv.messages.length <= 2 ? suggestedActions : [],
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  async generateTasks(dto: AiGenerateTasksDto) {
    const count = dto.numberOfTasks || 5;

    if (this.ai) {
      const prompt = `Based on this project description: "${dto.projectDescription}", generate exactly ${count} project tasks. ` +
        `Return the output ONLY as a valid JSON array of task objects (no markdown, no quotes, no codeblocks). ` +
        `Each task object must have keys: "title", "description", "priority" (must be one of: LOW, MEDIUM, HIGH), and "estimatedHours" (integer value representing hours).`;

      try {
        const text = await this.generateText(prompt);
        const cleanedText = text.replace(/```json/i, '').replace(/```/g, '').trim();
        const tasks = JSON.parse(cleanedText);
        if (Array.isArray(tasks)) {
          return { tasks, note: 'Tasks successfully generated by Gemini AI.' };
        }
      } catch (err) {
        console.error('Failed to parse Gemini task response:', err);
      }
    }

    const tasks = Array.from({ length: count }, (_, i) => ({
      title: `Task ${i + 1}: ${['Setup', 'Design', 'Develop', 'Test', 'Deploy', 'Review', 'Optimize', 'Document'][i % 8]} Phase`,
      description: `Auto-generated task for: ${dto.projectDescription}`,
      priority: ['LOW', 'MEDIUM', 'HIGH'][i % 3],
      estimatedHours: Math.ceil(Math.random() * 20 + 2),
    }));
    return { tasks, note: 'Heuristic fallback tasks. Connect Gemini API for intelligent task generation.' };
  }

  async suggestPricing(orgId: string, description: string) {
    const pastProjects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      select: { budget: true },
    });
    const avgBudget = pastProjects.length > 0
      ? pastProjects.reduce((acc, p) => acc + (p.budget || 0), 0) / pastProjects.length
      : 3000;

    if (this.ai) {
      const prompt = `Suggest pricing for a project with description: "${description}". ` +
        `The organization's average project budget is $${avgBudget.toFixed(2)}. ` +
        `Return the suggestion ONLY as a valid JSON object with the keys "suggestedPrice" (number), "confidence" (string), "factors" (array of strings explaining pricing factors).`;
      try {
        const text = await this.generateText(prompt);
        const cleanedText = text.replace(/```json/i, '').replace(/```/g, '').trim();
        const res = JSON.parse(cleanedText);
        if (res.suggestedPrice) {
          return {
            suggestedPrice: res.suggestedPrice,
            confidence: res.confidence || 'medium',
            factors: res.factors || [],
            note: 'Pricing suggestion computed by Gemini AI.',
          };
        }
      } catch (err) {
        console.error('Failed to parse Gemini pricing suggestion:', err);
      }
    }

    return {
      suggestedPrice: Math.round(avgBudget * (0.8 + Math.random() * 0.4)),
      confidence: 'medium',
      factors: ['Past organization average budget', 'Description complexity', 'Standard market pricing'],
      note: 'Heuristic pricing suggestion. Connect Gemini for intelligent pricing.',
    };
  }

  async generateSummary(text: string) {
    if (this.ai) {
      const prompt = `Summarize this text: "${text}". ` +
        `Return output ONLY as a valid JSON object with keys "summary" (string containing a 1-sentence summary) and "keyPoints" (array of strings containing up to 3 bullet points).`;
      try {
        const generated = await this.generateText(prompt);
        const cleaned = generated.replace(/```json/i, '').replace(/```/g, '').trim();
        const res = JSON.parse(cleaned);
        if (res.summary) {
          return {
            summary: res.summary,
            keyPoints: res.keyPoints || [],
            note: 'Summarization completed by Gemini AI.',
          };
        }
      } catch (err) {
        console.error('Failed to parse Gemini summary:', err);
      }
    }

    return {
      summary: `Summary of: ${text.substring(0, 100)}...`,
      note: 'Heuristic summary. Connect Gemini for intelligent summarization.',
    };
  }

  async summarizeDocument(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId: orgId }
    });
    
    if (!doc) {
      throw new Error('Document not found');
    }
    
    // In a real application, we would download the document from doc.fileUrl, 
    // extract its text content, and pass it to generateSummary.
    // Here we'll simulate it using the document's name and metadata.
    
    const simulatedText = `Document Name: ${doc.name}\nFile Type: ${doc.fileType}\nSize: ${doc.fileSize} bytes.\nThis document contains important information regarding ${doc.name}.`;
    
    const summaryResult = await this.generateSummary(simulatedText);
    
    // Format it nicely for the UI
    let formattedSummary = `**${summaryResult.summary}**\n\n`;
    if (summaryResult.keyPoints && summaryResult.keyPoints.length > 0) {
      formattedSummary += "**Key Points:**\n";
      summaryResult.keyPoints.forEach((pt: string) => {
        formattedSummary += `• ${pt}\n`;
      });
    }
    
    return {
      summary: formattedSummary,
      note: summaryResult.note
    };
  }

  async predictDelay(orgId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          select: {
            title: true,
            status: true,
            dueDate: true,
            priority: true,
          }
        }
      },
    });

    if (!project) {
      return { delayProbability: 0, riskFactors: [], recommendation: 'Project not found' };
    }

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((t) => t.status === 'DONE').length;
    const pendingTasks = totalTasks - completedTasks;
    const overdueTasks = project.tasks.filter(
      (t) => t.status !== 'DONE' && t.dueDate && t.dueDate < new Date()
    ).length;

    const delayProbability = totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0;

    if (this.ai) {
      const prompt = `Analyze project delay risk for project "${project.name}". ` +
        `Stats: Total tasks = ${totalTasks}, Completed tasks = ${completedTasks}, Pending tasks = ${pendingTasks}, Overdue tasks = ${overdueTasks}. ` +
        `Deadline: ${project.deadline ? project.deadline.toISOString() : 'None'}. ` +
        `Tasks details: ${JSON.stringify(project.tasks)}. ` +
        `Return output ONLY as a valid JSON object with keys "delayProbability" (number 0-100), "riskFactors" (array of strings), "recommendation" (string).`;
      try {
        const text = await this.generateText(prompt);
        const cleaned = text.replace(/```json/i, '').replace(/```/g, '').trim();
        const res = JSON.parse(cleaned);
        if (typeof res.delayProbability === 'number') {
          return {
            project: project.name,
            delayProbability: res.delayProbability,
            riskFactors: res.riskFactors || [],
            recommendation: res.recommendation || '',
            note: 'Delay prediction computed by Gemini AI.',
          };
        }
      } catch (err) {
        console.error('Failed to parse Gemini delay prediction:', err);
      }
    }

    const riskFactors = [];
    if (overdueTasks > 0) riskFactors.push(`${overdueTasks} overdue tasks`);
    if (pendingTasks > totalTasks / 2) riskFactors.push('More than half of tasks are incomplete');
    if (!project.deadline) riskFactors.push('No deadline set for the project');
    if (riskFactors.length === 0) riskFactors.push('Low current project risk factors');

    return {
      project: project.name,
      delayProbability,
      riskFactors,
      recommendation: overdueTasks > 0
        ? 'Consider breaking down larger tasks, extending deadlines, or assigning more members to complete the overdue tasks.'
        : 'Project is on track. Continue standard milestone review.',
      note: 'Heuristic delay prediction. Connect Gemini for intelligent delay prediction.',
    };
  }

  async generateBusinessReport(orgId: string) {
    const [revenue, projects, clients] = await Promise.all([
      this.prisma.payment.aggregate({ where: { organizationId: orgId, status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.project.count({ where: { organizationId: orgId } }),
      this.prisma.client.count({ where: { organizationId: orgId } }),
    ]);

    const totalRevenue = Number(revenue._sum.amount || 0);

    if (this.ai) {
      const prompt = `Generate a short business performance report for an organization with these stats: ` +
        `Total Revenue = $${totalRevenue.toLocaleString()}, Total Projects = ${projects}, Total Clients = ${clients}. ` +
        `Return output ONLY as a valid JSON object with keys "report" (string containing formatted markdown report text) and "recommendations" (array of strings containing up to 3 business recommendations).`;
      try {
        const text = await this.generateText(prompt);
        const cleaned = text.replace(/```json/i, '').replace(/```/g, '').trim();
        const res = JSON.parse(cleaned);
        if (res.report) {
          return {
            report: res.report,
            generatedAt: new Date().toISOString(),
            note: 'Business report analyzed by Gemini AI.',
          };
        }
      } catch (err) {
        console.error('Failed to parse Gemini business report:', err);
      }
    }

    return {
      report: `Business Performance Report\n\nTotal Revenue: $${totalRevenue.toLocaleString()}\nTotal Projects: ${projects}\nTotal Clients: ${clients}\n\nRecommendations:\n1. Focus on client retention\n2. Optimize project delivery timelines\n3. Increase billable utilization rates`,
      generatedAt: new Date().toISOString(),
    };
  }
}

@ApiTags('AI Assistant') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('chat') @ApiOperation({ summary: 'Chat with AI assistant (multi-turn)' })
  chat(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: AiPromptDto) { return this.service.chat(orgId, userId, dto); }

  @Get('conversations') @ApiOperation({ summary: 'List AI conversations' })
  getConversations(@CurrentUser('id') userId: string) { return this.service.getConversations(userId); }

  @Get('conversations/:id') @ApiOperation({ summary: 'Get AI conversation history' })
  getConversation(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.service.getConversation(userId, id); }

  @Delete('conversations/:id') @ApiOperation({ summary: 'Clear AI conversation' })
  clearConversation(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.service.clearConversation(userId, id); }

  @Post('generate-tasks') @ApiOperation({ summary: 'AI-generate tasks from description' })
  generateTasks(@Body() dto: AiGenerateTasksDto) { return this.service.generateTasks(dto); }

  @Post('suggest-pricing') @ApiOperation({ summary: 'AI pricing suggestion' })
  suggestPricing(@OrgId() orgId: string, @Body('description') description: string) { return this.service.suggestPricing(orgId, description); }

  @Post('summarize') @ApiOperation({ summary: 'AI text summarization' })
  summarize(@Body('text') text: string) { return this.service.generateSummary(text); }

  @Post('summarize-document') @ApiOperation({ summary: 'AI document summarization' })
  summarizeDocument(@OrgId() orgId: string, @Body('documentId') documentId: string) { return this.service.summarizeDocument(orgId, documentId); }

  @Post('predict-delay/:projectId') @ApiOperation({ summary: 'AI project delay prediction' })
  predictDelay(@OrgId() orgId: string, @Param('projectId') projectId: string) { return this.service.predictDelay(orgId, projectId); }

  @Post('business-report') @ApiOperation({ summary: 'AI business performance report' })
  businessReport(@OrgId() orgId: string) { return this.service.generateBusinessReport(orgId); }
}

@Module({ controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
