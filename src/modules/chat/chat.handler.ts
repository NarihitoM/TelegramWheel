import { Composer, type Context } from "grammy";
import { syncAvatars } from "../members/avatar.service.js";
import { listKnownMembers, loadChatMembers, rememberMembers, syncAdmins } from "../members/members.service.js";
import { START_MESSAGE } from "../start/start.handler.js";
import { deactivateChat, isGroupChat, saveChat } from "./chat.service.js";

const MAX_PREFETCH_AVATARS = 200;
const PREFETCH_AVATARS_MS = 20_000;

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
    const members = (await loadChatMembers(chat.id)) ?? (await listKnownMembers(chat.id));
    await syncAvatars(ctx.api, members.slice(0, MAX_PREFETCH_AVATARS), PREFETCH_AVATARS_MS).catch((error: unknown) => {
      console.error("Failed to save profile photos:", error);
    });
  }
});
