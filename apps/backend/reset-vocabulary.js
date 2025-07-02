const { PrismaClient } = require('@prisma/client');

async function resetVocabulary() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Starting complete vocabulary reset...');
    
    // Delete all vocabulary items
    console.log('Deleting all vocabulary items...');
    const deleteResult = await prisma.vocabularyItem.deleteMany({});
    console.log(`Deleted ${deleteResult.count} vocabulary items`);
    
    // Reset the ID sequence (optional, for clean numbering)
    try {
      await prisma.$executeRaw`ALTER SEQUENCE "VocabularyItem_id_seq" RESTART WITH 1;`;
      console.log('Reset ID sequence');
    } catch (error) {
      console.log('Note: Could not reset ID sequence (this is fine)');
    }
    
    // Verify table is empty
    const count = await prisma.vocabularyItem.count();
    console.log(`Vocabulary table now has ${count} entries`);
    
    console.log('\n✅ Vocabulary reset complete!');
    console.log('\nNext steps:');
    console.log('1. Run CC-CEDICT import: POST /api/dictionary/full-import');
    console.log('2. Run HSK assignment: POST /api/dictionary/assign-hsk-levels');
    
  } catch (error) {
    console.error('Error resetting vocabulary:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetVocabulary(); 