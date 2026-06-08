// 加载并显示收藏的书签信息
async function loadBookmarkInfo() {
  const bookmarkContent = document.getElementById('bookmarkContent');
  
  try {
    // 从 storage 获取最后收藏的书签信息
    const result = await chrome.storage.local.get('lastBookmarked');
    const bookmark = result.lastBookmarked;

    // 清除徽章提示
    chrome.action.setBadgeText({ text: '' });

    if (!bookmark) {
      bookmarkContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">暂无收藏信息</div>
        </div>
      `;
      return;
    }

    // 如果有新的收藏，标记为已查看
    if (bookmark.hasNewBookmark) {
      bookmark.hasNewBookmark = false;
      await chrome.storage.local.set({ lastBookmarked: bookmark });
    }

    // 提取域名
    let domain = '';
    try {
      const urlObj = new URL(bookmark.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = bookmark.url;
    }

    // 格式化日期
    const date = new Date(bookmark.dateAdded || Date.now());
    const dateStr = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 获取当前标签
    const currentTags = await getBookmarkTags(bookmark.id);
    const tagsHtml = currentTags.length > 0 
      ? `<div class="bookmark-tags">
          ${currentTags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
         </div>`
      : '';

    bookmarkContent.innerHTML = `
      <div class="bookmark-title">${escapeHtml(bookmark.title || '无标题')}</div>
      <div class="bookmark-url-container">
        <div class="bookmark-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(domain)}</div>
        <button class="copy-url-btn" id="copyUrlBtn" title="复制网址">📋</button>
      </div>
      
      <div class="bookmark-tags-section">
        <div class="bookmark-tags-label">标签：</div>
        ${tagsHtml || '<div class="bookmark-tags-empty">暂无标签</div>'}
        <div class="bookmark-tags-actions">
          <button class="action-btn-link" id="smartTagsBtn">智能识别标签</button>
          <button class="action-btn-link" id="editTagsBtn">编辑标签</button>
        </div>
        <!-- 智能标签加载状态 -->
        <div id="smartTagsLoading" class="smart-tags-loading" style="display: none;">
          <div class="smart-tags-loading-spinner"></div>
          <div class="smart-tags-loading-text">正在分析页面内容...</div>
        </div>
        <!-- 智能标签建议区域 -->
        <div id="smartTagsSuggestions" class="smart-tags-suggestions" style="display: none;">
          <div class="smart-tags-suggestions-header">
            <span class="smart-tags-suggestions-title">AI建议标签：</span>
            <button class="action-btn-link smart-tags-close" id="closeSmartTagsBtn">收起</button>
          </div>
          <div class="smart-tags-suggestions-list" id="smartTagsSuggestionsList">
            <!-- 标签建议将在这里动态生成 -->
          </div>
          <div class="smart-tags-suggestions-actions">
            <button class="action-btn-link" id="applySelectedTagsBtn">应用选中标签</button>
          </div>
        </div>
      </div>
      
      <div class="bookmark-meta">
        收藏时间：${dateStr}
      </div>
    `;

    // 复制网址按钮
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(bookmark.url);
          showNotification('链接已复制');
        } catch (error) {
          // 降级方案
          const textArea = document.createElement('textarea');
          textArea.value = bookmark.url;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          showNotification('链接已复制');
        }
      });
    }

    // 编辑标签按钮
    const editTagsBtn = document.getElementById('editTagsBtn');
    if (editTagsBtn) {
      editTagsBtn.addEventListener('click', () => {
        startEditTags(bookmark.id);
      });
    }

    // 智能识别标签按钮
    const smartTagsBtn = document.getElementById('smartTagsBtn');
    if (smartTagsBtn) {
      // 检查API配置状态并设置按钮状态
      checkApiConfigStatus().then(hasConfig => {
        if (!hasConfig) {
          smartTagsBtn.disabled = true;
          smartTagsBtn.title = '请先在设置中配置并启用API（开启总开关并启用至少一个API）';
        } else {
          smartTagsBtn.disabled = false;
          smartTagsBtn.title = '使用AI分析页面内容并生成标签';
        }
      });

      smartTagsBtn.addEventListener('click', async () => {
        await generateSmartTags(bookmark.id);
      });
    }

  } catch (error) {
    console.error('加载书签信息失败:', error);
    bookmarkContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">加载失败</div>
      </div>
    `;
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示通知
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  
  // 根据类型设置不同的背景色
  let bgColor = '#28a745'; // 默认成功（绿色）
  if (type === 'error') {
    bgColor = '#dc3545'; // 错误（红色）
  } else if (type === 'info') {
    bgColor = '#17a2b8'; // 信息（蓝色）
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}


// 获取书签标签
async function getBookmarkTags(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    console.error('获取书签标签失败:', error);
    return [];
  }
}

// 保存书签标签
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
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

// 保存书签内容概括
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
  } catch (error) {
    console.error('保存内容概括失败:', error);
    throw error;
  }
}

// 获取书签内容概括
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

// 解析标签输入文本（格式：#tag1 #tag2 #tag3）
function parseTags(inputText) {
  if (!inputText || !inputText.trim()) {
    return [];
  }
  
  // 按空格分割
  const parts = inputText.trim().split(/\s+/);
  const tags = [];
  
  for (const part of parts) {
    // 移除#号（如果有）
    let tag = part.trim();
    if (tag.startsWith('#')) {
      tag = tag.substring(1);
    }
    
    // 如果tag不为空且不包含空格，则添加
    if (tag && !tag.includes(' ')) {
      tags.push(tag);
    }
  }
  
  // 去重
  return [...new Set(tags)];
}

// 格式化标签为显示文本（#tag1 #tag2 #tag3）
function formatTags(tags) {
  return tags.map(tag => `#${tag}`).join(' ');
}

// 开始编辑标签
async function startEditTags(bookmarkId) {
  const dialog = document.getElementById('tagsEditDialog');
  const input = document.getElementById('tagsEditInput');
  const preview = document.getElementById('tagsEditPreview');
  const closeBtn = dialog.querySelector('.tags-edit-close');
  const cancelBtn = dialog.querySelector('.tags-edit-btn.cancel');
  const saveBtn = dialog.querySelector('.tags-edit-btn.save');
  const overlay = dialog.querySelector('.tags-edit-overlay');

  if (!dialog || !input || !preview) return;

  // 获取当前标签
  const currentTags = await getBookmarkTags(bookmarkId);
  const currentTagsText = formatTags(currentTags);
  input.value = currentTagsText;

  // 更新预览
  function updatePreview() {
    const tags = parseTags(input.value);
    if (tags.length > 0) {
      preview.innerHTML = `
        <div class="tags-preview-label">预览：</div>
        <div class="tags-preview-tags">
          ${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    } else {
      preview.innerHTML = '<div class="tags-preview-empty">暂无标签</div>';
    }
  }

  // 初始预览
  updatePreview();

  // 输入时更新预览
  input.oninput = updatePreview;

  // 显示对话框
  dialog.style.display = 'flex';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);

  // 关闭对话框
  function closeDialog() {
    dialog.style.display = 'none';
    input.oninput = null;
  }

  closeBtn.onclick = closeDialog;
  cancelBtn.onclick = closeDialog;
  overlay.onclick = closeDialog;

  // 保存标签
  saveBtn.onclick = async () => {
    const tags = parseTags(input.value);
    try {
      await saveBookmarkTags(bookmarkId, tags);
      closeDialog();
      showNotification('标签已保存');
      loadBookmarkInfo(); // 重新加载以更新显示
    } catch (error) {
      console.error('保存标签失败:', error);
      showNotification('保存失败');
    }
  };

  // ESC键关闭，Ctrl+Enter保存
  input.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveBtn.click();
    }
  };
}


// ==================== 智能标签生成功能 ====================

//消息类型常量
const MESSAGE_TYPES = {
  GENERATE_SMART_TAGS: 'GENERATE_SMART_TAGS'
};

//检查API配置状态
async function checkApiConfigStatus() {
  try {
    const result = await chrome.storage.local.get('aiApiConfigV2');
    const config = result.aiApiConfigV2;

    if (!config) {
      return false;
    }

    // 检查总开关
    if (!config.enabled) {
      return false;
    }

    // 检查是否有启用的API
    const activeApi = config.apis && config.apis.find(api => api.enabled === true);
    return !!activeApi;
  } catch (error) {
    console.error('检查API配置状态失败:', error);
    return false;
  }
}

//生成智能标签
async function generateSmartTags(bookmarkId) {
  const smartTagsBtn = document.getElementById('smartTagsBtn');
  const loadingEl = document.getElementById('smartTagsLoading');
  const suggestionsEl = document.getElementById('smartTagsSuggestions');

  try {
    // 检查API配置状态
    const hasConfig = await checkApiConfigStatus();
    if (!hasConfig) {
      showNotification('请先在设置中配置并启用API：开启总开关并启用至少一个API', 'error');
      return;
    }

    // 禁用按钮并更新文本
    if (smartTagsBtn) {
      smartTagsBtn.disabled = true;
      smartTagsBtn.textContent = '生成中...';
    }

    // 显示加载状态
    if (loadingEl) {
      loadingEl.style.display = 'block';
    }
    if (suggestionsEl) {
      suggestionsEl.style.display = 'none';
    }

    // 获取当前活动标签页ID（如果可能）
    let tabId = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        tabId = tabs[0].id;
      }
    } catch (error) {
      console.warn('无法获取标签页ID:', error);
    }

    // 发送消息到background生成标签
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GENERATE_SMART_TAGS,
        bookmarkId: bookmarkId,
        tabId: tabId
      });
    } catch (error) {
      // 处理消息发送失败（如扩展已卸载等）
      console.error('发送消息失败:', error);
      throw new Error('无法连接到扩展服务，请刷新页面后重试');
    }

    // 检查响应是否为空（扩展可能已卸载）
    if (!response) {
      throw new Error('未收到响应，扩展可能已重新加载，请刷新页面后重试');
    }

    // 隐藏加载状态
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }

    if (response && response.success && response.tags && response.tags.length > 0) {
      // 显示标签建议（同时保存概括内容，如果存在）
      displayTagSuggestions(response.tags, bookmarkId, response.summary);
      // 如果有概括内容，自动保存
      if (response.summary && response.summary.trim()) {
        await saveBookmarkSummary(bookmarkId, response.summary);
      }
      // 生成结果提示
      const tagCount = response.tags.length;
      const tagText = tagCount === 1 ? '个标签' : '个标签';
      const summaryText = response.summary ? '（已生成内容概括）' : '';
      showNotification(`已生成${tagCount}${tagText}建议${summaryText}`, 'success');
    } else {
      // 空结果或错误提示
      if (response && response.success && (!response.tags || response.tags.length === 0)) {
        // 空结果提示
        showNotification('未生成标签，请检查内容或API配置', 'error');
      } else {
        // 错误提示
        const errorMsg = response?.error || '未能生成标签，请检查API配置或页面内容';
        showNotification(errorMsg, 'error');
      }
    }
  } catch (error) {
    console.error('生成智能标签失败:', error);
    
    // 隐藏加载状态
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    
    // 根据错误类型显示不同的提示
    let errorMessage = '生成标签失败：';
    if (error.message) {
      errorMessage += error.message;
    } else if (error.toString) {
      errorMessage += error.toString();
    } else {
      errorMessage += '未知错误，请稍后重试';
    }
    
    showNotification(errorMessage, 'error');
  } finally {
    // 恢复按钮状态
    if (smartTagsBtn) {
      smartTagsBtn.disabled = false;
      smartTagsBtn.textContent = '智能识别标签';
    }
  }
}

//显示标签建议
function displayTagSuggestions(tags, bookmarkId, summary = '') {
  const suggestionsEl = document.getElementById('smartTagsSuggestions');
  const suggestionsListEl = document.getElementById('smartTagsSuggestionsList');
  const closeBtn = document.getElementById('closeSmartTagsBtn');
  const applyBtn = document.getElementById('applySelectedTagsBtn');

  if (!suggestionsEl || !suggestionsListEl) {
    return;
  }

  // 存储选中的标签
  const selectedTags = new Set();

  // 生成标签卡片HTML
  const tagsHtml = tags.map((tag, index) => {
    const tagId = `smart-tag-${index}`;
    return `
      <label class="smart-tag-item" for="${tagId}">
        <input type="checkbox" id="${tagId}" class="smart-tag-checkbox" value="${escapeHtml(tag)}" data-tag="${escapeHtml(tag)}">
        <span class="smart-tag-label">${escapeHtml(tag)}</span>
      </label>
    `;
  }).join('');

  suggestionsListEl.innerHTML = tagsHtml;

  // 更新应用按钮状态（根据选中数量）
  const updateApplyButton = () => {
    const count = selectedTags.size;
    if (applyBtn) {
      if (count > 0) {
        applyBtn.textContent = `应用选中标签 (${count})`;
        applyBtn.disabled = false;
      } else {
        applyBtn.textContent = '应用选中标签';
        applyBtn.disabled = true;
      }
    }
  };

  // 初始状态
  updateApplyButton();

  // 绑定标签选择事件
  const checkboxes = suggestionsListEl.querySelectorAll('.smart-tag-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const tag = e.target.value;
      if (e.target.checked) {
        selectedTags.add(tag);
      } else {
        selectedTags.delete(tag);
      }
      // 更新应用按钮状态
      updateApplyButton();
    });
  });

  // 绑定收起按钮
  if (closeBtn) {
    closeBtn.onclick = () => {
      suggestionsEl.style.display = 'none';
    };
  }

  // 绑定应用按钮
  if (applyBtn) {
    applyBtn.onclick = async () => {
      await applySelectedTags(Array.from(selectedTags), bookmarkId);
    };
  }

  // 显示建议区域
  suggestionsEl.style.display = 'block';
}

//应用选中的标签
async function applySelectedTags(selectedTags, bookmarkId) {
  try {
    if (selectedTags.length === 0) {
      showNotification('请至少选择一个标签', 'error');
      return;
    }

    // 获取当前标签
    const currentTags = await getBookmarkTags(bookmarkId);
    
    // 合并标签（去重）
    const mergedTags = [...new Set([...currentTags, ...selectedTags])];
    
    // 计算新增的标签数量（排除已存在的）
    const newTagsCount = selectedTags.filter(tag => !currentTags.includes(tag)).length;

    // 保存标签
    await saveBookmarkTags(bookmarkId, mergedTags);

    // 隐藏建议区域
    const suggestionsEl = document.getElementById('smartTagsSuggestions');
    if (suggestionsEl) {
      suggestionsEl.style.display = 'none';
    }

    // 显示成功提示（区分新增和已存在）
    if (newTagsCount > 0) {
      showNotification(`已添加${newTagsCount}个新标签`, 'success');
    } else {
      showNotification('所选标签已存在', 'info');
    }

    // 重新加载书签信息以更新显示
    await loadBookmarkInfo();
  } catch (error) {
    console.error('应用标签失败:', error);
    showNotification('保存标签失败', 'error');
  }
}

// 页面加载时加载书签信息
document.addEventListener('DOMContentLoaded', () => {
  loadBookmarkInfo();
});

