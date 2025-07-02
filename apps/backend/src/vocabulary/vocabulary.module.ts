import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { SegmentationService } from './segmentation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [VocabularyController],
  providers: [VocabularyService, SegmentationService],
  exports: [VocabularyService, SegmentationService],
})
export class VocabularyModule {}
