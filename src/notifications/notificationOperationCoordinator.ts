export type NotificationOperationIdentity = {
  generation: number;
  operation: number;
};

export function createNotificationOperationCoordinator(
  isGenerationAllowed: (generation: number) => boolean,
) {
  let mounted = false;
  let sequence = 0;

  return {
    setup() {
      mounted = true;
    },
    cleanup() {
      mounted = false;
      sequence += 1;
    },
    start(generation: number): NotificationOperationIdentity {
      sequence += 1;
      return {generation, operation: sequence};
    },
    isCurrent(identity: NotificationOperationIdentity) {
      return mounted && sequence === identity.operation &&
        isGenerationAllowed(identity.generation);
    },
    createInspectPressHandler(inspect: () => Promise<void>) {
      return () => { void inspect(); };
    },
  };
}
