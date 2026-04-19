import { onBeforeUnmount } from 'vue';

export function useHoldStepper(step: (delta: number) => void) {
  let holdTimeoutId: number | null = null;
  let holdIntervalId: number | null = null;
  let currentDelay = 180;

  function clearTimers() {
    if (holdTimeoutId !== null) {
      window.clearTimeout(holdTimeoutId);
      holdTimeoutId = null;
    }

    if (holdIntervalId !== null) {
      window.clearInterval(holdIntervalId);
      holdIntervalId = null;
    }
  }

  function start(direction: -1 | 1) {
    step(direction);
    clearTimers();
    currentDelay = 180;

    holdTimeoutId = window.setTimeout(() => {
      holdIntervalId = window.setInterval(() => {
        step(direction);
        if (currentDelay > 55 && holdIntervalId !== null) {
          currentDelay = Math.max(55, currentDelay - 25);
          window.clearInterval(holdIntervalId);
          holdIntervalId = window.setInterval(() => {
            step(direction);
          }, currentDelay);
        }
      }, currentDelay);
    }, 260);
  }

  function stop() {
    clearTimers();
  }

  onBeforeUnmount(() => {
    clearTimers();
  });

  return {
    start,
    stop
  };
}
