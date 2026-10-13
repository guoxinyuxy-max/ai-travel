import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

/**
 * 云服务客户端 —— 配置来自 cloud-service 激活结果 publicConfig。
 * publishableKey 仅用于标识应用、无权限，可随前端发布；
 * endpoint 为当前应用发布域名，由服务端做 Origin 精确校验。
 */
export const cloud = createWorkBuddyCloud({
  endpoint: 'https://ai-travel-photo.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_kDPkMiyUgaYdwu5VcMkd3g_EP3pRNqjGn5tg7Rh1p4XmhRzMo4iw3S6',
})
