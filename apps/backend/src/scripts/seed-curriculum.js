/*
  Seed Curriculum from hierarchical RAG source.
  - Creates CurriculumUnit per Chapter (##)
  - Creates CurriculumLesson per Subchapter (###)
  - Maps to existing RagSection/RagChunk structure

  Usage:
    node apps/backend/src/scripts/seed-curriculum.js

  Requires DATABASE_URL to be set.
*/

// eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // Debug: Check for target subchapters
  const targetSubchapters = ['34.4', '31.2', '33.2', '48.6'];
  console.log('[seed-curriculum] Checking for target subchapters...');
  for (const section of sections) {
    const heading = (section.heading || '').toLowerCase();
    const meta = section.metadata || {};
    const subchapterNumber =
      meta.subchapterNumber || extractSubchapterNumber(section.heading || '');

    for (const target of targetSubchapters) {
      if (heading.includes(target) || subchapterNumber === target) {
        console.log(
          `[seed-curriculum] 🔍 Found section ${section.id} for ${target}:`,
          `heading="${section.heading}",`,
          `subchapterNumber="${subchapterNumber}",`,
          `metadata=${JSON.stringify(meta)}`,
        );
      }
    }
  }

  // Group sections by part -> chapter -> subchapter -> subsubchapter
  const parts = new Map();

  for (const section of sections) {
    const meta = section.metadata || {};
    const partTitle = meta.partTitle || 'Part';
    const chapterTitle =
      meta.chapterTitle || extractChapterFromHeading(section.heading || '');
    let subchapterTitle =
      meta.subchapterTitle ||
      extractSubchapterFromHeading(section.heading || '');
    const subsubTitle = meta.subsubchapterTitle || '';
    const chapterNumber =
      meta.chapterNumber || extractChapterNumber(section.heading || '');
    let subchapterNumber =
      meta.subchapterNumber || extractSubchapterNumber(section.heading || '');
    const subsubNumber = meta.subsubchapterNumber || '';

    // Fix: If a section has subsubchapterNumber that matches a target subchapter (34.4, 31.2, 33.2, 48.6)
    // but subchapterNumber is wrong (pointing to parent), only correct it if the heading starts with that number
    // This prevents subsubchapters (####) from being incorrectly promoted to subchapters
    const extractedFromHeading = extractSubchapterNumber(section.heading || '');
    const targetSubchapters = ['34.4', '31.2', '33.2', '48.6'];
    if (
      extractedFromHeading &&
      targetSubchapters.includes(extractedFromHeading) &&
      subchapterNumber !== extractedFromHeading
    ) {
      // Only fix if the heading actually starts with the subchapter number (not a subsubchapter like "33.2.1")
      const headingStartsWithSubchapter = (section.heading || '')
        .trim()
        .startsWith(extractedFromHeading + ' ');
      if (headingStartsWithSubchapter) {
        console.log(
          `[seed-curriculum] 🔧 Fixing metadata for section ${section.id} "${section.heading}": subchapterNumber="${subchapterNumber}" -> "${extractedFromHeading}"`,
        );
        subchapterNumber = extractedFromHeading;
        // Also fix the title - extract it from the heading since metadata has wrong title
        subchapterTitle = extractSubchapterFromHeading(section.heading || '');
        console.log(
          `[seed-curriculum] 🔧 Also fixing title: "${meta.subchapterTitle || 'N/A'}" -> "${subchapterTitle}"`,
        );
      } else {
        // This is a subsubchapter (e.g., "33.2.1"), don't promote it
        console.log(
          `[seed-curriculum] ⚠️ Skipping subsubchapter section ${section.id} "${section.heading}" - has subsubchapterNumber="${extractedFromHeading}" but is actually a subsubchapter, not subchapter`,
        );
        continue; // Skip this section - it's a subsubchapter, not a subchapter
      }
    }

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

    // Skip sections without a valid subchapterNumber (they won't create lessons)
    if (!subchapterNumber || subchapterNumber.trim() === '') {
      // Check if this might be one of the missing subchapters we're looking for
      const headingLower = (section.heading || '').toLowerCase();
      const isMissingSubchapter =
        headingLower.includes('34.4') ||
        headingLower.includes('31.2') ||
        headingLower.includes('33.2') ||
        headingLower.includes('48.6');

      if (isMissingSubchapter) {
        console.error(
          `[seed-curriculum] ⚠️ MISSING SUBCHAPTER DETECTED: Section ${section.id} "${section.heading}" - missing subchapterNumber in metadata. Metadata:`,
          JSON.stringify(meta, null, 2),
        );
      } else {
        console.warn(
          `[seed-curriculum] Skipping section ${section.id} "${section.heading}" - missing or empty subchapterNumber`,
        );
      }
      continue;
    }

    if (!chapter.subchapters.has(subchapterNumber)) {
      chapter.subchapters.set(subchapterNumber, {
        subchapterNumber,
        subchapterTitle,
        subchapterSection: null,
        subsubs: [],
      });
    }
    const bucket = chapter.subchapters.get(subchapterNumber);

    // Priority: If subchapterNumber exists, it's a subchapter (###)
    // Only treat as subsubchapter if it has subsubchapterNumber but NO subchapterNumber
    if (subchapterNumber) {
      // This is a subchapter (###) - set it as the subchapterSection
      // If there's already one set, prefer the one where subchapterNumber matches the heading
      const extractedFromHeading = extractSubchapterNumber(
        section.heading || '',
      );
      const matchesHeading = extractedFromHeading === subchapterNumber;

      const isTargetSubchapter = ['34.4', '31.2', '33.2', '48.6'].includes(
        subchapterNumber,
      );

      if (bucket.subchapterSection) {
        // Check if existing section matches heading better
        const existingExtracted = extractSubchapterNumber(
          bucket.subchapterSection.title || '',
        );
        const existingMatches = existingExtracted === subchapterNumber;

        // For target subchapters, prefer the one that matches the heading exactly
        // Also prefer newer sections (higher ID) if both match, as they're likely from re-ingestion
        if (isTargetSubchapter) {
          if (matchesHeading && !existingMatches) {
            console.log(
              `[seed-curriculum] ✅ Replacing duplicate for ${subchapterNumber}: using section ${section.id} "${subchapterTitle}" (matches heading) instead of ${bucket.subchapterSection.id} "${bucket.subchapterSection.title}"`,
            );
            bucket.subchapterSection = {
              id: section.id,
              title: subchapterTitle,
            };
          } else if (
            matchesHeading &&
            existingMatches &&
            section.id > bucket.subchapterSection.id
          ) {
            // Both match, but prefer newer section (from re-ingestion)
            console.log(
              `[seed-curriculum] ✅ Replacing duplicate for ${subchapterNumber}: using newer section ${section.id} "${subchapterTitle}" instead of ${bucket.subchapterSection.id} "${bucket.subchapterSection.title}"`,
            );
            bucket.subchapterSection = {
              id: section.id,
              title: subchapterTitle,
            };
          } else {
            console.error(
              `[seed-curriculum] ⚠️ DUPLICATE TARGET SUBCHAPTER ${subchapterNumber}: existing=${bucket.subchapterSection.id} "${bucket.subchapterSection.title}", new=${section.id} "${subchapterTitle}" (keeping existing)`,
            );
          }
        } else {
          // For non-target subchapters, prefer section where subchapterNumber matches the heading
          if (matchesHeading && !existingMatches) {
            bucket.subchapterSection = {
              id: section.id,
              title: subchapterTitle,
            };
          } else {
            console.warn(
              `[seed-curriculum] Duplicate subchapter section for ${subchapterNumber}: existing=${bucket.subchapterSection.id}, new=${section.id} (keeping existing)`,
            );
          }
        }
      } else {
        if (isTargetSubchapter) {
          console.log(
            `[seed-curriculum] ✅ Found target subchapter ${subchapterNumber}: section ${section.id} "${subchapterTitle}"`,
          );
        }
        bucket.subchapterSection = { id: section.id, title: subchapterTitle };
      }
    } else if (subsubNumber) {
      // This is a subsubchapter (####) without a parent subchapterNumber
      // This shouldn't happen in valid structure, but handle it
      console.warn(
        `[seed-curriculum] Found subsubchapter ${subsubNumber} without parent subchapter for section ${section.id}`,
      );
      bucket.subsubs.push({
        id: section.id,
        title: subsubTitle || section.heading,
        subsubNumber,
      });
    } else {
      // No subchapterNumber or subsubNumber - skip this section
      console.warn(
        `[seed-curriculum] Skipping section ${section.id} "${section.heading}" - no subchapterNumber or subsubchapterNumber in metadata`,
      );
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
    for (const [, ch] of sorted) {
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
        // Ensure lesson title includes the subchapter number prefix (e.g., "34.4 Title")
        let lessonTitle = `${sc.subchapterTitle}`.trim();
        // If title doesn't start with the subchapter number, add it
        if (!lessonTitle.startsWith(subchapterNumber)) {
          lessonTitle = `${subchapterNumber} ${lessonTitle}`;
        }
        const cleanSubchapterTitle = (sc.subchapterTitle || '').replace(
          /^[0-9.]+\s+/,
          '',
        );
        const targetRagSectionId = sc.subchapterSection?.id || null;

        // Warn if subchapterSection is missing (shouldn't happen for valid ### headings)
        if (!sc.subchapterSection) {
          console.warn(
            `[seed-curriculum] Subchapter ${subchapterNumber} has no subchapterSection. Has ${sc.subsubs.length} subsubs. Will skip lesson creation.`,
          );
          continue;
        }

        // Check if a lesson with this ragSectionId already exists (handles unique constraint on unitId+ragSectionId)
        let existingBySection = null;
        if (targetRagSectionId) {
          existingBySection = await prisma.curriculumLesson.findUnique({
            where: {
              unitId_ragSectionId: {
                unitId: unit.id,
                ragSectionId: targetRagSectionId,
              },
            },
          });
        }

        if (existingBySection) {
          // Update existing lesson that has this ragSectionId (might have different title)
          // But first check if another lesson with this title already exists
          const existingByTitle = await prisma.curriculumLesson.findUnique({
            where: {
              unitId_title: {
                unitId: unit.id,
                title: lessonTitle,
              },
            },
          });

          if (existingByTitle && existingByTitle.id !== existingBySection.id) {
            // Another lesson with this title exists - delete the old one and update the existing one
            console.log(
              `[seed-curriculum] Title conflict for "${lessonTitle}": deleting old lesson ${existingBySection.id}, updating ${existingByTitle.id}`,
            );
            await prisma.curriculumLesson.delete({
              where: { id: existingBySection.id },
            });
            await prisma.curriculumLesson.update({
              where: {
                id: existingByTitle.id,
              },
              data: {
                ragSectionId: targetRagSectionId,
                description: `Subchapter ${subchapterNumber}: ${cleanSubchapterTitle}`,
                metadata: {
                  subchapterNumber,
                  chapterNumber,
                  partTitle,
                  subsubCount: sc.subsubs.length,
                },
              },
            });
          } else {
            // Safe to update the existing lesson
            await prisma.curriculumLesson.update({
              where: {
                id: existingBySection.id,
              },
              data: {
                title: lessonTitle,
                ragSectionId: targetRagSectionId,
                description: `Subchapter ${subchapterNumber}: ${cleanSubchapterTitle}`,
                metadata: {
                  subchapterNumber,
                  chapterNumber,
                  partTitle,
                  subsubCount: sc.subsubs.length,
                },
              },
            });
          }
        } else {
          // Try upsert by title, or create if doesn't exist
          await prisma.curriculumLesson.upsert({
            where: {
              unitId_title: {
                unitId: unit.id,
                title: lessonTitle,
              },
            },
            update: {
              // Update ragSectionId to point to the correct section (important after re-ingestion)
              ragSectionId: targetRagSectionId,
              description: `Subchapter ${subchapterNumber}: ${cleanSubchapterTitle}`,
              metadata: {
                subchapterNumber,
                chapterNumber,
                partTitle,
                subsubCount: sc.subsubs.length,
              },
            },
            create: {
              unitId: unit.id,
              ragSectionId: targetRagSectionId,
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
        }
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

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
