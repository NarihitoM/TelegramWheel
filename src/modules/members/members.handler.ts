import { Composer, type Context } from "grammy";
import type { Chat, ChatMember, User } from "grammy/types";
import { isGroupChat, saveChat } from "../chat/chat.service.js";
import { syncAvatars } from "./avatar.service.js";
import { clearCachedMembers, forgetMember, rememberMembers, toMember } from "./members.service.js";

const JOIN_AVATARS_MS = 5_000;

type GroupChat = Exclude<Chat, Chat.PrivateChat>;

async function remember(chat: GroupChat, users: User[]): Promise<void> {
  const saved = await rememberMembers(chat.id, users);
  if (!saved) {
    await saveChat(chat);
    await rememberMembers(chat.id, users);
  }
}

function isInside(member: ChatMember): boolean {
  return (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member)
  );
}

export const membersHandler = new Composer<Context>();

membersHandler.on("message", async (ctx, next) => {
  const { chat, message } = ctx;
  if (isGroupChat(chat)) {
    try {
      const users = [...(message.new_chat_members ?? [])];
      if (message.from && !message.sender_chat) {
        users.push(message.from);
      }
      await remember(chat, users);
      if (message.left_chat_member) {
        await forgetMember(chat.id, message.left_chat_member.id);
      }
      const joined = (message.new_chat_members ?? []).filter((user) => !user.is_bot);
      if (message.left_chat_member || joined.length > 0) {
        await clearCachedMembers(chat.id);
      }
      if (joined.length > 0) {
        await syncAvatars(ctx.api, joined.map(toMember), JOIN_AVATARS_MS);
      }
    } catch (error) {
      console.error("Failed to track members:", error);
    }
  }
  await next();
});

membersHandler.on("chat_member", async (ctx) => {
  const { chat, new_chat_member: member } = ctx.chatMember;
  if (!isGroupChat(chat)) {
    return;
  }

  const stillInside = isInside(member);

  if (stillInside) {
    await remember(chat, [member.user]);
  } else {
    await forgetMember(chat.id, member.user.id);
  }
  if (stillInside !== isInside(ctx.chatMember.old_chat_member)) {
    await clearCachedMembers(chat.id);
  }
});
