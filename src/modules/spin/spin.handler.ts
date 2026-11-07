import { Composer, GrammyError, InputFile, type InlineKeyboard } from "grammy";
import { prisma } from "../../shared/lib/prisma.js";
import type { BotContext, WheelSession } from "../../shared/types/context.js";
import { claimWheelCooldown, isGroupChat, listActiveChats, saveChat } from "../chat/chat.service.js";
import { fetchChatMembers, MembersError } from "../members/members.service.js";
import { renderResultImage } from "./spin.image.js";
import {
  confirmKeyboard,
  decodeCallback,
  groupCountKeyboard,
  groupSizeKeyboard,
  groupSizeOptions,
  hasCustomGroupSize,
  maxGroupSize,
  pickChatKeyboard,
  type WheelCallback,
} from "./spin.keyboard.js";
import { escapeHtml, formatResult } from "./spin.message.js";
import { isValidConfig, splitIntoTeams } from "./spin.service.js";

const PICK_CHAT_LIMIT = 30;

export const spinHandler = new Composer<BotContext>();

function isCountStep(step: WheelSession["step"]): boolean {
  return step === "teamCount" || step === "customTeamCount";
}

function isSizeStep(step: WheelSession["step"]): boolean {
  return step === "teamSize" || step === "customTeamSize";
}

function idleSession(): WheelSession {
  return { step: "idle", members: [] };
}

async function editPanel(ctx: BotContext, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const { panelChatId, panelMessageId } = ctx.session;
  if (panelChatId === undefined || panelMessageId === undefined) {
    return;
  }
  try {
    await ctx.api.editMessageText(panelChatId, panelMessageId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (error) {
    if (!(error instanceof GrammyError && error.description.includes("message is not modified"))) {
      throw error;
    }
  }
}

async function closePanel(ctx: BotContext, text: string): Promise<void> {
  await editPanel(ctx, text);
  ctx.session = idleSession();
}

async function showGroupCount(ctx: BotContext, ownerId: number): Promise<void> {
  const total = ctx.session.members.length;
  ctx.session.step = "teamCount";
  ctx.session.teamCount = undefined;
  ctx.session.teamSize = undefined;
  await editPanel(
    ctx,
    `<b>${escapeHtml(ctx.session.targetTitle ?? "")}</b>\nFound ${total} members. How many groups?`,
    groupCountKeyboard(ownerId, total),
  );
}

async function showConfirm(ctx: BotContext, ownerId: number): Promise<void> {
  const { members, teamCount = 0, teamSize = 0 } = ctx.session;
  const leftOut = members.length - teamCount * teamSize;
  ctx.session.step = "confirm";
  await editPanel(
    ctx,
    `${teamCount} groups x ${teamSize} members from ${members.length} members` +
      (leftOut > 0 ? `, ${leftOut} left out` : "") +
      ". Spin?",
    confirmKeyboard(ownerId),
  );
}

async function showGroupSize(ctx: BotContext, ownerId: number): Promise<void> {
  const total = ctx.session.members.length;
  const teamCount = ctx.session.teamCount ?? 2;
  const options = groupSizeOptions(total, teamCount);

  if (options.length === 1 && !hasCustomGroupSize(total, teamCount)) {
    ctx.session.teamSize = options[0];
    await showConfirm(ctx, ownerId);
    return;
  }

  ctx.session.step = "teamSize";
  ctx.session.teamSize = undefined;
  await editPanel(ctx, `${teamCount} groups. How many members per group?`, groupSizeKeyboard(ownerId, total, teamCount));
}

async function startWheel(ctx: BotContext, ownerId: number, chatId: number, chatTitle: string): Promise<void> {
  const wait = await claimWheelCooldown(chatId);
  if (wait > 0) {
    await closePanel(ctx, `Wait ${wait}s before spinning again.`);
    return;
  }

  await editPanel(ctx, "Loading members...");

  try {
    const members = await fetchChatMembers(chatId);
    if (members.length < 2) {
      await closePanel(ctx, "Need at least 2 members to spin.");
      return;
    }
    ctx.session.targetChatId = chatId;
    ctx.session.targetTitle = chatTitle;
    ctx.session.members = members;
    await showGroupCount(ctx, ownerId);
  } catch (error) {
    if (error instanceof MembersError) {
      await closePanel(ctx, error.message);
      return;
    }
    throw error;
  }
}

async function postResult(ctx: BotContext): Promise<void> {
  const { members, teamCount, teamSize, targetChatId, targetTitle = "", panelChatId, panelMessageId } = ctx.session;
  const requester = ctx.from;
  if (teamCount === undefined || teamSize === undefined || targetChatId === undefined || !requester) {
    await closePanel(ctx, "This wheel expired. Send /wheel again.");
    return;
  }

  const result = splitIntoTeams(members, teamCount, teamSize);
  await editPanel(ctx, "Spinning...");

  await prisma.spin.create({
    data: {
      chatId: BigInt(targetChatId),
      requestedById: BigInt(requester.id),
      teamCount,
      teamSize,
      teams: result.teams.map((team) => team.map(({ id, name, username }) => ({ id, name, username }))),
      leftovers: result.leftovers.map(({ id, name, username }) => ({ id, name, username })),
    },
  });

  try {
    for (const chunk of formatResult(result, targetTitle)) {
      await ctx.api.sendMessage(targetChatId, chunk, { parse_mode: "HTML" });
    }
  } catch (error) {
    const reason = error instanceof GrammyError ? error.description : "unknown error";
    await closePanel(ctx, `Couldn't post the result: ${escapeHtml(reason)}`);
    return;
  }

  const image = await renderResultImage(result, targetTitle).catch(() => null);
  if (image) {
    await ctx.api
      .sendPhoto(targetChatId, new InputFile(image, "wheel.png"), { caption: "Spin Wheel Result" })
      .catch(() => undefined);
  }

  if (panelChatId === targetChatId && panelMessageId !== undefined) {
    await ctx.api.deleteMessage(panelChatId, panelMessageId).catch(() => undefined);
    ctx.session = idleSession();
    return;
  }
  await closePanel(ctx, `Result posted to <b>${escapeHtml(targetTitle)}</b>.`);
}

async function findSharedChats(ctx: BotContext, userId: number): Promise<{ id: number; title: string }[]> {
  const chats = await listActiveChats(PICK_CHAT_LIMIT);
  const checks = await Promise.allSettled(chats.map((chat) => ctx.api.getChatMember(chat.id, userId)));
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
    const chats = await findSharedChats(ctx, user.id);
    if (chats.length === 0) {
      await ctx.reply("Couldn't find a group or channel. Please try again.");
      return;
    }
    const panel = await ctx.reply("Which chat should I spin?", { reply_markup: pickChatKeyboard(user.id, chats) });
    ctx.session = {
      ...idleSession(),
      step: "pickChat",
      allowedChatIds: chats.map((chat) => chat.id),
      panelChatId: panel.chat.id,
      panelMessageId: panel.message_id,
    };
    return;
  }

  if (!isGroupChat(ctx.chat)) {
    return;
  }

  await saveChat(ctx.chat);
  const panel = await ctx.reply("Starting the wheel...");
  ctx.session = { ...idleSession(), panelChatId: panel.chat.id, panelMessageId: panel.message_id };
  await startWheel(ctx, user.id, ctx.chat.id, ctx.chat.title);
});

async function handleAction(ctx: BotContext, callback: WheelCallback): Promise<void> {
  const { ownerId, action, value } = callback;
  const { step, members, teamCount } = ctx.session;

  switch (action) {
    case "pk": {
      if (step !== "pickChat" || value === undefined || !ctx.session.allowedChatIds?.includes(value)) {
        return;
      }
      const member = await ctx.api.getChatMember(value, ownerId).catch(() => null);
      if (!member || member.status === "left" || member.status === "kicked") {
        await closePanel(ctx, "You are not a member of that chat.");
        return;
      }
      const chat = await ctx.api.getChat(value).catch(() => null);
      if (!chat || !isGroupChat(chat)) {
        await closePanel(ctx, "Couldn't open that chat. Please try again.");
        return;
      }
      await startWheel(ctx, ownerId, chat.id, chat.title);
      return;
    }
    case "tc": {
      if (!isCountStep(step) || value === undefined || value < 2 || value > members.length) {
        return;
      }
      ctx.session.teamCount = value;
      await showGroupSize(ctx, ownerId);
      return;
    }
    case "ts": {
      if (!isSizeStep(step) || value === undefined || !isValidConfig(members.length, teamCount ?? 0, value)) {
        return;
      }
      ctx.session.teamSize = value;
      await showConfirm(ctx, ownerId);
      return;
    }
    case "cc": {
      if (!isCountStep(step)) {
        return;
      }
      ctx.session.step = "customTeamCount";
      await ctx.reply(`Reply with the number of groups (2-${members.length}).`, {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    case "cs": {
      if (!isSizeStep(step) || teamCount === undefined) {
        return;
      }
      ctx.session.step = "customTeamSize";
      await ctx.reply(`Reply with the number of members per group (1-${maxGroupSize(members.length, teamCount)}).`, {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    case "back": {
      const sizeWasAsked =
        teamCount !== undefined && groupSizeOptions(members.length, teamCount).length > 1;
      if (step === "confirm" && sizeWasAsked) {
        await showGroupSize(ctx, ownerId);
      } else if (step === "confirm" || isSizeStep(step)) {
        await showGroupCount(ctx, ownerId);
      }
      return;
    }
    case "x": {
      await closePanel(ctx, "Wheel cancelled.");
      return;
    }
    case "go": {
      if (step === "confirm") {
        await postResult(ctx);
      }
      return;
    }
  }
}

spinHandler.callbackQuery(/^w:/, async (ctx) => {
  const callback = decodeCallback(ctx.callbackQuery.data);
  if (!callback) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (ctx.from.id !== callback.ownerId) {
    await ctx.answerCallbackQuery({
      text: "This wheel belongs to someone else. Send /wheel to start your own.",
      show_alert: true,
    });
    return;
  }

  if (ctx.session.panelMessageId !== ctx.callbackQuery.message?.message_id) {
    await ctx.answerCallbackQuery({ text: "This wheel expired. Send /wheel again.", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  await handleAction(ctx, callback);
});

spinHandler.on("message:text", async (ctx, next) => {
  const { step, members, teamCount } = ctx.session;
  if (step !== "customTeamCount" && step !== "customTeamSize") {
    await next();
    return;
  }

  const value = Number(ctx.message.text.trim());
  const ownerId = ctx.from.id;

  if (step === "customTeamCount") {
    if (!Number.isInteger(value) || value < 2 || value > members.length) {
      await ctx.reply(`Send a number between 2 and ${members.length}.`, {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    ctx.session.teamCount = value;
    await showGroupSize(ctx, ownerId);
    return;
  }

  const max = maxGroupSize(members.length, teamCount ?? members.length);
  if (!isValidConfig(members.length, teamCount ?? 0, value)) {
    await ctx.reply(`Send a number between 1 and ${max}.`, {
      reply_markup: { force_reply: true, selective: true },
    });
    return;
  }
  ctx.session.teamSize = value;
  await showConfirm(ctx, ownerId);
});
