declare module "castv2-client" {
  import { EventEmitter } from "node:events";

  type Callback<T = unknown> = (error: Error | null, result?: T) => void;

  export class DefaultMediaReceiver extends EventEmitter {
    load(media: unknown, options: { autoplay?: boolean; currentTime?: number }, callback: Callback): void;
    queueLoad(items: unknown[], options: { repeatMode?: string; currentTime?: number; startIndex?: number }, callback: Callback<CastMediaStatus>): void;
    queueInsert(items: unknown[], options: { currentItemId?: number; currentItemIndex?: number; currentTime?: number; insertBefore?: number }, callback: Callback<CastMediaStatus>): void;
    queueRemove(itemIds: number[], options: { currentItemId?: number; currentTime?: number }, callback: Callback<CastMediaStatus>): void;
    queueReorder(itemIds: number[], options: { currentItemId?: number; currentTime?: number; insertBefore?: number }, callback: Callback<CastMediaStatus>): void;
    queueUpdate(items: unknown[] | null, options: { currentItemId?: number; currentTime?: number; jump?: number; repeatMode?: string }, callback: Callback<CastMediaStatus>): void;
    play(callback: Callback): void;
    pause(callback: Callback): void;
    stop(callback: Callback): void;
    seek(currentTime: number, callback: Callback): void;
    getStatus(callback: Callback<CastMediaStatus>): void;
  }

  export type CastMediaStatus = {
    playerState?: "IDLE" | "PLAYING" | "PAUSED" | "BUFFERING";
    idleReason?: "CANCELLED" | "INTERRUPTED" | "FINISHED" | "ERROR";
    currentTime?: number;
    volume?: { level?: number; muted?: boolean };
    media?: { duration?: number; customData?: { trackId?: string; deliveryMode?: import("../shared/contracts.js").CastDeliveryMode; deliveryBits?: number; deliverySampleRate?: number }; metadata?: Record<string, unknown> };
    currentItemId?: number;
    items?: Array<{ itemId?: number; media?: { contentId?: string; customData?: { trackId?: string; deliveryMode?: import("../shared/contracts.js").CastDeliveryMode; deliveryBits?: number; deliverySampleRate?: number } } }>;
    repeatMode?: "REPEAT_OFF" | "REPEAT_ALL" | "REPEAT_SINGLE" | "REPEAT_ALL_AND_SHUFFLE";
    supportedMediaCommands?: number;
  };

  export class Client extends EventEmitter {
    on(event: "status", listener: (status: { volume?: { level?: number; muted?: boolean } }) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    connect(host: string, callback: () => void): void;
    launch(receiver: typeof DefaultMediaReceiver, callback: Callback<DefaultMediaReceiver>): void;
    stop(receiver: DefaultMediaReceiver, callback: Callback): void;
    setVolume(volume: { level?: number; muted?: boolean }, callback: Callback<{ level?: number; muted?: boolean }>): void;
    getVolume(callback: Callback<{ level?: number; muted?: boolean }>): void;
    close(): void;
  }
}
