# MailSentinel Web

The public Next.js application in the MailSentinel monorepo.

## Getting Started

From the repository root, run the development server:

```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The application uses the Next.js App Router and Tailwind CSS.

The application uses the Next.js App Router and Tailwind CSS. Server-only environment parsing lives in `src/server/env.ts`; browser code must not import it.
