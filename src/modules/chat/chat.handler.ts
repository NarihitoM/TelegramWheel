import { Composer } from "grammy";
import type { BotContext } from "../../shared/types/context.js";
import { START_MESSAGE } from "../start/start.handler.js";
import { deactivateChat, isGroupChat, saveChat } from "./chat.service.js";

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
    await ctx.api.sendMessage(chat.id, START_MESSAGE, { parse_mode: "HTML" }).catch(() => undefined);
  }
});
