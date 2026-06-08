/**
 * 消息类型常量
 * 用于Chrome扩展中不同组件之间的消息通信
 */

const MESSAGE_TYPES = {
  // 内容提取相关
  EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT',
  
  // 智能标签生成相关
  GENERATE_SMART_TAGS: 'GENERATE_SMART_TAGS'
};

// 如果在浏览器环境中，导出到全局
if (typeof window !== 'undefined') {
  window.MESSAGE_TYPES = MESSAGE_TYPES;
}

// 如果在service worker环境中，导出到全局
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.MESSAGE_TYPES = MESSAGE_TYPES;
}
