import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'

declare module '@deepseek-ai/cordis' {
  interface Context {
    conversation: IConversation
    workspaces: IWorkspaces
    webServer: WebServer
  }
}
