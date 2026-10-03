import type { Article } from "../types";

/** Editorial articles: practical guidance only, no figures that would need a source. */
export const ARTICLES: Omit<Article, "authorId">[] = [
  {
    id: "art_seed_choose",
    slug: "how-to-choose-your-first-ai-course",
    title: "How to choose your first AI course",
    summary: "A short guide to picking a starting point by what you want to do, how much time you have and whether you code.",
    tags: ["getting started", "ai"],
    hubSlugs: ["agentic-ai", "generative-ai", "python-and-data"],
    sources: [],
    status: "published",
    authorName: "Scholarion Academy editorial team",
    createdAt: "2026-09-10T14:00:00.000Z",
    publishedAt: "2026-09-10T14:00:00.000Z",
    body: `There are a lot of AI courses, and most of them look alike from the outside. The fastest way to choose is to start from what you want to be able to do, not from a topic name.

## Start from the task

Ask yourself what you'd like to do differently in three months. "Write better prompts at work" points to a prompt engineering certificate. "Build a feature that answers questions from our documents" points to retrieval and agents. "Understand the code my team writes" points to Python first.

## Be honest about coding

If you don't program yet, start with Python Programming. Every AI builder track assumes you can read and write small Python programs, and the labs grade your code automatically, so you'll know where you stand.

If you already code, Agentic AI Foundations is a short course you can audit for free. It shows how an agent loop works and gives you a feel for the builder track before you commit.

## Check the time, not just the price

Each program lists its estimated hours. Divide by the hours you can give each week. A plan you can keep is worth more than an ambitious one you abandon in week three.

## Try before you pay

- Audit a course to see the teaching style and the first readings.
- Open a lab to see how hands-on it is.
- Read the syllabus to check the topics match the task you started from.

When you're ready for graded work, labs and a credential, upgrade that course or use Scholarion Plus if you plan to take several.`,
  },
  {
    id: "art_seed_credentials",
    slug: "what-scholarion-credentials-are",
    title: "What Scholarion credentials are, and what they aren't",
    summary: "Our certificates and badges are digitally signed records of what you completed. Here's how verification works and how to describe them accurately.",
    tags: ["credentials", "certificates"],
    hubSlugs: ["agentic-ai", "ai-for-leaders"],
    sources: [],
    status: "published",
    authorName: "Scholarion Academy editorial team",
    createdAt: "2026-09-18T14:00:00.000Z",
    publishedAt: "2026-09-18T14:00:00.000Z",
    body: `When you finish a course or program, Scholarion issues a credential automatically. It's worth knowing exactly what that credential says, so you can share it with confidence.

## A signed record of completion

Each credential is an Open Badges 3.0 style verifiable credential. It names you, the program and the date, and it carries a digital signature from Scholarion Academy. Change any detail and the signature no longer matches.

## How someone checks it

Every credential has a public verification page and a QR code. When an employer opens the page, it checks the signature and whether the credential has been revoked, every time. The PDF you download is a convenient copy; the verification page is the proof.

## How to describe it

Scholarion credentials are non-credit professional training. On a CV or profile, list the program name, "Scholarion Academy" as the issuer, the date and the verification link. Describe what you built in the labs and projects; that's usually more convincing than the title alone.

## Sharing

- Add it to your professional profile with the prefilled link on the Credentials page.
- Download the wallet file if you keep credentials in a digital wallet.
- Send the verification link, not a screenshot.`,
  },
  {
    id: "art_seed_audit",
    slug: "auditing-versus-full-access",
    title: "Auditing versus full access: what you get with each",
    summary: "Auditing is free and lets you study the material. Full access adds graded work, labs, the AI Tutor and a credential. Here's how to decide.",
    tags: ["pricing", "getting started"],
    hubSlugs: ["python-and-data", "generative-ai"],
    sources: [],
    status: "published",
    authorName: "Scholarion Academy editorial team",
    createdAt: "2026-09-24T14:00:00.000Z",
    publishedAt: "2026-09-24T14:00:00.000Z",
    body: `Many Scholarion courses can be audited for free. Auditing is a real way to learn, not a trial that expires, but it leaves out the parts that cost us money to run or that lead to a credential.

## What auditing includes

You can watch the videos, read the readings, follow the discussions and see the syllabus. The AI Tutor is available as a short preview.

## What full access adds

- Graded quizzes, labs and projects, with feedback.
- Cloud Lab workspaces with autograded tests.
- The AI Tutor, within each item's rules (hints only in labs, off in graded quizzes).
- A verifiable credential when you complete the requirements.

## Ways to get full access

Buy a single course, subscribe to a program, or use Scholarion Plus to cover most programs while you're subscribed. Financial aid is available if cost is the barrier; applying takes a few minutes and a person reviews every application.

## A simple rule

If you want to know whether a topic suits you, audit. If you want to prove you can do it, go for full access.`,
  },
];
