const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Tone mark mappings for each vowel
const toneMappings = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'], 
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
  // Alternative spellings
  v: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'] // v is sometimes used for ü
};

function convertNumberedPinyinToAccented(pinyin) {
  if (!pinyin || typeof pinyin !== 'string') {
    return pinyin;
  }

  // Split by spaces to handle multiple syllables
  return pinyin.split(' ').map(syllable => {
    // Extract tone number (1-4) from end of syllable
    const toneMatch = syllable.match(/([1-4])$/);
    if (!toneMatch) {
      return syllable; // No tone number found, return as-is
    }

    const tone = parseInt(toneMatch[1]);
    const syllableWithoutTone = syllable.slice(0, -1);

    // Apply tone rules based on priority:
    // 1. If 'a' or 'e' exists, it gets the tone
    // 2. If 'ou' exists, 'o' gets the tone  
    // 3. Otherwise, the last vowel gets the tone

    let result = syllableWithoutTone;

    // Rule 1: 'a' or 'e' gets priority
    if (result.includes('a')) {
      result = result.replace(/a/, toneMappings.a[tone]);
    } else if (result.includes('e')) {
      result = result.replace(/e/, toneMappings.e[tone]);
    } 
    // Rule 2: 'ou' - 'o' gets the tone
    else if (result.includes('ou')) {
      result = result.replace(/o/, toneMappings.o[tone]);
    }
    // Rule 3: Last vowel gets the tone
    else {
      // Find all vowels and their positions
      const vowelMatches = [...result.matchAll(/[aeiouüv]/g)];
      if (vowelMatches.length > 0) {
        const lastVowel = vowelMatches[vowelMatches.length - 1];
        const vowelChar = lastVowel[0];
        const position = lastVowel.index;
        
        if (toneMappings[vowelChar]) {
          const accentedVowel = toneMappings[vowelChar][tone];
          result = result.substring(0, position) + accentedVowel + result.substring(position + 1);
        }
      }
    }

    return result;
  }).join(' ');
}

async function convertPinyinInDatabase() {
  console.log('Starting pinyin tone conversion...');
  
  try {
    // Get all vocabulary items with pinyin
    const vocabularyItems = await prisma.vocabularyItem.findMany({
      select: { id: true, pinyin: true }
    });

    console.log(`Found ${vocabularyItems.length} vocabulary items to process`);

    let updated = 0;
    let errors = 0;
    const batchSize = 100;

    // Process in batches
    for (let i = 0; i < vocabularyItems.length; i += batchSize) {
      const batch = vocabularyItems.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vocabularyItems.length / batchSize)}`);

      for (const item of batch) {
        try {
          const originalPinyin = item.pinyin;
          
          // Skip null or empty pinyin
          if (!originalPinyin) continue;
          
          const convertedPinyin = convertNumberedPinyinToAccented(originalPinyin);
          
          // Only update if conversion actually changed something
          if (convertedPinyin !== originalPinyin) {
            await prisma.vocabularyItem.update({
              where: { id: item.id },
              data: { pinyin: convertedPinyin }
            });
            updated++;
            
            if (updated % 50 === 0) {
              console.log(`Sample conversion: "${originalPinyin}" → "${convertedPinyin}"`);
            }
          }
        } catch (error) {
          console.error(`Error processing item ${item.id}:`, error);
          errors++;
        }
      }
    }

    // Also convert Message table pinyin
    console.log('Converting pinyin in Messages table...');
    const messages = await prisma.message.findMany({
      select: { id: true, pinyin: true }
    });

    let messagesUpdated = 0;
    for (const message of messages) {
      try {
        const originalPinyin = message.pinyin;
        
        // Skip null or empty pinyin
        if (!originalPinyin) continue;
        
        const convertedPinyin = convertNumberedPinyinToAccented(originalPinyin);
        
        if (convertedPinyin !== originalPinyin) {
          await prisma.message.update({
            where: { id: message.id },
            data: { pinyin: convertedPinyin }
          });
          messagesUpdated++;
        }
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        errors++;
      }
    }

    console.log('\n=== Conversion Complete ===');
    console.log(`Vocabulary items updated: ${updated}`);
    console.log(`Messages updated: ${messagesUpdated}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total processed: ${vocabularyItems.length + messages.length}`);

  } catch (error) {
    console.error('Fatal error during conversion:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Test function to validate conversion logic
function testConversions() {
  const testCases = [
    'zai4',      // → zài
    'ni3 hao3', // → nǐ hǎo  
    'xie4 xie4', // → xiè xiè
    'mei2 you3', // → méi yǒu
    'zhong1 guo2', // → zhōng guó
    'dou1',      // → dōu (ou rule)
    'nü3',       // → nǔ (ü handling)
    'v3',        // → ǔ (v handling)
    'liang3',    // → liǎng (last vowel rule)
    'already-accented' // → already-accented (no change)
  ];

  console.log('\n=== Testing Conversion Logic ===');
  testCases.forEach(test => {
    const result = convertNumberedPinyinToAccented(test);
    console.log(`"${test}" → "${result}"`);
  });
}

// Run tests first, then actual conversion
if (require.main === module) {
  testConversions();
  
  console.log('\nProceed with database conversion? (y/N)');
  
  process.stdin.once('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    if (input === 'y' || input === 'yes') {
      convertPinyinInDatabase();
    } else {
      console.log('Conversion cancelled.');
      process.exit(0);
    }
  });
}

module.exports = { convertNumberedPinyinToAccented }; 