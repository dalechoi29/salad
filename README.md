# Salad Subscription & Review Web

Office salad subscription and review platform for corporate employees.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **i18n**: next-intl (Korean, English)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase account (free tier)

### Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.local` and set your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
  app/[locale]/          # Locale-based routing (ko, en)
    (auth)/              # Login, signup pages
    admin/               # Admin panel
    community/           # Community posts
    menu/                # Menu browsing & selection
    my/                  # User dashboard
  components/
    layout/              # Header, bottom nav, sidebar
    providers/           # Theme provider
    shared/              # Reusable composite components
    ui/                  # shadcn/ui components
  i18n/                  # Internationalization config
  lib/
    supabase/            # Supabase client helpers
    utils.ts             # Utility functions
  messages/              # Translation files (ko.json, en.json)
  types/                 # TypeScript type definitions
```

## Features

See [README_PRD.md](./README_PRD.md) for the full product requirements document.
