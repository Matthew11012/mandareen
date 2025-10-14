/*
  Backfill WordInstance rows for existing lessons.
  Usage: ts-node apps/backend/src/scripts/backfill-word-instances.ts
*/

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pageSize = 100;
  let lastId = 0;
  let processed = 0;
  while (true) {
    const lessons = await prisma.lesson.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: {
        id: true,
        sections: {
          select: { id: true, sectionType: true, content: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (lessons.length === 0) break;

    for (const lesson of lessons) {
      lastId = lesson.id;
      const rows: Array<{
        sectionId: number;
        vocabId: number;
        startIndex: number;
        endIndex: number;
        context: string;
      }> = [];

      // collect tokens
      const tokenSet = new Set<string>();
      type Seg = {
        text: string;
        startIndex: number;
        endIndex: number;
        isWord: boolean;
      };
      for (const s of lesson.sections as Array<{
        id: number;
        sectionType: string;
        content: any;
      }>) {
        const content: any = s.content || {};
        if ((s.sectionType || '').toLowerCase() === 'dialogue') {
          const turns: any[] = Array.isArray(content.turns)
            ? content.turns
            : [];
          for (const t of turns) {
            const segs: Seg[] = Array.isArray(t?.segments) ? t.segments : [];
            for (const seg of segs) {
              if (!seg?.isWord || !seg.text || !seg.text.trim()) continue;
              tokenSet.add(seg.text.trim());
            }
          }
        } else {
          const segs: Seg[] = Array.isArray(content.segments)
            ? content.segments
            : [];
          for (const seg of segs) {
            if (!seg?.isWord || !seg.text || !seg.text.trim()) continue;
            tokenSet.add(seg.text.trim());
          }
        }
      }

      if (tokenSet.size === 0) continue;
      const tokens = Array.from(tokenSet);
      const vocab = await prisma.vocabularyItem.findMany({
        where: { hanzi: { in: tokens } },
        select: { id: true, hanzi: true },
      });
      const toId = new Map(vocab.map((v) => [v.hanzi, v.id] as const));

      // build rows
      for (const s of lesson.sections as Array<{
        id: number;
        sectionType: string;
        content: any;
      }>) {
        const content: any = s.content || {};
        if ((s.sectionType || '').toLowerCase() === 'dialogue') {
          const turns: any[] = Array.isArray(content.turns)
            ? content.turns
            : [];
          for (const t of turns) {
            const segs: Seg[] = Array.isArray(t?.segments) ? t.segments : [];
            for (const seg of segs) {
              const hanzi = (seg?.text || '').trim();
              if (!seg?.isWord || !hanzi) continue;
              const vocabId = toId.get(hanzi);
              if (!vocabId) continue;
              rows.push({
                sectionId: s.id,
                vocabId,
                startIndex: Math.max(0, seg.startIndex || 0),
                endIndex: Math.max(0, seg.endIndex || 0),
                context: String(t?.hanzi || '').slice(0, 200),
              });
            }
          }
        } else {
          const segs: Seg[] = Array.isArray(content.segments)
            ? content.segments
            : [];
          for (const seg of segs) {
            const hanzi = (seg?.text || '').trim();
            if (!seg?.isWord || !hanzi) continue;
            const vocabId = toId.get(hanzi);
            if (!vocabId) continue;
            rows.push({
              sectionId: s.id,
              vocabId,
              startIndex: Math.max(0, seg.startIndex || 0),
              endIndex: Math.max(0, seg.endIndex || 0),
              context: String(content?.hanzi || '').slice(0, 200),
            });
          }
        }
      }

      // insert in batches
      const BATCH = 1000;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        if (slice.length === 0) continue;
        await prisma.wordInstance.createMany({
          data: slice,
          skipDuplicates: true as any,
        });
      }
      processed++;
      if (processed % 10 === 0) console.log(`Processed lessons: ${processed}`);
    }
  }
  console.log('Backfill complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
