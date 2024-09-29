import { CommandSender } from '../../../../../src/rpc/rpc-client/command-sender/CommandSender';
import { CommandSenderManager } from '../../../../../src/rpc/rpc-client/command-sender/CommandSenderManager';

describe('CommandSenderManager', () => {
  let commandSenderManager: CommandSenderManager;

  beforeEach(() => {
    commandSenderManager = new CommandSenderManager();
  });

  it('should store command senders', () => {
    const commandSender1 = createCommandSenderMock();
    const commandSender2 = createCommandSenderMock();
    const commandSender3 = createCommandSenderMock();

    commandSenderManager.set('queue-1', commandSender1);

    expect(commandSenderManager.get('queue-1')).toBe(commandSender1);
    expect(commandSenderManager.get('queue-2')).toBeNull();

    commandSenderManager.set('queue-2', commandSender2);

    expect(commandSenderManager.get('queue-1')).toBe(commandSender1);
    expect(commandSenderManager.get('queue-2')).toBe(commandSender2);

    commandSenderManager.set('queue-2', commandSender3); // overwrite

    expect(commandSenderManager.get('queue-1')).toBe(commandSender1);
    expect(commandSenderManager.get('queue-2')).toBe(commandSender3);

    /** no await */ commandSenderManager.disposeAll();

    expect(commandSenderManager.get('queue-1')).toBeNull();
    expect(commandSenderManager.get('queue-2')).toBeNull();
  });

  describe('disposeAll()', () => {
    it('should dispose all command senders', () => {
      const commandSender1 = createCommandSenderMock();
      const commandSender2 = createCommandSenderMock();
      const commandSender3 = createCommandSenderMock();

      commandSenderManager.set('queue-1', commandSender1);
      commandSenderManager.set('queue-2', commandSender2);
      commandSenderManager.set('queue-2', commandSender3); // overwrite

      /** no await */ commandSenderManager.disposeAll();

      expect(commandSender1.dispose).toHaveBeenCalledTimes(1);
      expect(commandSender2.dispose).not.toHaveBeenCalled(); // been overwritten
      expect(commandSender3.dispose).toHaveBeenCalledTimes(1);
    });
  });
});

function createCommandSenderMock() {
  const commandSender = {
    dispose: jest.fn(async () => {}),
  } as unknown as jest.Mocked<CommandSender>;

  return commandSender;
}
