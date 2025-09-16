import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsController } from './flashcards.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';

@Module({
  imports: [
    PrismaModule,
    VocabularyModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [FlashcardsController],
  providers: [FlashcardsService],
})
export class FlashcardsModule {}
