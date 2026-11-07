import { Api, errors } from "telegram";
import { withUserbot } from "../../shared/lib/userbot.js";
import type { Member } from "../spin/spin.types.js";

const DIALOG_LIMIT = 500;
const PARTICIPANT_LIMIT = 10000;

export class MembersError extends Error {}

const RPC_MESSAGES: Record<string, string> = {
  CHAT_ADMIN_REQUIRED: "The helper account must be an admin of this chat to read its members.",
  CHANNEL_PRIVATE: "The helper account can't access this chat. Add it to the chat first.",
};

function toMember(user: Api.User): Member {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user.id.toString(),
    name: name || user.username || `User ${user.id.toString()}`,
    username: user.username ?? undefined,
  };
}

export async function fetchChatMembers(chatId: number): Promise<Member[]> {
  try {
    return await withUserbot(async (client) => {
      const dialogs = await client.getDialogs({ limit: DIALOG_LIMIT });
      const dialog = dialogs.find((item) => item.id?.toString() === String(chatId));
      if (!dialog?.entity) {
        throw new MembersError("The helper account is not in this chat. Add it to the chat first.");
      }

      const me = await client.getMe();
      const participants = await client.getParticipants(dialog.entity, { limit: PARTICIPANT_LIMIT });

      return participants
        .filter((user) => !user.bot && !user.deleted && !user.id.equals(me.id))
        .map(toMember);
    });
  } catch (error) {
    if (error instanceof MembersError) {
      throw error;
    }
    if (error instanceof errors.RPCError) {
      throw new MembersError(RPC_MESSAGES[error.errorMessage] ?? `Telegram error: ${error.errorMessage}`);
    }
    throw error;
  }
}
