// 引入AI API调用工具
importScripts('utils/aiApiClient.js');
// 引入智能标签生成工具
importScripts('utils/smartTagGenerator.js');

// ==================== 书签监听功能 ====================

// 使用 storage 来通知书签变化
async function notifyBookmarkChange(type, data) {
  try {
    const timestamp = Date.now();
    await chrome.storage.local.set({
      bookmarkChange: {
        type: type,
        data: data,
        timestamp: timestamp
      }
    });
  } catch (error) {
    console.error('通知书签变化失败:', error);
  }
}

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log('书签已创建:', bookmark);
  notifyBookmarkChange('BOOKMARK_CREATED', { bookmark: bookmark });
  
  // 保存书签信息并在扩展图标上显示提示
  if (bookmark.url) {
    try {
      // 获取当前活动标签页的信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 存储书签信息供 popup 使用
      await chrome.storage.local.set({
        lastBookmarked: {
          id: id,
          title: bookmark.title,
          url: bookmark.url,
          dateAdded: bookmark.dateAdded,
          tabTitle: tab?.title || bookmark.title,
          tabUrl: tab?.url || bookmark.url,
          hasNewBookmark: true
        }
      });

      // 在扩展图标上显示提示徽章
      chrome.action.setBadgeText({ text: '新' });
      chrome.action.setBadgeBackgroundColor({ color: '#333' });
    } catch (error) {
      console.error('处理收藏事件失败:', error);
    }
  }
});

// 监听书签删除事件
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('书签已删除:', id);
  notifyBookmarkChange('BOOKMARK_REMOVED', { id: id });
});

// 监听书签更改事件
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('书签已更改:', id, changeInfo);
  notifyBookmarkChange('BOOKMARK_CHANGED', { id: id, changeInfo: changeInfo });
});

// 监听书签移动事件
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  console.log('书签已移动:', id, moveInfo);
  notifyBookmarkChange('BOOKMARK_MOVED', { id: id, moveInfo: moveInfo });
});

console.log('书签监听服务已启动');

// ==================== 智能标签生成功能 ====================

// 消息类型常量
const MESSAGE_TYPES = {
  EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT',
  GENERATE_SMART_TAGS: 'GENERATE_SMART_TAGS'
};

//保存书签标签
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    if (tags.length > 0) {
      bookmarkTags[bookmarkId] = tags;
    } else {
      delete bookmarkTags[bookmarkId]; // 如果没有标签，则删除该书签的标签记录
    }
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
    console.log('标签已保存，书签ID:', bookmarkId, '标签:', tags);
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

//保存书签内容概括
async function saveBookmarkSummary(bookmarkId, summary) {
  try {
    const result = await chrome.storage.local.get('bookmarkSummaries');
    const bookmarkSummaries = result.bookmarkSummaries || {};
    if (summary && summary.trim()) {
      bookmarkSummaries[bookmarkId] = summary.trim();
    } else {
      delete bookmarkSummaries[bookmarkId]; // 如果没有概括，则删除该书签的概括记录
    }
    await chrome.storage.local.set({ bookmarkSummaries: bookmarkSummaries });
    console.log('内容概括已保存，书签ID:', bookmarkId);
  } catch (error) {
    console.error('保存内容概括失败:', error);
    throw error;
  }
}

//获取书签内容概括
async function getBookmarkSummary(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkSummaries');
    const bookmarkSummaries = result.bookmarkSummaries || {};
    return bookmarkSummaries[bookmarkId] || '';
  } catch (error) {
    console.error('获取内容概括失败:', error);
    return '';
  }
}

//获取所有现有标签（所有书签的所有标签的去重集合）
async function getAllExistingTags() {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    
    // 收集所有标签
    const allTags = new Set();
    for (const bookmarkId in bookmarkTags) {
      const tags = bookmarkTags[bookmarkId];
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && typeof tag === 'string' && tag.trim()) {
            allTags.add(tag.trim());
          }
        });
      }
    }
    
    const tagsArray = Array.from(allTags).sort();
    console.log('获取所有现有标签，共', tagsArray.length, '个:', tagsArray.slice(0, 20), tagsArray.length > 20 ? '...' : '');
    return tagsArray;
  } catch (error) {
    console.error('获取所有现有标签失败:', error);
    return [];
  }
}

//处理智能标签生成
async function handleSmartTagGeneration(bookmarkId, tabId = null) {
  try {
    // 检查必要的函数是否可用
    if (typeof getActiveApiConfig !== 'function') {
      throw new Error('getActiveApiConfig 函数不可用');
    }
    if (typeof generateSmartTags !== 'function') {
      throw new Error('generateSmartTags 函数不可用');
    }

    // 检查总开关和API配置状态
    const apiConfig = await getActiveApiConfig();
    if (!apiConfig) {
      return {
        success: false,
        error: '未找到启用的API配置，请检查API配置和总开关状态',
        tags: []
      };
    }

    console.log('开始生成智能标签，书签ID:', bookmarkId, '标签页ID:', tabId);

    // 获取标签页信息
    let targetTabId = tabId;
    if (!targetTabId) {
      // 如果没有提供tabId，尝试通过bookmarkId获取URL，然后查找对应的标签页
      try {
        const bookmarks = await chrome.bookmarks.get(bookmarkId);
        if (bookmarks && bookmarks.length > 0) {
          const bookmark = bookmarks[0];
          const url = bookmark.url;
          
          // 查找包含该URL的标签页
          const tabs = await chrome.tabs.query({ url: url });
          if (tabs && tabs.length > 0) {
            targetTabId = tabs[0].id;
          }
        }
      } catch (error) {
        console.warn('无法获取标签页ID:', error);
      }
    }

    // 发送消息到content script提取内容
    let pageContent = null;
    
    if (targetTabId) {
      try {
        // 发送消息到content script
        const response = await chrome.tabs.sendMessage(targetTabId, {
          type: MESSAGE_TYPES.EXTRACT_PAGE_CONTENT
        });

        if (response && response.success && response.data) {
          pageContent = response.data;
          console.log('页面内容提取成功:', {
            title: pageContent.title,
            contentLength: pageContent.content?.length || 0
          });
        } else {
          console.warn('页面内容提取失败:', response?.error || '未知错误');
          // 使用降级方案
          pageContent = response?.data || null;
        }
      } catch (error) {
        console.error('发送消息到content script失败:', error);
        // 如果标签页已关闭或无法访问，使用降级方案
        pageContent = null;
      }
    }

    // 如果无法获取页面内容，使用降级方案
    if (!pageContent) {
      try {
        const bookmarks = await chrome.bookmarks.get(bookmarkId);
        if (bookmarks && bookmarks.length > 0) {
          const bookmark = bookmarks[0];
          // 尝试从URL提取域名信息
          let domain = '';
          try {
            if (bookmark.url) {
              const urlObj = new URL(bookmark.url);
              domain = urlObj.hostname.replace('www.', '');
            }
          } catch (e) {
            // URL解析失败，忽略
          }
          
          pageContent = {
            title: bookmark.title || '',
            description: '',
            keywords: [],
            headings: [],
            content: '',
            url: bookmark.url || '',
            domain: domain,
            fullText: [bookmark.title, domain].filter(Boolean).join(' - ') || bookmark.url || ''
          };
          console.log('使用降级方案，基于书签信息生成标签');
        } else {
          throw new Error('无法找到对应的书签');
        }
      } catch (error) {
        console.error('获取书签信息失败:', error);
        throw new Error('无法获取页面内容或书签信息：' + (error.message || '未知错误'));
      }
    }

    // 获取所有现有标签
    const existingTags = await getAllExistingTags();
    console.log('获取到现有标签', existingTags.length, '个');

    // 调用智能标签生成
    let result;
    try {
      result = await generateSmartTags(bookmarkId, pageContent, existingTags);
    } catch (error) {
      console.error('调用智能标签生成失败:', error);
      
      // 根据错误类型返回更详细的错误信息
      let errorMessage = '生成标签失败：';
      if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage += error.toString() || '未知错误';
      }
      
      return {
        success: false,
        error: errorMessage,
        tags: [],
        summary: ''
      };
    }

    if (!result || !result.tags || result.tags.length === 0) {
      return {
        success: false,
        error: '未能生成标签。可能原因：1) API返回格式不正确；2) 页面内容不足；3) API配置有误',
        tags: [],
        summary: result?.summary || ''
      };
    }

    // 不自动保存标签和概括，由调用者决定是否保存

    return {
      success: true,
      tags: result.tags,
      summary: result.summary || '',
      error: null
    };
  } catch (error) {
    console.error('处理智能标签生成失败:', error);
    return {
      success: false,
      error: error.message || '生成标签时发生未知错误',
      tags: [],
      summary: ''
    };
  }
}
 
//消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理智能标签生成请求
  if (request.type === MESSAGE_TYPES.GENERATE_SMART_TAGS) {
    const { bookmarkId, tabId } = request;
    
    if (!bookmarkId) {
      sendResponse({
        success: false,
        error: '书签ID不能为空',
        tags: []
      });
      return false;
    }

    // 异步处理
    handleSmartTagGeneration(bookmarkId, tabId)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error('处理智能标签生成请求失败:', error);
        sendResponse({
          success: false,
          error: error.message || '未知错误',
          tags: []
        });
      });

    // 返回true表示将异步发送响应
    return true;
  }

  // 其他消息类型不处理
  return false;
});

console.log('智能标签生成服务已启动');
