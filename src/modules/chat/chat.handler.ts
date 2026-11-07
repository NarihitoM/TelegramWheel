import { Composer, type Context } from "grammy";
import { rememberMembers, syncAdmins } from "../members/members.service.js";
import { START_MESSAGE } from "../start/start.handler.js";
import { deactivateChat, isGroupChat, saveChat } from "./chat.service.js";

export const chatHandler = new Composer<Context>();

chatHandler.on("my_chat_member", async (ctx) => {
  const { chat, new_chat_member: member, old_chat_member: previous, from } = ctx.myChatMember;
  if (!isGroupChat(chat)) {
    return;
  }

  if (member.status === "left" || member.status === "kicked") {
    await deactivateChat(chat.id);
    return;
  }

  await saveChat(chat, from.id);
  await rememberMembers(chat.id, [from]);
  await syncAdmins(ctx.api, chat.id);

  if (previous.status === "left" || previous.status === "kicked") {
    await ctx.api.sendMessage(chat.id, START_MESSAGE, { parse_mode: "HTML" }).catch(() => undefined);
  }
});
