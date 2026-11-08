import { Composer, GrammyError, InputFile, InputMediaBuilder, type Api, type Context, type InlineKeyboard } from "grammy";
import type { User } from "grammy/types";
import { prisma } from "../../shared/lib/prisma.js";
import { claimWheelCooldown, isGroupChat, listActiveChannels, saveChat } from "../chat/chat.service.js";
import { listKnownMembers, loadChatMembers, rememberMembers, syncAdmins, toMember } from "../members/members.service.js";
import { COIN_ANIMATION_MS, sendCoinSticker, showLoading, type AnimationName } from "./spin.animation.js";
import { getStoredAvatars, syncChatAvatars, syncMissingAvatars, type AvatarMap } from "../members/avatar.service.js";
import { renderResultImages, renderWinnersImage } from "./spin.image.js";
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
  maxWinners,
  MODE_ACTIONS,
  modeKeyboard,
  pickChatKeyboard,
  winnerCountKeyboard,
  type WheelCallback,
} from "./spin.keyboard.js";
import {
  describeSplit,
  escapeHtml,
  formatResult,
  formatSummary,
  formatWinners,
  formatWinnersSummary,
  MAX_TEXT_MESSAGES,
  plural,
  toPlainText,
} from "./spin.message.js";
import { flipCoin, isValidConfig, pickWinners, splitIntoTeams } from "./spin.service.js";
import type { Member } from "./spin.types.js";
import {
  addWheelMember,
  createWheel,
  findOpenWheel,
  findWheelAwaitingInput,
  getWheel,
  moveWheel,
  OPEN_STEPS,
  removeWheelMember,
  setWheelMessage,
  type Wheel,
  type WheelMode,
  type WheelStep,
} from "./wheel.service.js";

const PICK_CHAT_LIMIT = 30;
const MAX_CHANNEL_CANDIDATES = 100;
const ADMIN_CHECK_BATCH = 10;
const MAX_LISTED_MEMBERS = 40;
const EXIT_IDLE_MS = 60_000;
const ALBUM_SIZE = 10;
const DICE_EMOJI = "\u{1F3B2}";
const CELEBRATION_EMOJI = "\u{1F389}";
const DICE_ANIMATION_MS = 4_000;
const MIN_LOADING_MS = 2_000;
const CHAT_ACTION_INTERVAL_MS = 4_000;

type ChatAction = "typing" | "upload_photo";
const MAX_AVATARS = 200;
const PREFETCH_AVATARS_MS = 15_000;
const RESULT_AVATARS_MS = 5_000;
const ENDED_MESSAGE = "This wheel has ended. Send /wheel to start a new one.";
const MENU_TEXT = [
  "<b>Spin Wheel</b>",
  "Choose what to do:",
  "",
  "<b>Split into groups</b> - split members into random groups",
  "<b>Pick a winner</b> - pick random members",
  "<b>Coin flip</b> - heads or tails",
  "<b>Dice</b> - roll a dice",
].join("\n");

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
  const title = wheel.mode === "winner" ? "Pick a Winner" : "Spin Wheel";
  return [
    `<b>${title}</b> by ${owner}`,
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

function splitSummary(wheel: Wheel, teamCount: number, teamSize: number): string {
  const total = wheel.members.length;
  return `${describeSplit(teamCount, teamSize, total)}.\n${total} members in total.`;
}

async function showConfirm(api: Api, wheel: Wheel, teamCount: number, teamSize: number): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "confirm", teamCount, teamSize });
  await editPanel(
    api,
    wheel,
    `${splitSummary(wheel, teamCount, teamSize)}\n\nDo you want to start spinning?`,
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

async function showWinnerCount(api: Api, wheel: Wheel): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "winnerCount", teamCount: null, teamSize: null });
  await editPanel(
    api,
    wheel,
    `${wheel.members.length} members are in. How many winners?`,
    winnerCountKeyboard(wheel.id, wheel.members.length),
  );
}

async function closeWheel(api: Api, wheel: Wheel, text: string): Promise<void> {
  await moveWheel(wheel.id, OPEN_STEPS, { step: "cancelled" });
  await editPanel(api, wheel, text);
}

async function collectMembers(api: Api, chatId: number, owner: Member): Promise<Member[]> {
  let members = await loadChatMembers(chatId);
  if (!members) {
    await syncAdmins(api, chatId);
    members = await listKnownMembers(chatId);
  }
  return members.some((member) => member.id === owner.id) ? members : [owner, ...members];
}

async function openMenu(api: Api, chatId: number, owner: Member): Promise<boolean> {
  const menu = await createWheel(chatId, owner, [], { step: "mode" });
  const sent = await api
    .sendMessage(chatId, MENU_TEXT, { parse_mode: "HTML", reply_markup: modeKeyboard(menu.id) })
    .catch(() => null);
  if (!sent) {
    await moveWheel(menu.id, ["mode"], { step: "cancelled" });
    return false;
  }
  await setWheelMessage(menu.id, sent.message_id);
  return true;
}

async function deletePanel(api: Api, wheel: Wheel): Promise<void> {
  if (wheel.messageId !== null) {
    await api.deleteMessage(wheel.chatId, wheel.messageId).catch(() => undefined);
  }
}

interface Loading {
  panelHidden: boolean;
  stop: () => Promise<void>;
}

function keepTyping(api: Api, chatId: number, action: ChatAction = "typing"): () => void {
  const send = () => {
    api.sendChatAction(chatId, action).catch(() => undefined);
  };
  send();
  const timer = setInterval(send, CHAT_ACTION_INTERVAL_MS);
  return () => clearInterval(timer);
}

async function whileTyping<T>(api: Api, chatId: number, task: () => Promise<T>, action?: ChatAction): Promise<T> {
  const stopTyping = keepTyping(api, chatId, action);
  try {
    return await task();
  } finally {
    stopTyping();
  }
}

async function startLoading(api: Api, wheel: Wheel, name: AnimationName, status: string): Promise<Loading> {
  const stopTyping = keepTyping(api, wheel.chatId);
  const stop = await showLoading(api, wheel.chatId, name);
  if (stop) {
    await deletePanel(api, wheel);
    return {
      panelHidden: true,
      stop: async () => {
        stopTyping();
        await stop();
      },
    };
  }
  await editPanel(api, wheel, status);
  return { panelHidden: false, stop: async () => stopTyping() };
}

async function openWheel(api: Api, menu: Wheel, owner: Member, mode: WheelMode): Promise<void> {
  const { chatId, messageId } = menu;
  if (messageId === null) {
    return;
  }
  const loading = await startLoading(api, menu, "loading", `${MENU_TEXT}\n\n<b>Fetching members list...</b>`);

  try {
    const members = await collectMembers(api, chatId, owner);
    const created = await createWheel(chatId, owner, members, { mode });
    await loading.stop();
    if (loading.panelHidden) {
      const panel = await api.sendMessage(chatId, joinText(created), {
        parse_mode: "HTML",
        reply_markup: joinKeyboard(created.id),
      });
      await setWheelMessage(created.id, panel.message_id);
    } else {
      await setWheelMessage(created.id, messageId);
      await showJoin(api, { ...created, messageId });
    }
  } catch (error) {
    await loading.stop();
    await deletePanel(api, menu);
    await api.sendMessage(chatId, "Couldn't fetch the members list. Please try again.").catch(() => undefined);
    throw error;
  }

  await syncChatAvatars(chatId, PREFETCH_AVATARS_MS).catch((error: unknown) => {
    console.error("Failed to save profile photos:", error);
  });
}

async function avatarsFor(api: Api, members: Member[]): Promise<AvatarMap> {
  const shown = members.slice(0, MAX_AVATARS);
  await syncMissingAvatars(api, shown, RESULT_AVATARS_MS).catch(() => undefined);
  return getStoredAvatars(shown).catch(() => new Map());
}

async function postFailure(api: Api, wheel: Wheel, error: unknown): Promise<void> {
  const reason = error instanceof GrammyError ? error.description : "unknown error";
  await deletePanel(api, wheel);
  await api
    .sendMessage(wheel.chatId, `Couldn't post the result: ${escapeHtml(reason)}`, { parse_mode: "HTML" })
    .catch(() => undefined);
}

async function postText(
  api: Api,
  chatId: number,
  chunks: string[],
  summary: string,
  caption: string,
): Promise<void> {
  if (chunks.length <= MAX_TEXT_MESSAGES) {
    for (const chunk of chunks) {
      await api.sendMessage(chatId, chunk, { parse_mode: "HTML" });
    }
    return;
  }

  await api.sendMessage(chatId, summary, { parse_mode: "HTML" });
  await api.sendDocument(chatId, new InputFile(Buffer.from(toPlainText(chunks), "utf8"), "spin-wheel-result.txt"), {
    caption: `${caption} - full list`,
  });
}

async function chatTitle(chatId: number): Promise<string> {
  const chat = await prisma.chat.findUnique({ where: { id: BigInt(chatId) }, select: { title: true } });
  return chat?.title ?? "";
}

async function postWinners(api: Api, wheel: Wheel, count: number): Promise<void> {
  const from: WheelStep[] = ["winnerCount", "customWinnerCount"];
  if (count < 1 || count > maxWinners(wheel.members.length) || !(await moveWheel(wheel.id, from, { step: "done" }))) {
    return;
  }

  const total = wheel.members.length;
  const loading = await startLoading(
    api,
    wheel,
    "wheel",
    `${plural(count, "winner")} from ${plural(total, "member")}.\n\n<b>Picking...</b>`,
  );
  const title = await chatTitle(wheel.chatId);
  const winners = pickWinners(wheel.members, count);

  await prisma.spin.create({
    data: {
      chatId: BigInt(wheel.chatId),
      requestedById: BigInt(wheel.ownerId),
      teamCount: 1,
      teamSize: count,
      teams: [winners.map(({ id, name, username }) => ({ id, name, username }))],
      leftovers: [],
    },
  });

  const [picture] = await Promise.all([
    avatarsFor(api, winners)
      .then((avatars) => renderWinnersImage(winners, title, total, avatars))
      .catch((error: unknown) => {
        console.error("Failed to render winners image:", error);
        return null;
      }),
    delay(MIN_LOADING_MS),
  ]);
  await loading.stop();
  await deletePanel(api, wheel);

  try {
    await postText(
      api,
      wheel.chatId,
      formatWinners(winners, title, total),
      formatWinnersSummary(winners, title, total),
      count === 1 ? "Winner" : "Winners",
    );
  } catch (error) {
    await postFailure(api, wheel, error);
    return;
  }

  if (picture) {
    const caption = count === 1 ? "Winner" : "Winners";
    await whileTyping(
      api,
      wheel.chatId,
      () => api.sendPhoto(wheel.chatId, new InputFile(picture, "winners.png"), { caption }),
      "upload_photo",
    ).catch((error: unknown) => console.error("Failed to send winners image:", error));
  }
  await api.sendMessage(wheel.chatId, CELEBRATION_EMOJI).catch(() => undefined);
}

async function postResultImages(api: Api, chatId: number, images: Buffer[]): Promise<void> {
  const [first] = images;
  if (!first) {
    return;
  }
  if (images.length === 1) {
    await api.sendPhoto(chatId, new InputFile(first, "wheel.png"), { caption: "Spin Wheel Result" });
    return;
  }

  for (const [albumIndex, album] of chunkItems(images, ALBUM_SIZE).entries()) {
    await api.sendMediaGroup(
      chatId,
      album.map((image, index) =>
        InputMediaBuilder.photo(new InputFile(image, `wheel-${albumIndex * ALBUM_SIZE + index + 1}.png`), {
          caption: albumIndex === 0 && index === 0 ? "Spin Wheel Result" : undefined,
        }),
      ),
    );
  }
}

function chunkItems<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
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

  const loading = await startLoading(
    ctx.api,
    wheel,
    "wheel",
    `${splitSummary(wheel, teamCount, teamSize)}\n\n<b>Spinning...</b>`,
  );
  const title = await chatTitle(wheel.chatId);
  const result = splitIntoTeams(wheel.members, teamCount, teamSize);

  await prisma.spin.create({
    data: {
      chatId: BigInt(wheel.chatId),
      requestedById: BigInt(wheel.ownerId),
      teamCount,
      teamSize,
      teams: result.teams.map((team) => team.map(({ id, name, username }) => ({ id, name, username }))),
      leftovers: [],
    },
  });

  const [images] = await Promise.all([
    avatarsFor(ctx.api, result.teams.flat())
      .then((avatars) => renderResultImages(result, title, avatars))
      .catch((error: unknown) => {
        console.error("Failed to render result images:", error);
        return [];
      }),
    delay(MIN_LOADING_MS),
  ]);
  await loading.stop();
  await deletePanel(ctx.api, wheel);

  try {
    await postText(
      ctx.api,
      wheel.chatId,
      formatResult(result, title, teamCount, teamSize),
      formatSummary(result, title, teamCount, teamSize),
      "Spin Wheel Result",
    );
  } catch (error) {
    await postFailure(ctx.api, wheel, error);
    return;
  }

  await whileTyping(ctx.api, wheel.chatId, () => postResultImages(ctx.api, wheel.chatId, images), "upload_photo").catch(
    (error: unknown) => {
      console.error("Failed to send result images:", error);
    },
  );
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
  steps: { from: WheelStep; to: WheelStep },
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

async function findAdminChannels(api: Api, userId: number): Promise<{ id: number; title: string }[]> {
  const channels = await listActiveChannels(MAX_CHANNEL_CANDIDATES);
  const found: { id: number; title: string }[] = [];
  for (let start = 0; start < channels.length && found.length < PICK_CHAT_LIMIT; start += ADMIN_CHECK_BATCH) {
    const batch = channels.slice(start, start + ADMIN_CHECK_BATCH);
    const checks = await Promise.all(batch.map((channel) => isChatAdmin(api, channel.id, userId)));
    found.push(...batch.filter((_, index) => checks[index]));
  }
  return found.slice(0, PICK_CHAT_LIMIT);
}

async function checkOpenWheel(api: Api, chatId: number, userId: number): Promise<string | null> {
  const open = await findOpenWheel(chatId);
  if (!open) {
    return null;
  }
  if (open.ownerId === userId) {
    await closeWheel(api, open, "Wheel closed. A new one was started.");
    return null;
  }
  return `${open.ownerName}'s wheel is still open. Tap Exit on it first, then send /wheel again.`;
}

async function isChatAdmin(api: Api, chatId: number, userId: number): Promise<boolean> {
  const member = await api.getChatMember(chatId, userId).catch(() => null);
  return member?.status === "creator" || member?.status === "administrator";
}

async function exitWheel(ctx: Context & { from: User }, wheel: Wheel): Promise<void> {
  const idle = Date.now() - wheel.updatedAt.getTime() >= EXIT_IDLE_MS;
  const allowed = ctx.from.id === wheel.ownerId || idle || (await isChatAdmin(ctx.api, wheel.chatId, ctx.from.id));
  if (!allowed) {
    await ctx.answerCallbackQuery({
      text: `Only ${wheel.ownerName} or an admin can exit now. Anyone can exit after 1 minute of no activity.`,
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const closer = toMember(ctx.from).name;
  await closeWheel(ctx.api, wheel, `Wheel closed by ${escapeHtml(closer)}. Send /wheel to start a new one.`);
}

spinHandler.command("wheel", async (ctx) => {
  const user = ctx.from;
  if (!user) {
    return;
  }

  if (ctx.chat.type === "private") {
    const channels = await findAdminChannels(ctx.api, user.id);
    if (channels.length === 0) {
      await ctx.reply(
        "No channels found where you are an admin. For groups, send /wheel inside the group instead.",
      );
      return;
    }
    await ctx.reply("Choose a channel to spin.", { reply_markup: pickChatKeyboard(channels) });
    return;
  }

  if (!isGroupChat(ctx.chat)) {
    return;
  }

  await saveChat(ctx.chat);
  const blocked = await checkOpenWheel(ctx.api, ctx.chat.id, user.id);
  if (blocked) {
    await ctx.reply(blocked);
    return;
  }

  const wait = await claimWheelCooldown(ctx.chat.id);
  if (wait > 0) {
    await ctx.reply(`Wait ${wait}s before spinning again.`);
    return;
  }

  if (!(await openMenu(ctx.api, ctx.chat.id, toMember(user)))) {
    await ctx.reply("Couldn't start the wheel. Please try again.");
  }
});

spinHandler.callbackQuery(/^p:/, async (ctx) => {
  const chatId = decodePickChat(ctx.callbackQuery.data);
  const isAdmin = chatId !== null && (await isChatAdmin(ctx.api, chatId, ctx.from.id));
  const chat = isAdmin && chatId !== null ? await ctx.api.getChat(chatId).catch(() => null) : null;
  if (!chat || chat.type !== "channel") {
    await ctx.answerCallbackQuery({ text: "Only channel admins can start a wheel here.", show_alert: true });
    return;
  }

  const blocked = await checkOpenWheel(ctx.api, chat.id, ctx.from.id);
  if (blocked) {
    await ctx.answerCallbackQuery({ text: blocked, show_alert: true });
    return;
  }

  const wait = await claimWheelCooldown(chat.id);
  if (wait > 0) {
    await ctx.answerCallbackQuery({ text: `Wait ${wait}s before spinning again.`, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  const opened = await openMenu(ctx.api, chat.id, toMember(ctx.from));
  await ctx.editMessageText(
    opened
      ? `Wheel menu posted in ${chat.title}. Choose what to do there.`
      : `Couldn't post in ${chat.title}. Make sure the bot can post messages there.`,
  );
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animateCoin(api: Api, wheel: Wheel, name: string): Promise<void> {
  const title = `<b>Coin flip</b> by ${name}`;
  const side = flipCoin();
  const flipping = await sendCoinSticker(api, wheel.chatId, side, true).catch((error: unknown) => {
    console.error("Failed to send coin sticker:", error);
    return null;
  });
  if (!flipping) {
    await editPanel(api, wheel, `${title}\nResult: <b>${side}</b>`);
    return;
  }
  await deletePanel(api, wheel);

  await whileTyping(api, wheel.chatId, () => delay(COIN_ANIMATION_MS));
  const landed = await sendCoinSticker(api, wheel.chatId, side, false).catch(() => null);
  if (landed) {
    await api.deleteMessage(wheel.chatId, flipping.message_id).catch(() => undefined);
  }
  await api
    .sendMessage(wheel.chatId, `${name} flipped <b>${side}</b>.`, {
      parse_mode: "HTML",
      reply_parameters: { message_id: (landed ?? flipping).message_id, allow_sending_without_reply: true },
    })
    .catch(() => undefined);
}

async function rollDice(api: Api, wheel: Wheel, name: string): Promise<void> {
  const dice = await api.sendDice(wheel.chatId, DICE_EMOJI).catch(() => null);
  if (!dice) {
    await editPanel(api, wheel, "Couldn't roll the dice. Please try again.");
    return;
  }
  await deletePanel(api, wheel);
  await whileTyping(api, wheel.chatId, () => delay(DICE_ANIMATION_MS));
  await api
    .sendMessage(wheel.chatId, `${name} rolled a <b>${dice.dice.value}</b>.`, {
      parse_mode: "HTML",
      reply_parameters: { message_id: dice.message_id, allow_sending_without_reply: true },
    })
    .catch(() => undefined);
}

async function handleModeAction(ctx: Context & { from: User }, wheel: Wheel, callback: WheelCallback): Promise<void> {
  if (wheel.messageId === null || !(await moveWheel(wheel.id, ["mode"], { step: "done" }))) {
    await ctx.answerCallbackQuery({ text: ENDED_MESSAGE, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  const player = toMember(ctx.from);
  const name = escapeHtml(player.name);

  switch (callback.action) {
    case "coin": {
      await animateCoin(ctx.api, wheel, name);
      return;
    }
    case "dice": {
      await rollDice(ctx.api, wheel, name);
      return;
    }
    default: {
      await openWheel(ctx.api, wheel, player, callback.action === "win" ? "winner" : "split");
    }
  }
}

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
      if (wheel.mode === "winner") {
        await showWinnerCount(ctx.api, wheel);
      } else {
        await showGroupCount(ctx.api, wheel);
      }
      return;
    }
    case "wc": {
      await ctx.answerCallbackQuery();
      if (value !== undefined && (wheel.step === "winnerCount" || wheel.step === "customWinnerCount")) {
        await postWinners(ctx.api, wheel, value);
      }
      return;
    }
    case "cw": {
      await startCustomInput(
        ctx,
        wheel,
        { from: "winnerCount", to: "customWinnerCount" },
        `reply with the number of winners (1-${maxWinners(total)}).`,
      );
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
      if (wheel.step === "joining") {
        return;
      }
      const sizeWasAsked = wheel.teamCount !== null && groupSizeOptions(total, wheel.teamCount).length > 1;
      const backToJoin =
        wheel.mode === "winner" || wheel.step === "teamCount" || wheel.step === "customTeamCount";
      if (wheel.step === "confirm" && sizeWasAsked && wheel.teamCount !== null) {
        await showGroupSize(ctx.api, wheel, wheel.teamCount);
      } else if (backToJoin) {
        await moveWheel(wheel.id, OPEN_STEPS, { step: "joining", teamCount: null, teamSize: null });
        await showJoin(ctx.api, wheel);
      } else {
        await showGroupCount(ctx.api, wheel);
      }
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

  if (wheel.step === "mode" && callback.action !== "x") {
    if (MODE_ACTIONS.includes(callback.action)) {
      await handleModeAction(ctx, wheel, callback);
    } else {
      await ctx.answerCallbackQuery();
    }
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

  if (callback.action === "x") {
    await exitWheel(ctx, wheel);
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

  if (wheel.step === "customWinnerCount") {
    if (!Number.isInteger(value) || value < 1 || value > maxWinners(total)) {
      await ctx.reply(`Send a number between 1 and ${maxWinners(total)}.`, {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    await postWinners(ctx.api, wheel, value);
    return;
  }

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
