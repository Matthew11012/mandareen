# Mandareen: Your Personal AI Mandarin Tutor

Mandareen is an AI-driven web application designed to provide a personalized and immersive Mandarin learning experience. It started as a personal project to create a better, more engaging learning tool and has evolved into a feature-complete platform that adapts to your unique learning pace and style.

## The Story Behind Mandareen

The journey of Mandareen began with a simple goal: to learn Mandarin more effectively. Frustrated with the limitations of existing apps—generic content, restrictive paywalls, and a lack of engaging practice—I set out to build my own tool. The idea was to create an AI-powered tutor that could generate unlimited, personalized lessons on topics I was actually interested in, at the precise difficulty I needed.

This project chronicles the journey of building that vision, from a robust backend to complex, real-time AI features that bring the learning experience to life.

## Screenshots

Here are some screenshots of the application in action:

| Dashboard | Curriculum | Lesson Viewer |
| :---: | :---: | :---: |
| ![Dashboard](apps/frontend/public/dashboard.png) | ![Curriculum](apps/frontend/public/lessons.png) | ![Lesson Viewer](apps/frontend/public/lessons_viewer_story.png) |
| **Flashcard Capture** | **Flashcard Review** | **AI Conversation** |
| ![Flashcard Capture](apps/frontend/public/Popup_info_and_addtoflashcard.png) | ![Flashcard Review](apps/frontend/public/flashcards.png) | ![AI Conversation](apps/frontend/public/conversations.png) |

## Core Features

Mandareen combines a structured curriculum with powerful AI tools to create a comprehensive learning ecosystem.

### Personalized Learning Path
*   **Adaptive Proficiency Assessment:** Take an initial assessment to determine your HSK level. The app uses AI-generated passages where you mark words as "Known," "Partial," or "Unknown" to accurately place you.
*   **Structured Curriculum:** Follow a guided learning path based on the *Modern Mandarin Chinese Grammar* textbook. The curriculum is organized into units and lessons, allowing for progressive learning.
*   **Freestyle AI-Generated Lessons:** Generate custom stories and dialogues on any topic, tailored to your proficiency level.

### Interactive Content & Practice
*   **Real-Time Conversation Practice:** Engage in speech-to-speech conversations with an AI tutor. The system provides real-time transcription, pinyin, translation, and audio playback for every message.
*   **AI Tutor Notes:** Get instant, context-aware grammar explanations and tips for AI messages, powered by a Retrieval-Augmented Generation (RAG) system.
*   **Interactive Lesson Viewer:** Read lessons with toggles for pinyin and translation to suit your learning style.

### Vocabulary & Review
*   **Seamless Flashcard Capture:** Click any word in a lesson or conversation to see its definition and instantly add it to your flashcards. The source sentence is saved to provide context during review.
*   **Spaced Repetition System (SRS):** Reinforce your learning with a built-in flashcard system based on the SM-2 algorithm.
*   **Comprehensive Dictionary:** A full-featured, searchable dictionary with HSK filtering and infinite scroll.

### Gamification & Progress Tracking
*   **Words Read Counter:** See the total number of unique words you've encountered.
*   **Daily Lesson Streak:** Stay motivated by tracking your daily study consistency.
*   **HSK Progress Visualization:** View charts that show your progress in words read and lessons completed, broken down by HSK level.

## Technology Stack

Mandareen is a monorepo built with a modern, scalable tech stack.

*   **Frontend:** Next.js (React), TypeScript, Tailwind CSS, Shadcn/UI, Zustand, `next-pwa`
*   **Backend:** NestJS, TypeScript, PostgreSQL, Prisma ORM
*   **AI & Services:**
    *   **LLMs:** OpenAI API (GPT-4o-mini, Whisper for STT, TTS)
    *   **Embeddings:** Google Gemini (`gemini-embedding-001`)
    *   **Vector Database:** `pgvector` for the RAG system
    *   **Deployment:** Docker

## Architecture

The project is architected as a monorepo with a Next.js frontend and a NestJS backend.

```mermaid
graph TD
  subgraph Frontend
    A[Browser / PWA]
    A -->|HTTPS| B[Next.js API Routes]
    A -->|WebRTC| H[Realtime Audio Stream]
  end
  subgraph Backend
    B --> C[NestJS Backend]
    H --> C
    C --> D[PostgreSQL / pgvector]
    C --> E[Redis Cache]
    C --> F[S3 / CloudFront (Audio)]
    C -->|REST / HTTP| G[OpenAI & Gemini APIs]
  end
  style Frontend fill:#eef,stroke:#333,stroke-width:1px
  style Backend fill:#fee,stroke:#933,stroke-width:1px
```

The AI's intelligence is powered by a **Retrieval-Augmented Generation (RAG)** system. It uses a `pgvector` database to perform HNSW-indexed similarity searches on a knowledge base derived from a Mandarin grammar textbook. This allows the AI to provide highly accurate, context-aware grammar notes and generate structured lesson content.

## Project Status

**Feature-Complete.** All core features described above are fully implemented. The current focus is on final polishing, implementing a lesson completion quiz, and preparing for user testing.

## Getting Started

### Prerequisites
*   Node.js & npm
*   Docker & Docker Compose

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/mandareen.git
    cd mandareen
    ```

2.  **Backend Setup:**
    *   Navigate to the backend directory: `cd apps/backend`
    *   Install dependencies: `npm install`
    *   Set up the database. A `docker-compose.yml` file with a PostgreSQL instance and `pgvector` is recommended.
    *   Create a `.env` file and add your `DATABASE_URL`, `OPENAI_API_KEY`, and other necessary environment variables.
    *   Run database migrations: `npx prisma migrate dev`
    *   (Optional) Seed the database with the dictionary and HSK data.
    *   Start the backend server: `npm run start:dev`

3.  **Frontend Setup:**
    *   Navigate to the frontend directory: `cd apps/frontend`
    *   Install dependencies: `npm install`
    *   Start the frontend development server: `npm run dev`

4.  **Access the application:**
    *   Open your browser and go to `http://localhost:3000`.

## Next Steps

*   Implement the final "Lesson Completion Quiz" feature.
*   Conduct user testing to gather feedback and identify areas for improvement.
*   Continue to refine the UI/UX and overall application performance.
