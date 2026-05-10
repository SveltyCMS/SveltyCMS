/**
 * @file scripts/benchmark-matrix/progress.ts
 * @description Tracks and displays benchmark progress and ETA.
 */

export class ProgressTracker {
  private startTime: number = 0;
  private totalTasks: number = 0;
  private completedTasks: number = 0;

  constructor(totalTasks: number) {
    this.totalTasks = totalTasks;
    this.startTime = Date.now();
  }

  /**
   * Updates the progress and logs it.
   */
  update(completed: number = 1) {
    this.completedTasks += completed;
    this.logProgress();
  }

  /**
   * Logs the current progress percentage and ETA.
   */
  private logProgress() {
    const elapsed = Date.now() - this.startTime;
    const percent = Math.min(100, Math.round((this.completedTasks / this.totalTasks) * 100));

    // Calculate ETA
    let etaStr = "Calculating...";
    if (this.completedTasks > 0) {
      const avgTimePerTask = elapsed / this.completedTasks;
      const remainingTasks = this.totalTasks - this.completedTasks;
      const remainingTime = avgTimePerTask * remainingTasks;
      etaStr = this.formatDuration(remainingTime);
    }

    const barWidth = 20;
    const filledWidth = Math.round((percent / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    console.log(
      `\n\x1b[1m\x1b[38;5;45m📊 Progress: [${progressBar}] ${percent}% | Completed: ${this.completedTasks}/${this.totalTasks} | ETA: ${etaStr}\x1b[0m\n`,
    );
  }

  private formatDuration(ms: number): string {
    if (ms < 0) return "0s";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(" ");
  }
}

// Global instance for simple access
export let progressTracker: ProgressTracker | null = null;

export function initProgressTracker(totalTasks: number) {
  progressTracker = new ProgressTracker(totalTasks);
  return progressTracker;
}
