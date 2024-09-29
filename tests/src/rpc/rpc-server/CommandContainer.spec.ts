import { CommandContainer } from '../../../../src/rpc/rpc-server/CommandContainer';

describe('CommandContainer', () => {
  let commandContainer: CommandContainer;

  beforeEach(() => {
    commandContainer = new CommandContainer();
  });

  it('should contain the commands', () => {
    const command1 = { fake: 'command1' };
    const command2 = { fake: 'command2' };
    const command3 = { fake: 'command3' };
    const command4 = { fake: 'command4' };

    expect(commandContainer.get('any-id')).toBeUndefined();
    expect(commandContainer.getAll()).toEqual([]);

    commandContainer.set('id-1', command1);
    commandContainer.set('id-2', command2);
    commandContainer.set('id-3', command3);
    commandContainer.set('id-3', command4);

    expect(commandContainer.getAll()).toEqual([command1, command2, command4]);

    commandContainer.delete('id-2');

    expect(commandContainer.get('id-1')).toBe(command1);
    expect(commandContainer.get('id-2')).toBeUndefined();
    expect(commandContainer.get('id-3')).toBe(command4);
    expect(commandContainer.get('id-4')).toBeUndefined();

    expect(commandContainer.getAll()).toEqual([command1, command4]);

    commandContainer.clear();

    expect(commandContainer.get('id-1')).toBeUndefined();
    expect(commandContainer.get('id-3')).toBeUndefined();

    expect(commandContainer.getAll()).toEqual([]);
  });
});
