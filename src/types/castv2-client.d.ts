declare module "castv2-client" {
  import { EventEmitter } from "node:events";

  type Callback<T = unknown> = (error: Error | null, result?: T) => void;

  export class DefaultMediaReceiver extends EventEmitter {
    load(media: unknown, options: { autoplay?: boolean; currentTime?: number }, callback: Callback): void;
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
    media?: { duration?: number };
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
