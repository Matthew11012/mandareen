import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { SegmentationService } from './segmentation.service';
import { DictionaryImportService } from './dictionary-import.service';
import { DictionaryImportController } from './dictionary-import.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [VocabularyController, DictionaryImportController],
  providers: [VocabularyService, SegmentationService, DictionaryImportService],
  exports: [VocabularyService, SegmentationService],
})
export class VocabularyModule {}
