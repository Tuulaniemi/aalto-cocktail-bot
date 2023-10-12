# aalto-cocktail-bot

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.0.3. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

The bot uses Google Sheets as a data store. Originally only the processed membership applications were going to be output there, but some additional features required more tables for storing temporary and permanent data. I might move everything but the final output to an SQLite database. The bot runs on [grammY](https://grammy.dev/), and [google-spreadsheet](https://theoephraim.github.io/node-google-spreadsheet/#/) is used for interfacing with the Sheets API via a Service Account that is authenticated using [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs).

## Environment variables

- TELEGRAM_BOT_TOKEN: self-explanatory
- GSERVICE_EMAIL: the Google Cloud Service Account that has editing privileges for the Google Sheets file
- GSERVICE_PRIVATE_KEY: private key for the Service Account
- GOOGLE_SHEETS_ID: the Google Sheets file ID, part of the URL
- ACTIVE_GROUP_ID: ID of the Telegram group that determines /confirm privileges 
- AC_COMMUNITY_GROUP: URL of the AC Community Telegram group that's shared with new members