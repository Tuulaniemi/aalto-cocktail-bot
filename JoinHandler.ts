import { GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { Context, Keyboard } from "grammy";

type PreapprovedRowData = {
  id: number;
  username: string;
};
type IncompleteRowData = {
  id: number;
  username: string,
  firstName?: string,
  lastName?: string,
  email?: string,
  city?: string,
  ayyMember?: boolean,
  school?: string,
  step: Step
};

type Step = "start" | "firstAndLastNameCheck" | "askForFirstName" | "askForLastName" | "firstNameCheck" | "lastNameCheck" | "askForEmail" | "cityCheck" | "askForCity" | "ayyMemberCheck" | "schoolCheck" | "done";

const yesNoKeyboard = new Keyboard().persistent().text("Yes").text("No");

export default class JoinHandler {

  attempts: { [id: string]: JoinAttempt } = {};
  preapprovals: { [username: string]: Context } = {};
  sheet: GoogleSpreadsheetWorksheet;
  incompleteSheet: GoogleSpreadsheetWorksheet;
  preapprovedSheet: GoogleSpreadsheetWorksheet;

  constructor(sheet: GoogleSpreadsheetWorksheet, incompleteSheet: GoogleSpreadsheetWorksheet, preapprovedSheet: GoogleSpreadsheetWorksheet) {
    this.sheet = sheet;
    this.incompleteSheet = incompleteSheet;
    this.preapprovedSheet = preapprovedSheet;
    this.loadIncomplete();
  }

  loadIncomplete() {
    this.incompleteSheet.getRows<IncompleteRowData>().then((rows) => {
      rows.forEach((row) => {
        if (row.get("id") && row.get("username")) {
          const data = {
            step: row.get("step"),
            id: parseInt(row.get("id")),
            username: row.get("username"),
            firstName: row.get("firstName") && row.get("firstName").length > 0 ? row.get("firstName") : null,
            lastName: row.get("lastName") && row.get("lastName").length > 0 ? row.get("lastName") : null,
            email: row.get("email") && row.get("email").length > 0 ? row.get("email") : null,
            city: row.get("city") && row.get("city").length > 0 ? row.get("city") : null,
            ayyMember: row.get("ayyMember") === "TRUE" ? true : row.get("ayyMember") === "FALSE" ? false : undefined,
            school: row.get("school") && row.get("school").length > 0 ? row.get("school") : null
          }
          this.attempts[row.get("id")] = new JoinAttempt(null, this, data);
        }
      });
    });
  }

  newAttempt(ctx: Context) {
    if (ctx.from?.id) {
      if (this.attempts[ctx.from.id]) {
        this.attempts[ctx.from.id].onMessage(ctx);
      } else {
        this.attempts[ctx.from.id] = new JoinAttempt(ctx, this);
      }
    }
  }

  onMessage(ctx: Context) {
    if (ctx.from?.id && this.attempts[ctx.from.id]) {
      this.attempts[ctx.from.id].onMessage(ctx);
    }
  }

  async findPreapproved(username: string) {
    const rows = await this.preapprovedSheet.getRows<PreapprovedRowData>();
    return rows.find((row) => row.get("username") === username);
  }

  async findIncomplete(id: number) {
    const rows = await this.incompleteSheet.getRows<IncompleteRowData>();
    return rows.find((row) => parseInt(row.get("id")) === id);
  }

  async preapprove(ctx: Context, username: string) {
    if (ctx.from?.username) {
      const preapproved = await this.findPreapproved(username);
      if (preapproved) {
        ctx.reply(`@${username} has already been preapproved.`);
      } else {
        const row = await this.preapprovedSheet.addRow({ username });
        this.preapprovals[ctx.from.username] = ctx;
        ctx.reply(`@${username} is now preapproved.`);
      }
    }
  }

  async confirm(ctx: Context, username: string) {

    const attempt = Object.values(this.attempts).find((attempt) => attempt.username === username);
    if (attempt && attempt.id) {
      const { id, firstName, lastName, email, ayyMember, school, city } = attempt;
      console.log(id, firstName, lastName, email, ayyMember, school, city, username)
      if (id && username && firstName && lastName && email && city && ayyMember !== null && (ayyMember === false || school !== null)) {
        let data: { [name: string]: string | number | boolean | Date } = {
          id,
          joinedAt: new Date(),
          username,
          firstName,
          lastName,
          email,
          city,
          ayyMember
        }
        if (school) {
          data.school = school;
        }
        const row = await this.sheet.addRow(data);
        attempt.onApprove(attempt.approveContext);
        delete this.attempts[attempt.id];
        const preapproved = await this.findPreapproved(username);
        if (preapproved) await preapproved.delete();
        const incompleteRow = await this.findIncomplete(id);
        if (incompleteRow) await incompleteRow.delete();
        ctx.reply(`@${username} is now a member!`);
      } else {
        this.preapprove(ctx, username);
      }
    } else {
      this.preapprove(ctx, username);
    }
  }

}

class JoinAttempt {

  joinHandler: JoinHandler;
  id: number | null = null;
  username: string | null = null;
  firstName: string | null = null;
  lastName: string | null = null;
  email: string | null = null;
  ayyMember: boolean | null = null;
  school: string | null = null;
  city: string | null = null;
  approveContext: Context | null = null;
  lastActivity: Date = new Date();
  step: Step = "start"

  constructor(ctx: Context | null, joinHandler: JoinHandler, data?: IncompleteRowData) {
    this.joinHandler = joinHandler;
    if (ctx) {
      if (ctx.from?.id) this.id = ctx.from.id;
      if (ctx.from?.username) this.username = ctx.from.username;
      this.onMessage(ctx);
    } else if (data) {
      this.step = data.step;
      this.id = data.id;
      this.username = data.username;
      this.firstName = data.firstName ? data.firstName : null;
      this.lastName = data.lastName ? data.lastName : null;
      this.email = data.email ? data.email : null;
      this.city = data.city ? data.city : null;
      this.ayyMember = data.ayyMember === true || data.ayyMember === false ? data.ayyMember : null;
      this.school = data.school ? data.school : null;
    }
  }

  askForEmail(ctx: Context) {
    this.step = "askForEmail";
    ctx.reply("What is your email address?", { reply_markup: { remove_keyboard: true } });
  }

  askForFirstName(ctx: Context) {
    this.step = "askForFirstName";
    ctx.reply("What is your first name?", { reply_markup: { remove_keyboard: true } });
  }

  askForLastName(ctx: Context) {
    this.step = "askForLastName";
    ctx.reply("What is your last name?", { reply_markup: { remove_keyboard: true } });
  }

  cityCheck(ctx: Context) {
    this.step = "cityCheck";
    const keyboard = new Keyboard().persistent().text("Espoo").text("Helsinki").row().text("Vantaa").text("Other");
    ctx.reply("Which city do you live in?", { reply_markup: keyboard });
  }

  askForCity(ctx: Context) {
    this.step = "askForCity";
    ctx.reply("Which city do you live in?", { reply_markup: { remove_keyboard: true } });
  }

  ayyMemberCheck(ctx: Context) {
    this.step = "ayyMemberCheck";
    ctx.reply("Are you currently an AYY member?", { reply_markup: yesNoKeyboard });
  }

  schoolCheck(ctx: Context) {
    this.step = "schoolCheck";
    const keyboard = new Keyboard().persistent().text("ARTS").text("BIZ").text("CHEM").row().text("ELEC").text("ENG").text("SCI");
    ctx.reply("Which School do you belong to?", { reply_markup: keyboard });
  }

  async done(ctx: Context) {
    this.step = "done";
    this.approveContext = ctx;
    if (this.username && await this.joinHandler.findPreapproved(this.username)) {
      this.joinHandler.confirm(this.joinHandler.preapprovals[this.username], this.username);
    } else {
      ctx.reply("Your membership application is now pending approval. Once you pay the membership fee, you will be added to the members list.", { reply_markup: { remove_keyboard: true } });
    }
  }

  async onMessage(ctx: Context) {
    this.lastActivity = new Date();
    if (ctx.message?.text) {

      switch (this.step) {

        // the name checking is kind of cursed, but since people can use either a first name or a last name or both, and they might not be their actual names we'll just check every combination

        case "start":
          if (ctx.from?.first_name && ctx.from?.first_name.length > 0 && ctx.from?.last_name && ctx.from?.last_name.length > 0) {
            this.step = "firstAndLastNameCheck";
            ctx.reply(`Is <b>${ctx.from?.first_name}</b> your first name and <b>${ctx.from?.last_name}</b> your last name?`, { reply_markup: yesNoKeyboard, parse_mode: "HTML" });
          } else if (ctx.from?.first_name && ctx.from?.first_name.length > 0) {
            this.step = "firstNameCheck"; 
            ctx.reply(`Is <b>${ctx.from?.first_name}</b> your first name?`, { reply_markup: yesNoKeyboard, parse_mode: "HTML" });
          } else if (ctx.from?.last_name && ctx.from?.last_name.length > 0) {
            this.step = "lastNameCheck";
            ctx.reply(`Is <b>${ctx.from?.last_name}</b> your last name?`, { reply_markup: yesNoKeyboard, parse_mode: "HTML" });
          } else {
            this.askForFirstName(ctx);
          }
          break;

        case "firstAndLastNameCheck":
          if (ctx.message.text.toLowerCase() === "yes") {
            this.firstName = ctx.from?.first_name || "";
            this.lastName = ctx.from?.last_name || "";
            this.askForEmail(ctx);
          } else {
            this.askForFirstName(ctx);
          }
          break;

        case "askForFirstName":
          if (ctx.message.text.trim().length > 0) {
            this.firstName = ctx.message.text;
            if (this.lastName) {
              this.askForEmail(ctx);
            } else {
              this.askForLastName(ctx);
            }
          } else {
            ctx.reply("Please enter a valid first name.");
          }
          break;

        case "askForLastName":
          if (ctx.message.text.trim().length > 0) {
            this.lastName = ctx.message.text;
            if (this.firstName) {
              this.askForEmail(ctx);
            } else {
              this.askForFirstName(ctx);
            }
          } else {
            ctx.reply("Please enter a valid last name.");
          }
          break;

        case "firstNameCheck":
          if (ctx.message.text.toLowerCase() === "yes") {
            this.firstName = ctx.from?.first_name || "";
            this.askForLastName(ctx);
          } else {
            this.askForFirstName(ctx);
          }
          break;

        case "lastNameCheck":
          if (ctx.message.text.toLowerCase() === "yes") {
            this.lastName = ctx.from?.last_name || "";
            this.askForFirstName(ctx);
          } else {
            this.askForLastName(ctx);
          }
          break;

        case "askForEmail":
          if (ctx.message.text.trim().length > 4 && ctx.message.text.includes("@") && ctx.message.text.includes(".")) {
            this.email = ctx.message.text;
            this.cityCheck(ctx);
          } else {
            ctx.reply("Please enter a valid email address.");
          }
          break;

        case "cityCheck":
          if (ctx.message.text.trim().length > 0 && ["espoo", "helsinki", "vantaa"].includes(ctx.message.text.toLowerCase())) {
            this.city = ctx.message.text;
            this.ayyMemberCheck(ctx);
          } else {
            this.askForCity(ctx);
          }
          break;

        case "askForCity":
          if (ctx.message.text.trim().length > 0) {
            this.city = ctx.message.text;
            this.ayyMemberCheck(ctx);
          } else {
            ctx.reply("Please enter a valid city name.");
          }
          break;

        case "ayyMemberCheck":
          if (ctx.message.text.toLowerCase() === "yes") {
            this.ayyMember = true;
            this.schoolCheck(ctx);
            await this.saveIncomplete();
          } else if (ctx.message.text.toLowerCase() === "no") {
            this.ayyMember = false;
            this.done(ctx);
            await this.saveIncomplete();
          } else {
            ctx.reply("Please answer Yes or No.");
          }
          break;

        case "schoolCheck":
          if (["arts", "biz", "chem", "elec", "eng", "sci"].includes(ctx.message.text.toLowerCase())) {
            this.school = ctx.message?.text?.toUpperCase() || "";
            this.done(ctx);
            await this.saveIncomplete();
          } else {
            ctx.reply("Please choose one of the options.");
          }
          break;

        case "done":
          this.done(ctx);
          break;

      }

    }
  }

  onApprove(ctx: Context | null) {
    ctx?.reply(`Your membership application has been approved! Join the AC Community group here: ${process.env.AC_COMMUNITY_GROUP}`, { reply_markup: { remove_keyboard: true } });
  }

  // should probably not call this at every step since there's probably a call limit on the Sheets API
  async saveIncomplete() {
    if (!this.id) return;
    const row = await this.joinHandler.findIncomplete(this.id);
    if (row) await row.delete();
    const data: { [key: string]: any } = {
      step: this.step,
      id: this.id,
      username: this.username
    }
    if (this.firstName) data.firstName = this.firstName;
    if (this.lastName) data.lastName = this.lastName;
    if (this.email) data.email = this.email;
    if (this.city) data.city = this.city;
    if (this.ayyMember !== null) data.ayyMember = this.ayyMember;
    if (this.school) data.school = this.school;
    await this.joinHandler.incompleteSheet.addRow(data);
  }

}