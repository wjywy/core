import { Autowired } from '@ali/common-di';
import { MenuContribution, CommandContribution, CommandRegistry, MenuModelRegistry, localize, Domain, CommandService, useNativeContextMenu } from '..';
import { COMMON_MENUS } from './common.menus';
import { FILE_COMMANDS, COMMON_COMMANDS, EDITOR_COMMANDS } from './common.command';

@Domain(MenuContribution, CommandContribution)
export class ClientCommonContribution implements CommandContribution, MenuContribution {

  @Autowired(CommandService)
  protected commandService: CommandService;

  registerCommands(command: CommandRegistry) {
    command.registerCommand(EDITOR_COMMANDS.UNDO);
    command.registerCommand(EDITOR_COMMANDS.REDO);

    command.registerCommand(COMMON_COMMANDS.ABOUT_COMMAND, {
      execute() {
        alert('kaitian');
      },
    });
  }

  registerMenus(menus: MenuModelRegistry): void {
    menus.registerSubmenu(COMMON_MENUS.FILE, localize('mFile'));
    menus.registerSubmenu(COMMON_MENUS.EDIT, localize('mEdit'));
    menus.registerSubmenu(COMMON_MENUS.VIEW, localize('mView'));
    menus.registerSubmenu(COMMON_MENUS.HELP, localize('mHelp'));

    menus.registerMenuAction(COMMON_MENUS.FILE_NEW, {
      commandId: FILE_COMMANDS.NEW_FILE.id,
    });

    menus.registerMenuAction(COMMON_MENUS.FILE_NEW, {
      commandId: FILE_COMMANDS.NEW_FOLDER.id,
    });

    menus.registerMenuAction(COMMON_MENUS.FILE_SAVE, {
      commandId: EDITOR_COMMANDS.SAVE_CURRENT.id,
      label: localize('file.save'),
    });

    if (!useNativeContextMenu()) {
      menus.registerMenuAction(COMMON_MENUS.EDIT_UNDO, {
        commandId: EDITOR_COMMANDS.REDO.id,
      });
      menus.registerMenuAction(COMMON_MENUS.EDIT_UNDO, {
        commandId: EDITOR_COMMANDS.UNDO.id,
      });
    } else {
      menus.registerMenuAction(COMMON_MENUS.EDIT_UNDO, {
        label: localize('editor.undo'),
        nativeRole: 'undo',
        commandId: 'electron.undo',
      });

      menus.registerMenuAction(COMMON_MENUS.EDIT_UNDO, {
        label: localize('editor.redo'),
        nativeRole: 'redo',
        commandId: 'electron.redo',
      });

      menus.registerMenuAction(COMMON_MENUS.EDIT_CLIPBOARD, {
        label: localize('edit.cut'),
        nativeRole: 'cut',
        commandId: 'electron.cut',
      });

      menus.registerMenuAction(COMMON_MENUS.EDIT_CLIPBOARD, {
        label: localize('edit.copy'),
        nativeRole: 'copy',
        commandId: 'electron.copy',
      });

      menus.registerMenuAction(COMMON_MENUS.EDIT_CLIPBOARD, {
        label: localize('edit.paste'),
        nativeRole: 'paste',
        commandId: 'electron.paste',
      });

    }

    menus.registerMenuAction(COMMON_MENUS.HELP, {
      commandId: COMMON_COMMANDS.ABOUT_COMMAND.id,
    });
  }
}
