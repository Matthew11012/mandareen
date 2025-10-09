/*
  Seed Curriculum from hierarchical RAG source.
  - Creates CurriculumUnit per Chapter (##)
  - Creates CurriculumLesson per Subchapter (###)
  - Maps to existing RagSection/RagChunk structure

  Usage:
    node apps/backend/src/scripts/seed-curriculum.js

  Requires DATABASE_URL to be set.
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('[seed-curriculum] Starting hierarchical seeding…');

  // Choose the Modern Mandarin source if present, otherwise the first source
  const sources = await prisma.ragSource.findMany({
    orderBy: { id: 'asc' },
  });
  if (!sources.length) {
    console.log('[seed-curriculum] No RagSource found. Aborting.');
    return;
  }
  const preferred = sources.find((s) =>
    (s.title || '').toLowerCase().includes('modern mandarin chinese grammar'),
  );
  const source = preferred || sources[0];
  console.log(
    `[seed-curriculum] Using source: ${source.title} (#${source.id})`,
  );

  // Get all sections with their metadata to group by chapter/subchapter
  const sections = await prisma.ragSection.findMany({
    where: { sourceId: source.id },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      heading: true,
      metadata: true,
    },
  });

  if (!sections.length) {
    console.log('[seed-curriculum] No RagSection found for source.');
    return;
  }

  // Group sections by part -> chapter -> subchapter -> subsubchapter
  const parts = new Map();

  for (const section of sections) {
    const meta = section.metadata || {};
    const partTitle = meta.partTitle || 'Part';
    const chapterTitle =
      meta.chapterTitle || extractChapterFromHeading(section.heading || '');
    const subchapterTitle =
      meta.subchapterTitle ||
      extractSubchapterFromHeading(section.heading || '');
    const subsubTitle = meta.subsubchapterTitle || '';
    const chapterNumber =
      meta.chapterNumber || extractChapterNumber(section.heading || '');
    const subchapterNumber =
      meta.subchapterNumber || extractSubchapterNumber(section.heading || '');
    const subsubNumber = meta.subsubchapterNumber || '';

    if (!parts.has(partTitle)) parts.set(partTitle, new Map());
    const chapters = parts.get(partTitle);

    if (!chapters.has(chapterNumber)) {
      chapters.set(chapterNumber, {
        chapterNumber,
        chapterTitle,
        subchapters: new Map(),
      });
    }
    const chapter = chapters.get(chapterNumber);

    if (!chapter.subchapters.has(subchapterNumber)) {
      chapter.subchapters.set(subchapterNumber, {
        subchapterNumber,
        subchapterTitle,
        subchapterSection: null,
        subsubs: [],
      });
    }
    const bucket = chapter.subchapters.get(subchapterNumber);
    if (subsubNumber) {
      bucket.subsubs.push({
        id: section.id,
        title: subsubTitle || section.heading,
        subsubNumber,
      });
    } else {
      bucket.subchapterSection = { id: section.id, title: subchapterTitle };
    }
  }

  // Sort for stable order
  for (const [part, chapters] of parts) {
    const sorted = new Map(
      [...chapters.entries()].sort(
        (a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0),
      ),
    );
    parts.set(part, sorted);
    for (const [chNo, ch] of sorted) {
      ch.subchapters = new Map(
        [...ch.subchapters.entries()].sort((a, b) => {
          const aNo = parseInt((a[0].split('.') || ['', '0'])[1]) || 0;
          const bNo = parseInt((b[0].split('.') || ['', '0'])[1]) || 0;
          return aNo - bNo;
        }),
      );
      for (const [, sc] of ch.subchapters) {
        sc.subsubs.sort((a, b) => {
          const pa = a.subsubNumber.split('.').map((n) => parseInt(n) || 0);
          const pb = b.subsubNumber.split('.').map((n) => parseInt(n) || 0);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const da = pa[i] || 0,
              db = pb[i] || 0;
            if (da !== db) return da - db;
          }
          return 0;
        });
      }
    }
  }

  console.log(`[seed-curriculum] Parts: ${parts.size}`);

  let unitsCreated = 0;
  let lessonsCreated = 0;

  // Create curriculum units (chapters) and lessons (subchapters)
  for (const [partTitle, chapters] of parts) {
    for (const [chapterNumber, chapterData] of chapters) {
      const unitTitle = `${chapterData.chapterTitle}`.trim();
      const unit = await prisma.curriculumUnit.upsert({
        where: {
          ragSourceId_title: {
            ragSourceId: source.id,
            title: unitTitle,
          },
        },
        update: {},
        create: {
          ragSourceId: source.id,
          title: unitTitle,
          description: `Chapter ${chapterNumber}: ${chapterData.chapterTitle}`,
          order: parseInt(chapterNumber) || unitsCreated + 1,
          metadata: {
            chapterNumber,
            partTitle,
          },
        },
      });
      unitsCreated++;
      for (const [subchapterNumber, sc] of chapterData.subchapters) {
        const lessonTitle = `${sc.subchapterTitle}`.trim();
        const cleanSubchapterTitle = (sc.subchapterTitle || '').replace(
          /^[0-9\.]+\s+/,
          '',
        );
        const lesson = await prisma.curriculumLesson.upsert({
          where: {
            unitId_title: {
              unitId: unit.id,
              title: lessonTitle,
            },
          },
          update: {},
          create: {
            unitId: unit.id,
            ragSectionId: sc.subchapterSection?.id || null,
            title: lessonTitle,
            description: `Subchapter ${subchapterNumber}: ${cleanSubchapterTitle}`,
            order:
              parseInt((subchapterNumber.split('.') || ['', '0'])[1]) ||
              lessonsCreated + 1,
            metadata: {
              subchapterNumber,
              chapterNumber,
              partTitle,
              subsubCount: sc.subsubs.length,
            },
          },
        });
        lessonsCreated++;
        // TODO (later): optionally materialize subsubchapters as child activities or sub-lessons
      }
    }
  }

  console.log(
    `[seed-curriculum] Created ${unitsCreated} units and ${lessonsCreated} lessons`,
  );
  console.log('[seed-curriculum] Done.');
}

// Helper functions to extract hierarchy from headings
function extractChapterFromHeading(heading) {
  // Try to extract chapter info from heading
  const match = heading.match(/^(\d+)\s+(.+)$/);
  return match ? match[2] : heading;
}

function extractSubchapterFromHeading(heading) {
  // Try to extract subchapter info
  const match = heading.match(/^(\d+\.\d+)\s+(.+)$/);
  return match ? match[2] : heading;
}

function extractChapterNumber(heading) {
  const match = heading.match(/^(\d+)/);
  return match ? match[1] : '';
}

function extractSubchapterNumber(heading) {
  const match = heading.match(/^(\d+\.\d+)/);
  return match ? match[1] : '';
}

function extractPartFromChapter(chapterTitle) {
  // Determine if this is Part A or B based on chapter content
  if (
    chapterTitle.toLowerCase().includes('pronunciation') ||
    chapterTitle.toLowerCase().includes('structure')
  ) {
    return 'Part A: Structures';
  }
  return 'Part B: Situations and Functions';
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
