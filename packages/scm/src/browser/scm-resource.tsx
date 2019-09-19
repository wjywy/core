import * as React from 'react';
import { Autowired, Injectable, Optional } from '@ali/common-di';
import { TreeViewActionTypes, SelectableTreeNode, URI } from '@ali/ide-core-common';
import * as paths from '@ali/ide-core-common/lib/path';
import { IThemeService } from '@ali/ide-theme';
import { LabelService } from '@ali/ide-core-browser/lib/services';
import { splitMenuItems } from '@ali/ide-core-browser/lib/menu/next/menu-util';

import { ISCMResource, ISCMResourceGroup } from '../common';
import { SCMMenus } from './scm-menu';
import { SCMActionBar } from './components/scm-actionbar.view';

interface ISCMResourceTreeNode extends SelectableTreeNode {
  id: string;
  name: string;
  badge: number | string; // changes 数量 | decoration
  selected: boolean;
  style?: React.CSSProperties;
  item: ISCMResourceGroup | ISCMResource;
  // 固定属性
  depth: 0;
  parent: undefined;
}

export class SCMResourceGroupTreeNode implements ISCMResourceTreeNode {
  readonly id: string;
  readonly name: string;
  readonly badge: number;
  readonly item: ISCMResourceGroup;
  readonly resourceGroupState: any;

  private _selected = false;

  readonly actions: any;

  readonly style: React.CSSProperties = { fontWeight: 'bold' };
  readonly depth = 0;
  readonly parent = undefined;

  constructor(
    @Optional() item: ISCMResourceGroup,
    @Optional() private readonly scmMenuService: SCMMenus,
  ) {
    this.id = item.id;
    this.name = item.label;
    this.badge = item.elements.length;
    this.item = item;
    this.resourceGroupState = item.toJSON();
    this.selected = false;
    this.actions = this.getActions();
  }

  get selected() {
    return this._selected;
  }

  set selected(value: boolean) {
    this._selected = value;
  }

  getActions() {
    const menus = this.scmMenuService.getResourceGroupMenu(this.item);
    const menuNodes = menus.getMenuNodes();
    const [inlineActions] = splitMenuItems(menuNodes, 'inline');
    return inlineActions.map((action) => {
      return {
        icon: action.icon,
        command: action.id,
        location: TreeViewActionTypes.TreeNode_Right,
        paramKey: 'resourceGroupState',
      };
    });
  }
}

@Injectable()
export class SCMResourceTreeNode implements ISCMResourceTreeNode {
  @Autowired(IThemeService)
  private readonly themeService: IThemeService;

  @Autowired(LabelService)
  private readonly labelService: LabelService;

  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly item: ISCMResource;
  readonly resourceState: any;
  readonly tooltip: string;

  readonly badgeStyle: React.CSSProperties | undefined;
  readonly icon: string;

  readonly depth = 0;
  readonly parent = undefined;

  readonly actions: any;

  private _selected = false;

  constructor(
    @Optional() item: ISCMResource,
    @Optional() private readonly scmMenuService: SCMMenus,
  ) {
    this.id = item.resourceGroup.id + item.sourceUri;
    this.name = paths.basename(item.sourceUri.toString());
    this.badge = item.decorations.letter || '';
    this.tooltip = item.decorations.tooltip || '';
    this.item = item;
    this.resourceState = item.toJSON();

    this.badgeStyle = this.getBadgeStyle();
    this.icon = this.labelService.getIcon(URI.from(this.item.sourceUri));
    this.actions = this.getActions();
  }

  getBadgeStyle(): React.CSSProperties | undefined {
    const { color: kolor } = this.item.decorations;
    const color = kolor && this.themeService.getColor({ id: kolor });
    return color ? { color } : undefined;
  }

  get selected() {
    return this._selected;
  }

  set selected(value: boolean) {
    this._selected = value;
  }

  getActions() {
    return [{
      location: TreeViewActionTypes.TreeNode_Right,
      component: <SCMActionBar context={this.item} menuService={this.scmMenuService} resourceGroup={this.item.resourceGroup} />,
    }];
  }
}
