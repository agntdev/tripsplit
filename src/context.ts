import type { BotContext } from "@agntdev/bot-toolkit";
import type { Participant, Session, Trip } from "./types";

/** Bot context with typed session and optional trip guard fields. */
export type Ctx = BotContext<Session> & {
  trip?: Trip;
  participant?: Participant;
};