# Telegram Spin Wheel Bot

A Telegram bot that splits a group's or channel's members into random groups. Anyone in the chat sends `/wheel`, chooses the number of groups and the members per group with inline buttons, and the bot posts the result as text and as an image.

Built with Node.js, TypeScript, [grammY](https://grammy.dev), [GramJS](https://gram.js.org), Prisma (Postgres) and `@vercel/og`. It runs on Vercel as a webhook.

Made by Narihito.

## How it works

```
User: /wheel
Bot:  Found 23 members. How many groups?
      [2] [3] [4] [5]
      [6] [7] [8] [Custom]
User: taps [4]
Bot:  4 groups. How many members per group?
      [1] [2] [3] [4] [5] [Custom]
User: taps [5]
Bot:  4 groups x 5 members from 23 members, 3 left out. Spin?
      [Spin] [Back] [Cancel]
User: taps [Spin]
Bot:  posts the result as text and as an image
```

- Buttons only offer choices that fit the member count. For example, with 6 members, picking 3 groups offers `[1] [2]` members per group. When only one size fits, the bot skips that question.
- Anyone in the chat can start a wheel. Each chat has a 10 second cooldown between wheels.
- Only the person who started a wheel can press its buttons.
- Members left over after the split are listed as "Not picked".
- `/start` explains how to use the bot.
- `/credit` shows who made the bot.

### Why a userbot is needed

The Telegram Bot API does not let bots list the members of a chat. This project logs in a separate Telegram user account (the "helper account") with GramJS, and that account reads the member list. The helper account must:

- be a member of every group you want to spin
- be an admin in channels, and in groups that hide their member list

Use a dedicated account for this, not your personal one.

### Channels

Users can't send commands inside a channel. Instead, send `/wheel` to the bot in a private chat and pick the channel from the list. The bot needs permission to post in the channel.

## Setup

### 1. Requirements

- Node.js 20 or newer
- A Postgres database (for example a free [Neon](https://neon.tech) project)
- A bot token from [@BotFather](https://t.me/BotFather)
- `api_id` and `api_hash` for the helper account from [my.telegram.org](https://my.telegram.org)

### 2. Install

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Bot token from @BotFather |
| `WEBHOOK_SECRET` | Any random string. Telegram sends it back so the webhook can reject fake requests |
| `WEBHOOK_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` |
| `DATABASE_URL` | Postgres connection string |
| `TG_API_ID` | Helper account api_id |
| `TG_API_HASH` | Helper account api_hash |
| `TG_SESSION` | Helper account session string (see below) |

### 3. Log in the helper account

```bash
npm run userbot:login
```

Enter the phone number, login code and 2FA password (if any). Copy the printed string into `TG_SESSION`. Keep it secret, because it gives full access to that account.

### 4. Create the database tables

```bash
npm run db:deploy
```

### 5. Run locally

```bash
npm run dev
```

This removes any webhook and runs the bot with long polling. Add the bot and the helper account to a test group, then send `/wheel`.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. In Project Settings -> Environment Variables, add every variable from `.env`.
3. Deploy. The webhook endpoint is `https://your-app.vercel.app/api/webhook`.
4. Apply migrations to the production database:
   ```bash
   npm run db:deploy
   ```
5. Register the webhook and the command menu, with `WEBHOOK_URL` in your local `.env` set to the Vercel URL:
   ```bash
   npm run webhook:set
   ```

To go back to local development, run `npm run dev` (it deletes the webhook). Run `npm run webhook:set` again afterwards.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the bot locally with long polling |
| `npm test` | Run unit tests |
| `npm run typecheck` | Type-check the project |
| `npm run userbot:login` | Create the helper account session string |
| `npm run webhook:set` | Set the Telegram webhook and bot commands |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply migrations in production |

## Project structure

```
api/webhook.ts                  Vercel function that receives Telegram updates
src/bot.ts                      Bot setup, session storage, handlers
src/dev.ts                      Local long polling runner
src/modules/chat/               Tracks chats the bot is added to, cooldown
src/modules/spin/               /wheel flow, keyboards, split logic, text and image output
src/modules/members/            Reads chat members with the helper account
src/modules/start/              /start and /help command, also sent when the bot joins a chat
src/modules/credit/             /credit command
src/shared/                     Env config, Prisma client, userbot client, context types
scripts/                        Userbot login and webhook setup
prisma/schema.prisma            Database schema
```

## Limits

- The bot reads up to 10,000 members per chat.
- The image shows up to 15 names per group. The text message always has the full list.
- Names in scripts the bundled font doesn't cover may not render in the image. The text message is unaffected.

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

1. **check**: `npm ci`, `npm run typecheck`, `npm test`
2. **deploy**: on pushes to `main` that pass the checks, builds and deploys to Vercel production

The deploy job needs these repository secrets (Settings -> Secrets and variables -> Actions):

| Secret | Where to find it |
| --- | --- |
| `VERCEL_TOKEN` | Vercel -> Account Settings -> Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` after running `npx vercel link` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after running `npx vercel link` |

If the secrets are not set, the deploy job skips itself. If you deploy with this workflow, turn off Vercel's own Git deployments (Project Settings -> Git) so each push is deployed only once.
