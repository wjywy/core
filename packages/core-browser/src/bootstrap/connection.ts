import { Injector, Provider } from '@opensumi/di';
import { RPCServiceCenter, initRPCService, RPCMessageConnection } from '@opensumi/ide-connection';
import { WSChannelHandler } from '@opensumi/ide-connection/lib/browser';
import { createWebSocketConnection } from '@opensumi/ide-connection/lib/common/message';
import {
  getDebugLogger,
  IReporterService,
  BasicModule,
  BrowserConnectionCloseEvent,
  BrowserConnectionOpenEvent,
  BrowserConnectionErrorEvent,
  IEventBus,
  UrlProvider,
} from '@opensumi/ide-core-common';
import { BackService } from '@opensumi/ide-core-common/lib/module';

import { ClientAppStateService } from '../application';

import { ModuleConstructor } from './app.interface';

const initialLogger = getDebugLogger();

// 这是web服务
// 使用WebSocket创建客户端连接。它使用提供的wsPath URL建立与WebSocket服务器的连接
// modules参数用于依赖注入，允许函数注入任何所需的依赖项。
// 如果连接丢失并发生重新连接，将调用onReconnect回调函数。
// protocols参数允许指定在连接握手期间使用的WebSocket协议。
// clientId参数是客户端的可选标识符。
export async function createClientConnection2(
  injector: Injector, // 注入器对象，用于依赖注入
  modules: ModuleConstructor[], // 模块构造函数的数组
  wsPath: UrlProvider, // WebSocket路径的URL提供者
  onReconnect: () => void, // 当重新连接发生时将调用的回调函数s
  protocols?: string[], // WebSocket协议的数组
  clientId?: string, // 表示客户端ID的字符串
) {
  // 声明了一个常量变量,获取了IReporterService接口的实例
  const reporterService: IReporterService = injector.get(IReporterService);
  const eventBus = injector.get(IEventBus);
  // 客户端应用状态服务
  const stateService = injector.get(ClientAppStateService);

  const wsChannelHandler = new WSChannelHandler(wsPath, initialLogger, protocols, clientId);

  // 为处理程序设置了报告服务
  wsChannelHandler.setReporter(reporterService);
  wsChannelHandler.connection.addEventListener('open', async () => {
    // 等待客户端应用状态达到这个"core_module_initialized"
    await stateService.reachedState('core_module_initialized');
    // fire: 发出一个事件
    eventBus.fire(new BrowserConnectionOpenEvent());
  });

  wsChannelHandler.connection.addEventListener('close', async () => {
    await stateService.reachedState('core_module_initialized');
    eventBus.fire(new BrowserConnectionCloseEvent());
  });

  wsChannelHandler.connection.addEventListener('error', async (e) => {
    await stateService.reachedState('core_module_initialized');
    eventBus.fire(new BrowserConnectionErrorEvent(e));
  });

  // 初始化WS通道处理程序
  await wsChannelHandler.initHandler();

  // 将WS通道处理程序实例添加到注入器作为提供者
  injector.addProviders({
    token: WSChannelHandler,
    useValue: wsChannelHandler,
  });

  // 重连不会执行后面的逻辑
  const channel = await wsChannelHandler.openChannel('RPCService');
  channel.onReOpen(() => onReconnect());

  bindConnectionService(injector, modules, createWebSocketConnection(channel));
}

// 这是electron服务
// RPC：远程过程调用协议，一种通过网络从远程计算机
// 上请求服务，而不需要了解底层网络技术的协议。RPC它假定某些协议的存在，
// 例如TCP/UDP等，为通信程序之间携带信息数据。在OSI网络七层模型中，
// RPC跨越了传输层和应用层，RPC使得开发，
// 包括网络分布式多程序在内的应用程序更加容易
export async function bindConnectionService(
  injector: Injector,
  modules: ModuleConstructor[],
  connection: RPCMessageConnection,
) {
  const clientCenter = new RPCServiceCenter();
  clientCenter.setConnection(connection); // 将connection对象设置为该服务中心的连接

  connection.onClose(() => {
    clientCenter.removeConnection(connection);
  }); // 设置了一个回调函数，用于从服务中心中移除该连接

  const { getRPCService } = initRPCService(clientCenter); // 初始化initRPCService函数，并从中提取了getRPCService函数

  const backServiceArr: BackService[] = [];

  // 存放依赖前端的后端服务，后端服务实例化后再去实例化这些 token
  const dependClientBackServices: BackService[] = [];

  // 遍历modules数组，检查每个模块是否具有backService属性，如果有，就遍历每个backService并
  // 将其添加到backServiceArr数组中
  for (const module of modules) {
    const moduleInstance = injector.get(module) as BasicModule;
    if (moduleInstance.backServices) {
      for (const backService of moduleInstance.backServices) {
        backServiceArr.push(backService);
      }
    }
  }

  for (const backService of backServiceArr) {
    const { servicePath } = backService;
    const rpcService = getRPCService(servicePath);

    const injectService = {
      token: servicePath,
      useValue: rpcService,
    } as Provider;

    injector.addProviders(injectService);
    // 这里不进行初始化，先收集依赖，等所有 servicePath 实例化完后在做实例化，防止循环依赖
    if (backService.clientToken) {
      dependClientBackServices.push(backService);
    }
  }

  for (const backService of dependClientBackServices) {
    const { servicePath } = backService;
    const rpcService = getRPCService(servicePath);
    if (backService.clientToken) {
      // 根据token检索客户端服务，并将其作为参数调用rpcService的onRequestService方法
      const clientService = injector.get(backService.clientToken);
      rpcService.onRequestService(clientService);
    }
  }
}
