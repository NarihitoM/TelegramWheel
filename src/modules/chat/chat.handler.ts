import { Composer } from "grammy";
import type { BotContext } from "../../shared/types/context.js";
import { deactivateChat, isGroupChat, saveChat } from "./chat.service.js";

const WELCOME =
  "Thanks for adding me!\n\n" +
  "To spin the wheel:\n" +
  "1. Add the helper account to this chat (admin is needed for channels).\n" +
  "2. Send /wheel and pick how many groups and members per group.\n\n" +
  "In a channel, send /wheel to me in a private chat instead.";

export const chatHandler = new Composer<BotContext>();

chatHandler.on("my_chat_member", async (ctx) => {
  const { chat, new_chat_member: member, from } = ctx.myChatMember;
  if (!isGroupChat(chat)) {
    return;
  }

  if (member.status === "left" || member.status === "kicked") {
    await deactivateChat(chat.id);
    return;
  }

  await saveChat(chat, from.id);
  const wasOutside = ["left", "kicked"].includes(ctx.myChatMember.old_chat_member.status);
  if (wasOutside) {
    await ctx.api.sendMessage(chat.id, WELCOME).catch(() => undefined);
  }
});
