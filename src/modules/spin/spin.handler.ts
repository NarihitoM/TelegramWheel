import { Composer, GrammyError, InputFile, type Api, type Context, type InlineKeyboard } from "grammy";
import { prisma } from "../../shared/lib/prisma.js";
import { claimWheelCooldown, isGroupChat, listActiveChats, saveChat } from "../chat/chat.service.js";
import { listKnownMembers, rememberMembers, scanChatMembers, syncAdmins, toMember } from "../members/members.service.js";
import { renderResultImage } from "./spin.image.js";
import {
  confirmKeyboard,
  decodeCallback,
  decodePickChat,
  groupCountKeyboard,
  groupSizeKeyboard,
  groupSizeOptions,
  hasCustomGroupSize,
  joinKeyboard,
  maxGroupSize,
  pickChatKeyboard,
  type WheelCallback,
} from "./spin.keyboard.js";
import { escapeHtml, formatResult } from "./spin.message.js";
import { isValidConfig, splitIntoTeams } from "./spin.service.js";
import type { Member } from "./spin.types.js";
import {
  addWheelMember,
  createWheel,
  findWheelAwaitingInput,
  getWheel,
  moveWheel,
  OPEN_STEPS,
  removeWheelMember,
  setWheelMessage,
  type Wheel,
} from "./wheel.service.js";

const PICK_CHAT_LIMIT = 30;
const MAX_LISTED_MEMBERS = 40;
const ENDED_MESSAGE = "This wheel has ended. Send /wheel to start a new one.";

export const spinHandler = new Composer<Context>();

async function editPanel(api: Api, wheel: Wheel, text: string, keyboard?: InlineKeyboard): Promise<void> {
  if (wheel.messageId === null) {
    return;
  }
  try {
    await api.editMessageText(wheel.chatId, wheel.messageId, text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (error) {
    if (!(error instanceof GrammyError)) {
      throw error;
    }
  }
}

function joinText(wheel: Wheel): string {
  const owner = escapeHtml(wheel.ownerName);
  const listed = wheel.members.slice(0, MAX_LISTED_MEMBERS).map((member, index) => `${index + 1}. ${escapeHtml(member.name)}`);
  const hidden = wheel.members.length - listed.length;
  return [
    `<b>Spin Wheel</b> by ${owner}`,
    "Not in the list? Tap Join. Want out? Tap Leave.",
    `${owner} taps Start when everyone is in.`,
    "",
    `<b>Members (${wheel.members.length})</b>`,
    ...(listed.length > 0 ? listed : ["No one yet"]),
    ...(hidden > 0 ? [`+${hidden} more`] : []),
  ].join("\n");
}

async function showJoin(api: Api, wheel: Wheel): Promise<void> {
  await editPanel(api, wheel, joinText(wheel), joinKeyboard(wheel.id));
}

async function showGroupCount(api: Api, wheel: Wheel): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "teamCount", teamCount: null, teamSize: null });
  await editPanel(
    api,
    wheel,
    `${wheel.members.length} members are in. How many groups?`,
    groupCountKeyboard(wheel.id, wheel.members.length),
  );
}

async function showConfirm(api: Api, wheel: Wheel, teamCount: number, teamSize: number): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "confirm", teamCount, teamSize });
  const leftOut = wheel.members.length - teamCount * teamSize;
  await editPanel(
    api,
    wheel,
    `${teamCount} groups x ${teamSize} members from ${wheel.members.length} members` +
      (leftOut > 0 ? `, ${leftOut} left out` : "") +
      ". Spin?",
    confirmKeyboard(wheel.id),
  );
}

async function showGroupSize(api: Api, wheel: Wheel, teamCount: number): Promise<void> {
  const total = wheel.members.length;
  const options = groupSizeOptions(total, teamCount);
  if (options.length === 1 && !hasCustomGroupSize(total, teamCount)) {
    await showConfirm(api, wheel, teamCount, options[0] ?? 1);
    return;
  }

  await moveWheel(wheel.id, OPEN_STEPS, { step: "teamSize", teamCount, teamSize: null });
  await editPanel(api, wheel, `${teamCount} groups. How many members per group?`, groupSizeKeyboard(wheel.id, total, teamCount));
}

async function closeWheel(api: Api, wheel: Wheel, text: string): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "cancelled" });
  await editPanel(api, wheel, text);
}

async function collectMembers(api: Api, chatId: number, owner: Member): Promise<Member[]> {
  let members = await scanChatMembers(chatId);
  if (!members) {
    await syncAdmins(api, chatId);
    members = await listKnownMembers(chatId);
  }
  return members.some((member) => member.id === owner.id) ? members : [owner, ...members];
}

async function openWheel(api: Api, chatId: number, owner: Member): Promise<Wheel | null> {
  const members = await collectMembers(api, chatId, owner);
  const wheel = await createWheel(chatId, owner, members);
  const panel = await api
    .sendMessage(chatId, joinText(wheel), { parse_mode: "HTML", reply_markup: joinKeyboard(wheel.id) })
    .catch(() => null);
  if (!panel) {
    await moveWheel(wheel.id, OPEN_STEPS, { step: "cancelled" });
    return null;
  }
  await setWheelMessage(wheel.id, panel.message_id);
  return { ...wheel, messageId: panel.message_id };
}

async function postResult(ctx: Context, wheel: Wheel): Promise<void> {
  const { teamCount, teamSize } = wheel;
  if (teamCount === null || teamSize === null || !isValidConfig(wheel.members.length, teamCount, teamSize)) {
    await closeWheel(ctx.api, wheel, ENDED_MESSAGE);
    return;
  }
  if (!(await moveWheel(wheel.id, ["confirm"], { step: "done" }))) {
    return;
  }

  const chat = await prisma.chat.findUnique({ where: { id: BigInt(wheel.chatId) }, select: { title: true } });
  const title = chat?.title ?? "";
  const result = splitIntoTeams(wheel.members, teamCount, teamSize);
  await editPanel(ctx.api, wheel, "Spinning...");

  await prisma.spin.create({
    data: {
      chatId: BigInt(wheel.chatId),
      requestedById: BigInt(wheel.ownerId),
      teamCount,
      teamSize,
      teams: result.teams.map((team) => team.map(({ id, name, username }) => ({ id, name, username }))),
      leftovers: result.leftovers.map(({ id, name, username }) => ({ id, name, username })),
    },
  });

  try {
    for (const chunk of formatResult(result, title)) {
      await ctx.api.sendMessage(wheel.chatId, chunk, { parse_mode: "HTML" });
    }
  } catch (error) {
    const reason = error instanceof GrammyError ? error.description : "unknown error";
    await editPanel(ctx.api, wheel, `Couldn't post the result: ${escapeHtml(reason)}`);
    return;
  }

  const image = await renderResultImage(result, title).catch(() => null);
  if (image) {
    await ctx.api
      .sendPhoto(wheel.chatId, new InputFile(image, "wheel.png"), { caption: "Spin Wheel Result" })
      .catch(() => undefined);
  }

  if (wheel.messageId !== null) {
    await ctx.api.deleteMessage(wheel.chatId, wheel.messageId).catch(() => undefined);
  }
}

async function askCustomNumber(ctx: Context, wheel: Wheel, prompt: string): Promise<boolean> {
  const chat = await ctx.api.getChat(wheel.chatId).catch(() => null);
  if (chat?.type === "channel") {
    const sent = await ctx.api.sendMessage(wheel.ownerId, `Send the number here: ${prompt}`).catch(() => null);
    return sent !== null;
  }
  const mention = `<a href="tg://user?id=${wheel.ownerId}">${escapeHtml(wheel.ownerName)}</a>`;
  const sent = await ctx.api
    .sendMessage(wheel.chatId, `${mention}, ${prompt}`, {
      parse_mode: "HTML",
      reply_markup: { force_reply: true, selective: true },
    })
    .catch(() => null);
  return sent !== null;
}

async function startCustomInput(
  ctx: Context,
  wheel: Wheel,
  steps: { from: "teamCount" | "teamSize"; to: "customTeamCount" | "customTeamSize" },
  prompt: string,
): Promise<void> {
  if (!(await moveWheel(wheel.id, [steps.from, steps.to], { step: steps.to }))) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (await askCustomNumber(ctx, wheel, prompt)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await moveWheel(wheel.id, [steps.to], { step: steps.from });
  await ctx.answerCallbackQuery({ text: "Start a private chat with the bot first, then try again.", show_alert: true });
}

async function findSharedChats(api: Api, userId: number): Promise<{ id: number; title: string }[]> {
  const chats = await listActiveChats(PICK_CHAT_LIMIT);
  const checks = await Promise.allSettled(chats.map((chat) => api.getChatMember(chat.id, userId)));
  return chats.filter((_, index) => {
    const check = checks[index];
    return check?.status === "fulfilled" && !["left", "kicked"].includes(check.value.status);
  });
}

spinHandler.command("wheel", async (ctx) => {
  const user = ctx.from;
  if (!user) {
    return;
  }

  if (ctx.chat.type === "private") {
    const chats = await findSharedChats(ctx.api, user.id);
    if (chats.length === 0) {
      await ctx.reply("Couldn't find a group or channel. Please try again.");
      return;
    }
    await ctx.reply("Choose a chat to spin.", { reply_markup: pickChatKeyboard(chats) });
    return;
  }

  if (!isGroupChat(ctx.chat)) {
    return;
  }

  await saveChat(ctx.chat);
  const wait = await claimWheelCooldown(ctx.chat.id);
  if (wait > 0) {
    await ctx.reply(`Wait ${wait}s before spinning again.`);
    return;
  }

  const wheel = await openWheel(ctx.api, ctx.chat.id, toMember(user));
  if (!wheel) {
    await ctx.reply("Couldn't start the wheel. Please try again.");
  }
});

spinHandler.callbackQuery(/^p:/, async (ctx) => {
  const chatId = decodePickChat(ctx.callbackQuery.data);
  const member = chatId === null ? null : await ctx.api.getChatMember(chatId, ctx.from.id).catch(() => null);
  const chat = chatId === null ? null : await ctx.api.getChat(chatId).catch(() => null);
  if (!member || member.status === "left" || member.status === "kicked" || !chat || !isGroupChat(chat)) {
    await ctx.answerCallbackQuery({ text: "Couldn't open that chat. Please try again.", show_alert: true });
    return;
  }

  const wait = await claimWheelCooldown(chat.id);
  if (wait > 0) {
    await ctx.answerCallbackQuery({ text: `Wait ${wait}s before spinning again.`, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  const wheel = await openWheel(ctx.api, chat.id, toMember(ctx.from));
  await ctx.editMessageText(
    wheel
      ? `Wheel started in ${chat.title}. Tap Start there when everyone is in.`
      : `Couldn't post in ${chat.title}. Make sure the bot can post messages there.`,
  );
});

async function handleOwnerAction(ctx: Context, wheel: Wheel, callback: WheelCallback): Promise<void> {
  const { action, value } = callback;
  const total = wheel.members.length;

  switch (action) {
    case "start": {
      if (wheel.step !== "joining") {
        return;
      }
      if (total < 2) {
        await ctx.answerCallbackQuery({ text: "Need at least 2 members to spin.", show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await showGroupCount(ctx.api, wheel);
      return;
    }
    case "tc": {
      await ctx.answerCallbackQuery();
      const countStep = wheel.step === "teamCount" || wheel.step === "customTeamCount";
      if (countStep && value !== undefined && value >= 2 && value <= total) {
        await showGroupSize(ctx.api, wheel, value);
      }
      return;
    }
    case "ts": {
      await ctx.answerCallbackQuery();
      const sizeStep = wheel.step === "teamSize" || wheel.step === "customTeamSize";
      if (sizeStep && value !== undefined && wheel.teamCount !== null && isValidConfig(total, wheel.teamCount, value)) {
        await showConfirm(ctx.api, wheel, wheel.teamCount, value);
      }
      return;
    }
    case "cc": {
      await startCustomInput(
        ctx,
        wheel,
        { from: "teamCount", to: "customTeamCount" },
        `reply with the number of groups (2-${total}).`,
      );
      return;
    }
    case "cs": {
      if (wheel.teamCount === null) {
        await ctx.answerCallbackQuery();
        return;
      }
      await startCustomInput(
        ctx,
        wheel,
        { from: "teamSize", to: "customTeamSize" },
        `reply with the number of members per group (1-${maxGroupSize(total, wheel.teamCount)}).`,
      );
      return;
    }
    case "back": {
      await ctx.answerCallbackQuery();
      const sizeWasAsked = wheel.teamCount !== null && groupSizeOptions(total, wheel.teamCount).length > 1;
      if (wheel.step === "confirm" && sizeWasAsked && wheel.teamCount !== null) {
        await showGroupSize(ctx.api, wheel, wheel.teamCount);
      } else if (wheel.step === "teamCount" || wheel.step === "customTeamCount") {
        await moveWheel(wheel.id, OPEN_STEPS, { step: "joining", teamCount: null, teamSize: null });
        await showJoin(ctx.api, wheel);
      } else {
        await showGroupCount(ctx.api, wheel);
      }
      return;
    }
    case "x": {
      await ctx.answerCallbackQuery();
      await closeWheel(ctx.api, wheel, "Wheel cancelled.");
      return;
    }
    case "go": {
      await ctx.answerCallbackQuery({ text: "Spinning..." });
      if (wheel.step === "confirm") {
        await postResult(ctx, wheel);
      }
      return;
    }
    default:
      await ctx.answerCallbackQuery();
  }
}

function joinReply(action: "j" | "l", changed: boolean): string {
  if (action === "j") {
    return changed ? "You're in!" : "You're already in.";
  }
  return changed ? "You left the wheel." : "You're not in this wheel.";
}

spinHandler.callbackQuery(/^w:/, async (ctx) => {
  const callback = decodeCallback(ctx.callbackQuery.data);
  const wheel = callback ? await getWheel(callback.wheelId) : null;
  const panelId = ctx.callbackQuery.message?.message_id;
  if (!callback || !wheel || !OPEN_STEPS.includes(wheel.step) || wheel.messageId !== panelId) {
    await ctx.answerCallbackQuery({ text: ENDED_MESSAGE, show_alert: true });
    return;
  }

  if (callback.action === "j" || callback.action === "l") {
    if (wheel.step !== "joining") {
      await ctx.answerCallbackQuery({ text: "Joining is closed for this wheel.", show_alert: true });
      return;
    }
    const member = toMember(ctx.from);
    const changed =
      callback.action === "j" ? await addWheelMember(wheel.id, member) : await removeWheelMember(wheel.id, ctx.from.id);
    if (callback.action === "j") {
      await rememberMembers(wheel.chatId, [ctx.from]).catch(() => undefined);
    }
    await ctx.answerCallbackQuery({ text: joinReply(callback.action, changed) });
    if (changed) {
      const updated = await getWheel(wheel.id);
      if (updated) {
        await showJoin(ctx.api, updated);
      }
    }
    return;
  }

  if (ctx.from.id !== wheel.ownerId) {
    await ctx.answerCallbackQuery({ text: `Only ${wheel.ownerName} can do this.`, show_alert: true });
    return;
  }

  await handleOwnerAction(ctx, wheel, callback);
});

spinHandler.on("message:text", async (ctx, next) => {
  const isPrivate = ctx.chat.type === "private";
  const repliesToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
  if (!isPrivate && !repliesToBot) {
    await next();
    return;
  }

  const wheel = await findWheelAwaitingInput(ctx.from.id, isPrivate ? null : ctx.chat.id);
  if (!wheel) {
    await next();
    return;
  }

  const total = wheel.members.length;
  const value = Number(ctx.message.text.trim());

  if (wheel.step === "customTeamCount") {
    if (!Number.isInteger(value) || value < 2 || value > total) {
      await ctx.reply(`Send a number between 2 and ${total}.`, { reply_markup: { force_reply: true, selective: true } });
      return;
    }
    await showGroupSize(ctx.api, wheel, value);
    return;
  }

  const teamCount = wheel.teamCount ?? total;
  if (!isValidConfig(total, teamCount, value)) {
    await ctx.reply(`Send a number between 1 and ${maxGroupSize(total, teamCount)}.`, {
      reply_markup: { force_reply: true, selective: true },
    });
    return;
  }
  await showConfirm(ctx.api, wheel, teamCount, value);
});
