// Content Script - 基础功能

console.log('Content script loaded - 基础功能已就绪');

/**
 * 消息类型常量
 */
const MESSAGE_TYPES = {
  EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT'
};

/**
 * 处理内容提取请求
 * @returns {Promise<Object>} 清洗后的页面内容
 */
async function handleExtractPageContent() {
  try {
    // 检查必要的函数是否可用
    if (typeof extractPageContent !== 'function') {
      throw new Error('extractPageContent 函数不可用');
    }
    if (typeof cleanContent !== 'function') {
      throw new Error('cleanContent 函数不可用');
    }

    // 提取页面内容
    const pageContent = extractPageContent();
    
    // 清洗内容
    const cleanedContent = cleanContent(pageContent, {
      maxLength: 4000,
      minLength: 100
    });

    console.log('页面内容提取和清洗完成:', {
      title: cleanedContent.title,
      contentLength: cleanedContent.content.length,
      fullTextLength: cleanedContent.fullText.length
    });

    return {
      success: true,
      data: cleanedContent
    };
  } catch (error) {
    console.error('提取页面内容失败:', error);
    
    // 返回降级方案
    return {
      success: false,
      error: error.message,
      data: {
        title: document.title || '',
        description: '',
        keywords: [],
        headings: [],
        content: '',
        url: window.location.href,
        domain: window.location.hostname,
        fullText: document.title || ''
      }
    };
  }
}

/**
 * 消息监听器
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理内容提取请求
  if (request.type === MESSAGE_TYPES.EXTRACT_PAGE_CONTENT) {
    // 异步处理
    handleExtractPageContent()
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error('处理消息失败:', error);
        sendResponse({
          success: false,
          error: error.message,
          data: null
        });
      });
    
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 其他消息类型不处理
  return false;
});
