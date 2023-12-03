import ReconnectingWebSocket from 'reconnecting-websocket';

import { uuid } from '@opensumi/ide-core-common';
import { IReporterService, REPORT_NAME, UrlProvider } from '@opensumi/ide-core-common';

import { stringify, parse, WSCloseInfo, ConnectionInfo } from '../common/utils';
import { WSChannel, MessageString } from '../common/ws-channel';

// 前台链接管理类
export class WSChannelHandler {
  public connection: WebSocket;
  // 存储WS通道
  private channelMap: Map<number | string, WSChannel> = new Map();
  private channelCloseEventMap: Map<number | string, WSCloseInfo> = new Map();
  private logger = console;
  public clientId: string;
  // 心跳报文计时器
  private heartbeatMessageTimer: NodeJS.Timer | null;

  private reporterService: IReporterService;

  constructor(public wsPath: UrlProvider, logger: any, public protocols?: string[], clientId?: string) {
    this.logger = logger || this.logger;
    this.clientId = clientId || `CLIENT_ID_${uuid()}`;
    // 可以自动重连的WS,protocols指的是WS的子协议
    this.connection = new ReconnectingWebSocket(wsPath, protocols, {}) as WebSocket; // new WebSocket(wsPath, protocols);
  }
  // 为解决建立连接之后，替换成可落盘的 logger
  replaceLogger(logger: any) {
    if (logger) {
      this.logger = logger;
    }
  }
  setReporter(reporterService: IReporterService) {
    this.reporterService = reporterService;
  }

  private clientMessage() {
    const clientMsg: MessageString = stringify({
      kind: 'client',
      clientId: this.clientId,
    });
    this.connection.send(clientMsg);
  }

  private heartbeatMessage() {
    // 如果存在定时器则清除，防止多个计时器同时运行
    if (this.heartbeatMessageTimer) {
      clearTimeout(this.heartbeatMessageTimer);
    }

    // 确保心跳消息每5秒重复发送一次
    this.heartbeatMessageTimer = global.setTimeout(() => {
      const msg = stringify({
        kind: 'heartbeat',
        clientId: this.clientId,
      });
      this.connection.send(msg);
      this.heartbeatMessage();
    }, 5000);
  }

  public async initHandler() {
    this.connection.onmessage = (e) => {
      // 一个心跳周期内如果有收到消息，则不需要再发送心跳
      this.heartbeatMessage();

      const msg = parse(e.data);

      if (msg.id) {
        const channel = this.channelMap.get(msg.id);
        if (channel) {
          if (msg.kind === 'data' && !(channel as any).fireMessage) {
            // 要求前端发送初始化消息，但后端最先发送消息时，前端并未准备好
            this.logger.error('channel not ready!', msg);
          }
          channel.handleMessage(msg);
        } else {
          this.logger.warn(`channel ${msg.id} not found`);
        }
      }
    };
    await new Promise((resolve) => {
      this.connection.addEventListener('open', () => {
        this.clientMessage();
        this.heartbeatMessage();
        resolve(undefined);
        // 重连 channel
        if (this.channelMap.size) {
          this.channelMap.forEach((channel) => {
            channel.onOpen(() => {
              const closeInfo = this.channelCloseEventMap.get(channel.id);
              this.reporterService &&
                this.reporterService.point(REPORT_NAME.CHANNEL_RECONNECT, REPORT_NAME.CHANNEL_RECONNECT, closeInfo);
              this.logger && this.logger.log(`channel reconnect ${this.clientId}:${channel.channelPath}`);
            });
            channel.open(channel.channelPath);

            // 针对前端需要重新设置下后台状态的情况
            if (channel.fireReOpen) {
              channel.fireReOpen();
            }
          });
        }
      });

      this.connection.addEventListener('close', (event) => {
        if (this.channelMap.size) {
          this.channelMap.forEach((channel) => {
            channel.close(event.code, event.reason);
          });
        }
      });
    });
  }

  // 返回一个通过WS连接发送消息的函数，它接受WS连接作为参数，并返回一个可用于发送消息的函数
  private getChannelSend = (connection) => (content: string) => {
    connection.send(content, (err: Error) => {
      if (err) {
        this.logger.warn(err);
      }
    });
  };

  public async openChannel(channelPath: string) {
    const channelSend = this.getChannelSend(this.connection); // 获取一个通道发送函数
    const channelId = `${this.clientId}:${channelPath}`;
    const channel = new WSChannel(channelSend, channelId);
    this.channelMap.set(channel.id, channel);

    // 创建了一个Promise，该Promise在通道打开时解析。
    // 在Promise内部，它为channel的onOpen和onClose事件设置了事件监听器。
    // 当onOpen事件被触发时，Promise被解析。
    // 当onClose事件被触发时，它将一个条目添加到channelCloseEventMap中，使用channelId作为键。
    // 该条目包含了channelPath、事件的code和reason参数，以及从navigator.connection对象获取的connectInfo。
    // 最后，它调用channel对象的open方法，传递channelPath参数。
    await new Promise((resolve) => {
      channel.onOpen(() => {
        resolve(undefined);
      });
      channel.onClose((code: number, reason: string) => {
        this.channelCloseEventMap.set(channelId, {
          channelPath,
          closeEvent: { code, reason },
          connectInfo: (navigator as any).connection as ConnectionInfo,
        });
        this.logger.log('channel close: ', code, reason);
      });
      channel.open(channelPath);
    });

    return channel;
  }

  // 清除心跳报文计时器
  public dispose() {
    if (this.heartbeatMessageTimer) {
      clearTimeout(this.heartbeatMessageTimer);
    }
  }
}
