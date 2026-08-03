type AutoAdvanceOptions = {
  delayMs: number;
  onAdvance: () => void;
};

export function createRecapAutoAdvanceController({delayMs, onAdvance}: AutoAdvanceOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let enabled = false;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    start({reduceMotion, screenReaderEnabled}: {
      reduceMotion: boolean;
      screenReaderEnabled: boolean;
    }) {
      stop();
      enabled = !reduceMotion && !screenReaderEnabled;
      if (!enabled) return;
      timer = setTimeout(() => {
        timer = null;
        onAdvance();
      }, delayMs);
    },
    onAppStateChange(state: string) {
      if (state !== 'active') stop();
    },
    stop,
  };
}
