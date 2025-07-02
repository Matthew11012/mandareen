import { Controller, Get, Post, Body, UseGuards, Req, Query } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { FetchQuestionsDto } from './dto/fetch-questions.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Passage } from './models/passage.model';

@Controller('assess')
@UseGuards(JwtAuthGuard)
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Get('questions')
  async getAssessmentQuestions(
    @Req() req,
    @Query() queryParams: FetchQuestionsDto,
  ): Promise<Passage[]> {
    return this.assessmentService.fetchAssessmentQuestions(req.user.id, queryParams);
  }

  @Post('submit')
  async submitAssessment(
    @Req() req,
    @Body() submitDto: SubmitAssessmentDto,
  ): Promise<{ levelPlaced: number }> {
    return this.assessmentService.submitAssessment(req.user.id, submitDto);
  }

  @Get('history')
  async getAssessmentHistory(@Req() req) {
    // This would fetch assessment history from the database
    // Implement this method in the service
    return [];
  }
} 