import { EventEmitter } from "events";

export default class Timer extends EventEmitter {
  private initialDuration: number;
  private duration: number;
  private interval: NodeJS.Timeout | null;

  constructor(duration: number) {
    super();
    this.initialDuration = duration;
    this.duration = duration;
    this.interval = null;
  }

  start() {
    if (this.interval) this.stop();

    this.interval = setInterval(() => {
      this.duration -= 1000;

      if (this.duration <= 0) {
        this.duration = 0;
        this.stop();
        this.emit("end");
      }
    }, 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  reset() {
    this.stop();
    this.duration = this.initialDuration;
  }

  getTimeRemaining() {
    return this.duration;
  }
}
