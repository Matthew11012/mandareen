/*
  Targeted Fix for Curriculum Ingestion After Markdown Corrections
  
  This script:
  1. Identifies and deletes only affected RAG sections and chunks
  2. Preserves embeddings for unaffected chunks
  3. Re-ingests the corrected markdown file (which will reuse existing sections via upsert)
  
  Usage:
    node apps/backend/src/scripts/fix-curriculum-ingestion-targeted.js [options]
  
  Options:
    --chapter <number>          Fix specific chapter (e.g., 34)
    --subchapter <number>       Fix specific subchapter (e.g., 34.4). Can be used multiple times.
    --subchapters <list>        Fix multiple subchapters (comma-separated, e.g., "34.4,31.2,33.2,48.6")
    --auto-detect               Automatically detect sections with marker chunks
    --markdown <path>           Path to corrected markdown file (default: apps/backend/ModernMandarin_clean_final.md)
  
  Examples:
    # Fix specific subchapter
    node apps/backend/src/scripts/fix-curriculum-ingestion-targeted.js --subchapter 34.4
    
    # Fix multiple subchapters
    node apps/backend/src/scripts/fix-curriculum-ingestion-targeted.js --subchapters "34.4,31.2,33.2,48.6"
    
    # Fix entire chapter
    node apps/backend/src/scripts/fix-curriculum-ingestion-targeted.js --chapter 34
    
    # Auto-detect affected sections (sections with marker chunks)
    node apps/backend/src/scripts/fix-curriculum-ingestion-targeted.js --auto-detect
  
  Requires DATABASE_URL to be set.
*/

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Parse command line arguments
function parseArgs() {
  const args = {
    chapter: null,
    subchapters: [],
    autoDetect: false,
    markdownPath: path.join(__dirname, '../../ModernMandarin_clean_final.md'),
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--chapter' && i + 1 < process.argv.length) {
      args.chapter = process.argv[++i];
    } else if (arg === '--subchapter' && i + 1 < process.argv.length) {
      args.subchapters.push(process.argv[++i]);
    } else if (arg === '--subchapters' && i + 1 < process.argv.length) {
      const list = process.argv[++i];
      args.subchapters.push(...list.split(',').map((s) => s.trim()));
    } else if (arg === '--auto-detect') {
      args.autoDetect = true;
    } else if (arg === '--markdown' && i + 1 < process.argv.length) {
      args.markdownPath = process.argv[++i];
    }
  }

  return args;
}

async function findAffectedSections(sourceId, args) {
  const affectedSectionIds = new Set();

  // Fetch all sections for the source (we'll filter in JavaScript)
  const allSections = await prisma.ragSection.findMany({
    where: { sourceId },
    select: { id: true, heading: true, metadata: true },
  });

  if (args.subchapters.length > 0) {
    // Process each subchapter
    for (const subchapter of args.subchapters) {
      // Find sections matching the specific subchapter
      const sections = allSections.filter((s) => {
        const meta = s.metadata || {};
        return meta.subchapterNumber === subchapter;
      });

      console.log(
        `[targeted-fix] Found ${sections.length} sections for subchapter ${subchapter}`,
      );
      sections.forEach((s) => {
        affectedSectionIds.add(s.id);
        console.log(`  - Section #${s.id}: ${s.heading}`);
      });

      // Also find the previous subchapter that might have a marker chunk
      const subchapterParts = subchapter.split('.');
      if (subchapterParts.length === 2) {
        const chapterNum = subchapterParts[0];
        const subNum = parseInt(subchapterParts[1]);
        if (subNum > 1) {
          const prevSubchapter = `${chapterNum}.${subNum - 1}`;
          const prevSections = allSections.filter((s) => {
            const meta = s.metadata || {};
            return meta.subchapterNumber === prevSubchapter;
          });

          // Check if any of these sections have marker chunks
          for (const section of prevSections) {
            const chunks = await prisma.ragChunk.findMany({
              where: { sectionId: section.id },
              select: { id: true, hanzi: true, english: true },
            });

            // Check if this is a marker chunk (content like "Subchapter: ...")
            const hasMarkerChunk = chunks.some(
              (c) =>
                (c.hanzi || '').includes('Subchapter:') ||
                (c.english || '').includes('Subchapter:'),
            );

            if (hasMarkerChunk) {
              console.log(
                `[targeted-fix] Found marker chunk in previous subchapter ${prevSubchapter}, section #${section.id}`,
              );
              affectedSectionIds.add(section.id);
            }
          }
        }
      }
    }
  } else if (args.chapter) {
    // Find all sections for the chapter
    const sections = allSections.filter((s) => {
      const meta = s.metadata || {};
      return meta.chapterNumber === args.chapter;
    });

    console.log(
      `[targeted-fix] Found ${sections.length} sections for chapter ${args.chapter}`,
    );
    sections.forEach((s) => {
      affectedSectionIds.add(s.id);
      console.log(`  - Section #${s.id}: ${s.heading}`);
    });
  } else if (args.autoDetect) {
    // Find all sections that have marker chunks
    console.log('[targeted-fix] Auto-detecting sections with marker chunks...');

    for (const section of allSections) {
      const chunks = await prisma.ragChunk.findMany({
        where: { sectionId: section.id },
        select: { id: true, hanzi: true, english: true },
      });

      // Check if this is a marker chunk (content like "Subchapter: ...")
      const hasMarkerChunk = chunks.some(
        (c) =>
          (c.hanzi || '').includes('Subchapter:') ||
          (c.english || '').includes('Subchapter:'),
      );

      if (hasMarkerChunk) {
        console.log(
          `[targeted-fix] Found marker chunk in section #${section.id}: ${section.heading}`,
        );
        affectedSectionIds.add(section.id);

        // Also check if there's a following subchapter that was incorrectly formatted
        const meta = section.metadata || {};
        const subchapterNum = meta.subchapterNumber;
        if (subchapterNum) {
          const subchapterParts = subchapterNum.split('.');
          if (subchapterParts.length === 2) {
            const chapterNum = subchapterParts[0];
            const subNum = parseInt(subchapterParts[1]);
            const nextSubchapter = `${chapterNum}.${subNum + 1}`;

            // Find sections for the next subchapter
            const nextSections = allSections.filter((s) => {
              const sMeta = s.metadata || {};
              return sMeta.subchapterNumber === nextSubchapter;
            });

            // Check if the next subchapter was incorrectly formatted as a subsubchapter
            for (const nextSection of nextSections) {
              const nextMeta = nextSection.metadata || {};
              // If it has subsubchapterNumber but was supposed to be a subchapter
              if (nextMeta.subsubchapterNumber && !nextMeta.subchapterNumber) {
                console.log(
                  `[targeted-fix] Found incorrectly formatted subchapter ${nextSubchapter} (was subsubchapter), section #${nextSection.id}`,
                );
                affectedSectionIds.add(nextSection.id);
              }
            }
          }
        }
      }
    }
  } else {
    console.error(
      '[targeted-fix] Error: Must specify --chapter, --subchapter(s), or --auto-detect',
    );
    process.exit(1);
  }

  return Array.from(affectedSectionIds);
}

async function main() {
  const args = parseArgs();

  if (!fs.existsSync(args.markdownPath)) {
    console.error(
      `[targeted-fix] File not found: ${args.markdownPath}`,
    );
    process.exit(1);
  }

  console.log('[targeted-fix] Starting targeted fix process...');
  console.log(`[targeted-fix] Markdown file: ${args.markdownPath}`);

  // Step 1: Find the Modern Mandarin source
  const sources = await prisma.ragSource.findMany({
    where: {
      title: {
        contains: 'Modern Mandarin Chinese Grammar',
        mode: 'insensitive',
      },
    },
  });

  if (sources.length === 0) {
    console.error(
      '[targeted-fix] No Modern Mandarin source found. Aborting.',
    );
    process.exit(1);
  }

  const source = sources[0];
  console.log(
    `[targeted-fix] Found source: ${source.title} (#${source.id})`,
  );

  // Step 2: Find affected sections
  const affectedSectionIds = await findAffectedSections(source.id, args);

  if (affectedSectionIds.length === 0) {
    console.log('[targeted-fix] No affected sections found. Nothing to fix.');
    return;
  }

  console.log(
    `[targeted-fix] Found ${affectedSectionIds.length} affected sections to delete`,
  );

  // Step 3: Get chunk count for affected sections
  const chunkCount = await prisma.ragChunk.count({
    where: {
      sectionId: {
        in: affectedSectionIds,
      },
    },
  });

  console.log(
    `[targeted-fix] Found ${chunkCount} chunks in affected sections (embeddings will be deleted)`,
  );

  // Step 4: Delete chunks first (this will cascade delete embeddings)
  console.log('[targeted-fix] Deleting affected chunks...');
  const deletedChunks = await prisma.ragChunk.deleteMany({
    where: {
      sectionId: {
        in: affectedSectionIds,
      },
    },
  });
  console.log(
    `[targeted-fix] Deleted ${deletedChunks.count} chunks`,
  );

  // Step 5: Delete affected sections
  console.log('[targeted-fix] Deleting affected sections...');
  const deletedSections = await prisma.ragSection.deleteMany({
    where: {
      id: {
        in: affectedSectionIds,
      },
    },
  });
  console.log(
    `[targeted-fix] Deleted ${deletedSections.count} sections`,
  );

  // Step 6: Clear ragSectionId for affected CurriculumLesson entries
  const lessonsWithDeletedSections = await prisma.curriculumLesson.findMany({
    where: {
      ragSectionId: {
        in: affectedSectionIds,
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (lessonsWithDeletedSections.length > 0) {
    console.log(
      `[targeted-fix] Found ${lessonsWithDeletedSections.length} CurriculumLesson entries to update`,
    );
    await prisma.curriculumLesson.updateMany({
      where: {
        id: {
          in: lessonsWithDeletedSections.map((l) => l.id),
        },
      },
      data: {
        ragSectionId: null,
      },
    });
    console.log(
      `[targeted-fix] Cleared ragSectionId for ${lessonsWithDeletedSections.length} lessons`,
    );
  }

  console.log('[targeted-fix] Cleanup complete.');
  console.log('');
  console.log('[targeted-fix] ⚠️  IMPORTANT: Next steps required:');
  console.log('');
  console.log('1. Re-ingest the markdown file (will preserve embeddings for unaffected chunks):');
  console.log(
    `   npm run cli -- rag:ingest "${args.markdownPath}" "Modern Mandarin Chinese Grammar"`,
  );
  console.log('');
  console.log('2. Re-run seed-curriculum.js to update CurriculumLesson entries:');
  console.log('   node apps/backend/src/scripts/seed-curriculum.js');
  console.log('');
  console.log(
    '3. Generate embeddings for affected chunks:',
  );
  console.log('   npm run cli -- rag:generate-embeddings');
  console.log('   Note: This will generate embeddings for all chunks that need them,');
  console.log('   including the newly created chunks from affected sections.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('[targeted-fix] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

