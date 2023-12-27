import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { Bot, Context, InputFile, Keyboard } from "grammy";
import EventHandler from "./EventHandler";
import JoinHandler from "./JoinHandler";

type UsersRowData = {
  id: number,
  joinedAt: Date,
  username: string,
  firstName: string,
  lastName: string,
  email: string,
  city: string,
  ayyMember: boolean,
  school?: string
};
type ActivesRowData = {
  id: number;
  username: string;
};

if (!(process.env.TELEGRAM_BOT_TOKEN && process.env.GOOGLE_SHEETS_ID && process.env.GSERVICE_EMAIL && process.env.GSERVICE_PRIVATE_KEY && process.env.AC_COMMUNITY_GROUP && process.env.ACTIVE_GROUP_ID)) {
  console.error("Required environment variables are not set!");
  process.exit();
}

const activeChatId = parseInt(process.env.ACTIVE_GROUP_ID || "");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

const serviceAccountAuth = new JWT({
  email: process.env.GSERVICE_EMAIL,
  key: process.env.GSERVICE_PRIVATE_KEY,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID || "", serviceAccountAuth);
await doc.loadInfo();
const sheet = doc.sheetsByIndex[0];
const activesSheet = doc.sheetsByIndex[1];
const incompleteSheet = doc.sheetsByIndex[2];
const preapprovedSheet = doc.sheetsByIndex[3];

const eventHandler = new EventHandler();
const joinHandler = new JoinHandler(sheet, incompleteSheet, preapprovedSheet);

async function findByTelegram(telegram: string) {
  const rows = await sheet.getRows<UsersRowData>();
  return rows.find((row) => row.get("username") === telegram);
}
async function findActive(id: number) {
  const rows = await activesSheet.getRows<ActivesRowData>();
  return rows.find((row) => parseInt(row.get("id")) === id);
}

async function checkPrivate(ctx: Context) {
  return (await ctx.getChat()).type === "private";
}

// this is only used for the /confirm command at the moment
const waitingForResponse: { [id: string]: string } = {};

bot.command("start", async (ctx) => {
  if (await checkPrivate(ctx) && ctx.from?.username) {
    const row = await findByTelegram(ctx.from?.username);
    if (row) {
      ctx.reply(`Hello ${ctx.from?.first_name}! I see you are already a member! You can use the /events command to see upcoming events or you can join the AC Community group here: ${process.env.AC_COMMUNITY_GROUP}`);
    } else {
      const keyboard = new Keyboard().persistent().text("Yes").text("No");
      ctx.reply(`Hello ${ctx.from?.first_name ? ctx.from?.first_name : ctx.from?.last_name}! Do you want to become an Aalto Cocktail member?`, { reply_markup: keyboard });
    }
  }
});

bot.command("join", async (ctx) => {
  if (await checkPrivate(ctx) && ctx.chat.id !== activeChatId) {
    startJoin(ctx);
  }
});


bot.command("download", async (ctx) => {
  if (await checkPrivate(ctx) && ctx.from?.id && await findActive(ctx.from.id)) {
    const xlsxBuffer = await doc.downloadAsXLSX();
    ctx.replyWithDocument(new InputFile(Buffer.from(xlsxBuffer), "sheet.xlsx"));
  }
});

// only for testing purposes
bot.command("deletemember", async (ctx) => {
  if (await checkPrivate(ctx) && ctx.from?.id && await findActive(ctx.from.id)) {
    const username = ctx.message?.text?.split("/deletemember ")[1];
    const row = await findByTelegram(username);
    if (row) {
      await row.delete();
      ctx.reply(`Deleted @${username}!`);
    }
  }
});

// this is kind of pointless at the moment since the Sheets file only includes new members who joined using the bot
bot.command("check", async (ctx) => {
  const username = ctx.message?.text?.split("/check ")[1];
  if (await checkPrivate(ctx) && username && ctx.from?.id && await findActive(ctx.from.id)) {
    if (await check(username)) {
      ctx.reply(`@${username} is a member.`);
    } else {
      ctx.reply(`@${username} is not a member!`);
    }
  }
});

async function check(username: string) {
  const row = await findByTelegram(username);
  if (row) {
    return true;
  } else {
    return false;
  }
}

async function confirm(ctx: Context, username: string) {
  if (username) {
    if (username.startsWith("@")) username = username.substring(1);
    if (await check(username)) {
      ctx.reply(`@${username} is already a member!`);
    } else {
      joinHandler.confirm(ctx, username);
    }
  }
}

bot.command("confirm", async (ctx) => {
  let username = ctx.message?.text?.split("/confirm ")[1];
  if (await checkPrivate(ctx) && ctx.from?.id && await findActive(ctx.from.id)) {
    if (username) {
      confirm(ctx, username);
    } else {
      let keyboard = new Keyboard();
      const waiting = Object.values(joinHandler.attempts).filter(attempt => attempt.step === "done");
      if (waiting.length > 0) {
        waiting.forEach((attempt, i) => {
          keyboard.text(`@${attempt.username}`);
          if (i % 3 === 2) keyboard = keyboard.row();
        });
        keyboard = keyboard.text("/cancel");
        waitingForResponse[ctx.from.id] = "confirm";
        ctx.reply("Who do you want to confirm?", { reply_markup: keyboard });
      } else {
        ctx.reply("No one to confirm!", { reply_markup: { remove_keyboard: true } });
      }
    }
  }
});

// only used for cancelling the /confirm command at the moment
bot.command("cancel", async (ctx) => {
  if (await checkPrivate(ctx) && ctx.from?.id && waitingForResponse[ctx.from.id]) {
    delete waitingForResponse[ctx.from.id];
    ctx.reply("Cancelled!", { reply_markup: { remove_keyboard: true } });
  }
});

// useful for getting the Active group chat ID for the .env file
bot.command("chatid", async (ctx) => {
  const chat = await ctx.getChat();
  ctx.reply(`Chat ID: ${chat.id}`);
});

bot.command("events", async (ctx) => {
  if (eventHandler.events.length > 0) {
    eventHandler.events.forEach((event) => {
      if (event.image) {
        ctx.replyWithPhoto(event.image, {
          caption: `<b>${event.what}</b>\nOn ${event.when} at ${event.where}\n\n<a href="${event.url}">Get tickets here »</a>`,
          parse_mode: "HTML"
        });
      } else {
        ctx.reply(`<b>${event.what}</b>\nOn ${event.when} at ${event.where}\n\n<a href="${event.url}">Get tickets here »</a>`, {
          parse_mode: "HTML"
        });
      }
    });
  } else {
    ctx.reply("No upcoming events with tickets available!");
  }
});

async function startJoin(ctx: Context) {
  if (ctx.from?.username) {
    const row = await findByTelegram(ctx.from?.username);
    if (row) {
      ctx.reply(`You are already a member! You can use the /events command to see upcoming events or you can join the AC Community group here: ${process.env.AC_COMMUNITY_GROUP}`, { reply_markup: { remove_keyboard: true } });
    } else {
      joinHandler.newAttempt(ctx);
    }
  }
}

bot.on("message", async (ctx) => {

  if (ctx.chat.id === activeChatId) {

    if (ctx.message?.new_chat_members && ctx.message.new_chat_members.length > 0) {
      for (let index = 0; index < ctx.message.new_chat_members.length; index++) {
        const member = ctx.message.new_chat_members[index];
        if (member.username) {
          const checkActive = await findActive(member.id);
          if (!checkActive) {
            await activesSheet.addRow({
              id: member.id,
              username: member.username,
            });
          }
        }
      }
    }
    if (ctx.message?.left_chat_member && ctx.message.left_chat_member.username) {
      const checkActive = await findActive(ctx.message.left_chat_member.id);
      if (checkActive) {
        await checkActive.delete();
      }
    }
    
  } else {

    if (waitingForResponse[ctx.from.id]) {
      switch (waitingForResponse[ctx.from.id]) {
        case "confirm":
          if (ctx.message?.text) confirm(ctx, ctx.message.text);
          break;
      };
    } else if (ctx.from?.id && joinHandler.attempts[ctx.from.id]) {
      joinHandler.onMessage(ctx);
    } else {
      if (await check(ctx.from?.username || "")) {
        //ctx.reply("Sorry, I didn't understand that. You can use the /join command to become a member or /events to see upcoming events.", { reply_markup: { remove_keyboard: true } })
      } else {
        if (ctx.message?.text === "Yes") {
          startJoin(ctx);
        } else if (ctx.message?.text === "No") {
          ctx.reply("No worries, you can always join later by typing /join!", { reply_markup: { remove_keyboard: true } });
        }
      }
    }

  }

});

bot.start();
console.log("Bot started at " + new Date().toLocaleString());