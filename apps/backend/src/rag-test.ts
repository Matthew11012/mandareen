import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RagIngestCommand } from './rag/rag-ingest.command';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ragIngestCommand = app.get(RagIngestCommand);

  // Example usage
  const filePath = process.argv[2];
  const title = process.argv[3];
  const batchSize = parseInt(process.argv[4]) || 50;
  const generateEmbeddings = process.argv[5] === 'true';

  if (!filePath) {
    console.log(
      'Usage: node dist/rag-test.js <file-path> [title] [batch-size] [generate-embeddings]',
    );
    console.log(
      'Example: node dist/rag-test.js "grammar.md" "Modern Mandarin Grammar" 25 true',
    );
    process.exit(1);
  }

  try {
    await ragIngestCommand.run(filePath, title, batchSize, generateEmbeddings);
    console.log('✅ RAG ingestion completed successfully!');
  } catch (error) {
    console.error('❌ RAG ingestion failed:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
