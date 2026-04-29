declare module 'node-telegram-bot-api' {
  interface TelegramBotOptions {
    polling?: boolean;
    webHook?: boolean;
  }

  export default class TelegramBot {
    constructor(token: string, options?: TelegramBotOptions);
    sendMessage(chatId: number | string, text: string, options?: object): Promise<any>;
    processUpdate(update: object): void;
  }
}
