// 存储所有书签的数组
let allBookmarks = [];
let filteredBookmarks = [];

// 书签导图相关状态
let bookmarkMapDataTimestamp = null; // 上次发送数据的时间戳
let bookmarkMapLastUpdateTime = null; // 书签数据最后更新时间

// DOM 元素
const loadingEl = document.getElementById('loading');
const bookmarksListEl = document.getElementById('bookmarksList');
const emptyStateEl = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const totalCountEl = document.getElementById('totalCount');

// 获取文件夹路径的辅助函数
function getFolderPath(bookmark, bookmarkTree) {
  if (!bookmark.parentId || bookmark.parentId === '0') {
    return '根目录';
  }

  function findParent(id, tree, path = []) {
    for (const node of tree) {
      if (node.id === id) {
        return path;
      }
      if (node.children) {
        const found = findParent(id, node.children, [...path, node.title]);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  }

  const path = findParent(bookmark.parentId, bookmarkTree);
  return path ? path.join(' / ') : '未知文件夹';
}

// 获取书签的tag列表
async function getBookmarkTags(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    console.error('获取书签tag失败:', error);
    return [];
  }
}

// 获取书签内容概括
async function getBookmarkSummary(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkSummaries');
    const bookmarkSummaries = result.bookmarkSummaries || {};
    return bookmarkSummaries[bookmarkId] || '';
  } catch (error) {
    console.error('获取书签内容概括失败:', error);
    return '';
  }
}

// 获取所有书签的tag（批量）
async function getAllBookmarkTags() {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    return result.bookmarkTags || {};
  } catch (error) {
    console.error('获取所有书签tag失败:', error);
    return {};
  }
}

// 递归提取所有书签
async function extractBookmarks(nodes, bookmarkTree, bookmarks = []) {
  // 先获取所有tag
  const allTags = await getAllBookmarkTags();
  
  for (const node of nodes) {
    if (node.url) {
      // 这是一个书签
      const bookmarkTags = allTags[node.id] || [];
      bookmarks.push({
        id: node.id,
        title: node.title || '无标题',
        url: node.url,
        folder: getFolderPath(node, bookmarkTree),
        tags: bookmarkTags
      });
    }
    if (node.children) {
      // 这是一个文件夹，递归处理
      await extractBookmarks(node.children, bookmarkTree, bookmarks);
    }
  }
  return bookmarks;
}

// 加载所有书签
async function loadBookmarks() {
  try {
    loadingEl.style.display = 'block';
    bookmarksListEl.style.display = 'none';
    emptyStateEl.style.display = 'none';

    // 获取书签树
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 提取所有书签（异步）
    allBookmarks = await extractBookmarks(bookmarkTree, bookmarkTree);
    
    // 更新统计
    totalCountEl.textContent = allBookmarks.length;
    
    // 应用当前搜索过滤
    applyFilter();
    
    loadingEl.style.display = 'none';
    
    if (filteredBookmarks.length === 0) {
      emptyStateEl.style.display = 'block';
    } else {
      bookmarksListEl.style.display = 'grid';
      renderBookmarks();
    }
  } catch (error) {
    console.error('加载书签失败:', error);
    loadingEl.style.display = 'none';
    bookmarksListEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #dc3545;">
        <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
        <div>加载书签时出错: ${error.message}</div>
      </div>
    `;
    bookmarksListEl.style.display = 'block';
  }
}

// 渲染书签列表
function renderBookmarks() {
  if (filteredBookmarks.length === 0) {
    emptyStateEl.style.display = 'block';
    bookmarksListEl.style.display = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  bookmarksListEl.style.display = 'grid';

  bookmarksListEl.innerHTML = filteredBookmarks.map(bookmark => {
    // 提取域名用于显示
    let domain = '';
    try {
      const urlObj = new URL(bookmark.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = bookmark.url;
    }

    const bookmarkId = bookmark.id;
    const bookmarkUrl = bookmark.url;
    const bookmarkTitle = escapeHtml(bookmark.title);
    const escapedUrl = escapeHtml(bookmarkUrl);
    const tags = bookmark.tags || [];

    // 渲染tag HTML
    let tagsHtml = '';
    if (tags.length > 0) {
      tagsHtml = `
        <div class="bookmark-tags">
          ${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    }

    return `
      <div class="bookmark-item" data-bookmark-id="${bookmarkId}" data-bookmark-url="${escapedUrl}" data-bookmark-title="${bookmarkTitle}">
        <button class="bookmark-menu-btn" data-menu-id="${bookmarkId}">⋮</button>
        <div class="bookmark-menu" id="menu-${bookmarkId}">
          <button class="bookmark-menu-item details" data-bookmark-id="${bookmarkId}">详情</button>
          <button class="bookmark-menu-item edit" data-bookmark-id="${bookmarkId}">编辑</button>
          <button class="bookmark-menu-item edit-tags" data-bookmark-id="${bookmarkId}">编辑标签</button>
          <button class="bookmark-menu-item copy-link" data-url="${escapedUrl}">复制链接</button>
          <button class="bookmark-menu-item delete" data-bookmark-id="${bookmarkId}" data-bookmark-title="${bookmarkTitle}">删除</button>
        </div>
        <div class="bookmark-title" id="title-${bookmarkId}">${bookmarkTitle}</div>
        <input type="text" class="bookmark-title-edit" id="title-edit-${bookmarkId}" value="${bookmarkTitle}" style="display: none;">
        <div class="bookmark-url" title="${escapedUrl}">${escapeHtml(domain)}</div>
        ${tagsHtml}
        <div class="bookmark-folder">${escapeHtml(bookmark.folder)}</div>
      </div>
    `;
  }).join('');
}

// HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// JavaScript 字符串转义函数（用于 onclick 等属性）
function escapeJsString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// 应用搜索过滤
function applyFilter() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  
  if (searchTerm === '') {
    filteredBookmarks = [...allBookmarks];
  } else {
    filteredBookmarks = allBookmarks.filter(bookmark => {
      return bookmark.title.toLowerCase().includes(searchTerm) ||
             bookmark.url.toLowerCase().includes(searchTerm) ||
             bookmark.folder.toLowerCase().includes(searchTerm);
    });
  }

  totalCountEl.textContent = filteredBookmarks.length;
  renderBookmarks();
}

// 切换菜单显示/隐藏
function toggleMenu(bookmarkId) {
  const menu = document.getElementById(`menu-${bookmarkId}`);
  if (menu) {
    // 如果菜单已经打开，则关闭它
    if (menu.classList.contains('show')) {
      menu.classList.remove('show');
    } else {
      // 否则先关闭所有菜单，再打开当前菜单
      closeAllMenus();
      menu.classList.add('show');
    }
  }
}

// 关闭指定菜单
function closeMenu(bookmarkId) {
  const menu = document.getElementById(`menu-${bookmarkId}`);
  if (menu) {
    menu.classList.remove('show');
  }
}

// 关闭所有菜单
function closeAllMenus() {
  const menus = document.querySelectorAll('.bookmark-menu');
  menus.forEach(menu => {
    menu.classList.remove('show');
  });
}

// 打开书签
function openBookmark(url) {
  chrome.tabs.create({ url: url });
}

// 复制链接
async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    // 可以添加提示信息
    showNotification('链接已复制到剪贴板');
  } catch (error) {
    console.error('复制失败:', error);
    // 降级方案：使用旧方法
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification('链接已复制到剪贴板');
  }
}

// 开始编辑书签标题
function startEditBookmark(bookmarkId) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (titleEl && editInput) {
    titleEl.style.display = 'none';
    editInput.style.display = 'block';
    editInput.focus();
    editInput.select();
  }
}

// 取消编辑书签标题
function cancelEditBookmark(bookmarkId) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (titleEl && editInput) {
    // 恢复原始值
    const originalTitle = titleEl.textContent;
    editInput.value = originalTitle;
    editInput.style.display = 'none';
    titleEl.style.display = 'block';
  }
}

// 保存书签标题
function saveBookmarkTitle(bookmarkId, newTitle) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (!titleEl || !editInput) {
    return;
  }

  // 如果标题为空，使用原标题
  if (!newTitle || newTitle.trim() === '') {
    cancelEditBookmark(bookmarkId);
    return;
  }

  // 如果标题没有改变，直接取消编辑
  const originalTitle = titleEl.textContent.trim();
  if (newTitle === originalTitle) {
    cancelEditBookmark(bookmarkId);
    return;
  }

  // 更新书签标题
  chrome.bookmarks.update(bookmarkId, { title: newTitle })
    .then(() => {
      // 更新显示
      titleEl.textContent = newTitle;
      editInput.value = newTitle;
      editInput.style.display = 'none';
      titleEl.style.display = 'block';
      
      // 更新数据
      const bookmark = allBookmarks.find(b => b.id === bookmarkId);
      if (bookmark) {
        bookmark.title = newTitle;
      }
      
      // 更新书签项的数据属性
      const bookmarkItem = titleEl.closest('.bookmark-item');
      if (bookmarkItem) {
        bookmarkItem.setAttribute('data-bookmark-title', escapeHtml(newTitle));
      }
      
      showNotification('书签标题已更新');
    })
    .catch(error => {
      console.error('更新书签标题失败:', error);
      alert('更新书签标题失败: ' + error.message);
      cancelEditBookmark(bookmarkId);
    });
}

// 解析tag输入文本（格式：#tag1 #tag2 #tag3）
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

// 格式化tag为显示文本（#tag1 #tag2 #tag3）
function formatTags(tags) {
  return tags.map(tag => `#${tag}`).join(' ');
}

// 开始编辑标签
async function startEditTags(bookmarkId) {
  // 获取当前标签
  const currentTags = await getBookmarkTags(bookmarkId);
  const currentTagsText = formatTags(currentTags);
  
  // 创建编辑对话框
  const dialog = document.createElement('div');
  dialog.className = 'tags-edit-dialog';
  dialog.innerHTML = `
    <div class="tags-edit-overlay"></div>
    <div class="tags-edit-content">
      <div class="tags-edit-header">
        <h3>编辑标签</h3>
        <button class="tags-edit-close">×</button>
      </div>
      <div class="tags-edit-body">
        <div class="tags-edit-hint">输入标签，以 # 开头，空格分隔（例如：#工作 #重要）</div>
        <input type="text" class="tags-edit-input" id="tags-edit-input-${bookmarkId}" 
               value="${escapeHtml(currentTagsText)}" 
               placeholder="#标签1 #标签2">
        <div class="tags-edit-preview" id="tags-edit-preview-${bookmarkId}"></div>
      </div>
      <div class="tags-edit-actions">
        <button class="tags-edit-btn cancel">取消</button>
        <button class="tags-edit-btn save">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  const input = dialog.querySelector('.tags-edit-input');
  const preview = dialog.querySelector(`#tags-edit-preview-${bookmarkId}`);
  const closeBtn = dialog.querySelector('.tags-edit-close');
  const cancelBtn = dialog.querySelector('.tags-edit-btn.cancel');
  const saveBtn = dialog.querySelector('.tags-edit-btn.save');
  const overlay = dialog.querySelector('.tags-edit-overlay');
  
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
  input.addEventListener('input', updatePreview);
  
  // 关闭对话框
  function closeDialog() {
    document.body.removeChild(dialog);
  }
  
  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', closeDialog);
  
  // 保存标签
  saveBtn.addEventListener('click', async () => {
    const tags = parseTags(input.value);
    await saveBookmarkTags(bookmarkId, tags);
    closeDialog();
    showNotification('标签已保存');
    loadBookmarks(); // 重新加载以更新显示
  });
  
  // ESC键关闭
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDialog();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      saveBtn.click();
    }
  });
  
  // 聚焦输入框
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

// 保存书签标签
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    bookmarkTags[bookmarkId] = tags;
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

// 显示书签详情
async function showBookmarkDetails(bookmarkId) {
  try {
    // 获取书签信息
    const bookmarkNodes = await chrome.bookmarks.get(bookmarkId);
    if (!bookmarkNodes || bookmarkNodes.length === 0) {
      showNotification('无法找到该书签', 'error');
      return;
    }
    
    const bookmark = bookmarkNodes[0];
    if (!bookmark.url) {
      showNotification('这是一个文件夹，不是书签', 'error');
      return;
    }

    // 获取标签
    const tags = await getBookmarkTags(bookmarkId);
    
    // 获取内容概括
    const summary = await getBookmarkSummary(bookmarkId);
    
    // 获取文件夹路径
    const bookmarkTree = await chrome.bookmarks.getTree();
    const folder = getFolderPath(bookmark, bookmarkTree);

    // 格式化日期
    const dateAdded = bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : '未知';

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'bookmark-details-dialog';
    dialog.innerHTML = `
      <div class="bookmark-details-overlay"></div>
      <div class="bookmark-details-content">
        <div class="bookmark-details-header">
          <h3>书签详情</h3>
          <button class="bookmark-details-close">×</button>
        </div>
        <div class="bookmark-details-body">
          <div class="bookmark-detail-item bookmark-detail-item-title">
            <div class="bookmark-detail-label">标题</div>
            <div class="bookmark-detail-value bookmark-detail-title-value">${escapeHtml(bookmark.title)}</div>
          </div>
          <div class="bookmark-detail-item">
            <div class="bookmark-detail-label">URL</div>
            <div class="bookmark-detail-value bookmark-detail-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.url)}</div>
          </div>
          ${summary ? `
          <div class="bookmark-detail-item bookmark-detail-item-summary">
            <div class="bookmark-detail-label">内容概括</div>
            <div class="bookmark-detail-value bookmark-detail-summary-value">${escapeHtml(summary)}</div>
          </div>
          ` : ''}
          <div class="bookmark-detail-item">
            <div class="bookmark-detail-label">文件夹</div>
            <div class="bookmark-detail-value bookmark-detail-folder-value">${escapeHtml(folder)}</div>
          </div>
          <div class="bookmark-detail-item">
            <div class="bookmark-detail-label">标签</div>
            <div class="bookmark-detail-value">
              ${tags.length > 0 
                ? `<div class="bookmark-details-tags">${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
                : '<span class="bookmark-details-no-tags">暂无标签</span>'
              }
            </div>
          </div>
          <div class="bookmark-detail-item bookmark-detail-item-time">
            <div class="bookmark-detail-label">添加时间</div>
            <div class="bookmark-detail-value bookmark-detail-time-value">${dateAdded}</div>
          </div>
        </div>
        <div class="bookmark-details-actions">
          <button class="bookmark-details-btn bookmark-details-btn-close">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const closeBtn = dialog.querySelector('.bookmark-details-close');
    const closeActionBtn = dialog.querySelector('.bookmark-details-btn-close');
    const overlay = dialog.querySelector('.bookmark-details-overlay');

    // 关闭对话框
    function closeDialog() {
      document.body.removeChild(dialog);
    }

    closeBtn.addEventListener('click', closeDialog);
    closeActionBtn.addEventListener('click', closeDialog);
    overlay.addEventListener('click', closeDialog);

    // 点击URL打开链接
    const urlElement = dialog.querySelector('.bookmark-detail-url');
    if (urlElement) {
      urlElement.style.cursor = 'pointer';
      urlElement.addEventListener('click', (e) => {
        e.stopPropagation();
        openBookmark(bookmark.url);
      });
    }

    // ESC键关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  } catch (error) {
    console.error('显示书签详情失败:', error);
    showNotification('加载书签详情失败: ' + error.message, 'error');
  }
}

// 删除书签
function deleteBookmark(id, title) {
  if (confirm(`确定要删除书签 "${title}" 吗？`)) {
    chrome.bookmarks.remove(id).then(() => {
      showNotification('书签已删除');
      loadBookmarks();
    }).catch(error => {
      console.error('删除书签失败:', error);
      alert('删除书签失败: ' + error.message);
    });
  }
}

// 显示通知
function showNotification(message, type = 'success') {
  // 创建一个简单的通知
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
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 根据类型设置自动隐藏时间
  const hideDelay = type === 'error' ? 5000 : (type === 'info' ? 4000 : 3000);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, hideDelay);
}

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 事件监听
searchInput.addEventListener('input', applyFilter);
refreshBtn.addEventListener('click', loadBookmarks);

// 监听存储变化（书签变化通知）
let lastChangeTimestamp = 0;

// 页面可见性变化时刷新（当用户切换回选项页面时）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const allBookmarksView = document.getElementById('all-bookmarks');
    if (allBookmarksView && allBookmarksView.classList.contains('active')) {
      loadBookmarks();
    }
  }
});


// 初始化事件委托（在书签列表容器上统一处理事件）
function initEventDelegation() {
  const bookmarksListEl = document.getElementById('bookmarksList');
  
  // 使用事件委托处理所有书签相关的点击事件
  bookmarksListEl.addEventListener('click', (e) => {
    // 菜单按钮点击
    if (e.target.classList.contains('bookmark-menu-btn')) {
      e.stopPropagation();
      const menuId = e.target.getAttribute('data-menu-id');
      toggleMenu(menuId);
      return;
    }

    // 详情按钮
    if (e.target.classList.contains('details')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      if (bookmarkId) {
        showBookmarkDetails(bookmarkId);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 编辑按钮
    if (e.target.classList.contains('edit')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      if (bookmarkId) {
        startEditBookmark(bookmarkId);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 编辑标签按钮
    if (e.target.classList.contains('edit-tags')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      if (bookmarkId) {
        startEditTags(bookmarkId);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 复制链接按钮
    if (e.target.classList.contains('copy-link')) {
      e.stopPropagation();
      const url = e.target.getAttribute('data-url');
      if (url) {
        copyUrl(url);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 删除按钮
    if (e.target.classList.contains('delete')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      const bookmarkTitle = e.target.getAttribute('data-bookmark-title');
      if (bookmarkId && bookmarkTitle) {
        deleteBookmark(bookmarkId, bookmarkTitle);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 编辑输入框的事件处理
    if (e.target.classList.contains('bookmark-title-edit')) {
      e.stopPropagation();
      // 键盘事件在 input 元素上直接处理
      if (e.type === 'keydown') {
        if (e.key === 'Enter') {
          e.preventDefault();
          const bookmarkId = e.target.id.replace('title-edit-', '');
          saveBookmarkTitle(bookmarkId, e.target.value.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          const bookmarkId = e.target.id.replace('title-edit-', '');
          cancelEditBookmark(bookmarkId);
        }
      } else if (e.type === 'blur') {
        const bookmarkId = e.target.id.replace('title-edit-', '');
        saveBookmarkTitle(bookmarkId, e.target.value.trim());
      }
      return;
    }

    // 点击卡片打开网站（排除菜单按钮、菜单本身、编辑输入框）
    if (!e.target.closest('.bookmark-menu-btn') && 
        !e.target.closest('.bookmark-menu') && 
        !e.target.classList.contains('bookmark-title-edit')) {
      const bookmarkItem = e.target.closest('.bookmark-item');
      if (bookmarkItem) {
        const url = bookmarkItem.getAttribute('data-bookmark-url');
        if (url) {
          openBookmark(url);
        }
      }
    }
  });

  // 为编辑输入框添加 blur 事件（事件委托不支持 blur，需要单独添加）
  bookmarksListEl.addEventListener('blur', (e) => {
    if (e.target.classList.contains('bookmark-title-edit')) {
      const bookmarkId = e.target.id.replace('title-edit-', '');
      saveBookmarkTitle(bookmarkId, e.target.value.trim());
    }
  }, true);

  // 为编辑输入框添加 keydown 事件
  bookmarksListEl.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('bookmark-title-edit')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const bookmarkId = e.target.id.replace('title-edit-', '');
        saveBookmarkTitle(bookmarkId, e.target.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const bookmarkId = e.target.id.replace('title-edit-', '');
        cancelEditBookmark(bookmarkId);
      }
    }
  });
}

// 当前选中的收藏夹ID
let currentFolderId = '0';
let bookmarkTreeCache = null;

// 获取所有书签树
async function getBookmarkTree() {
  if (!bookmarkTreeCache) {
    bookmarkTreeCache = await chrome.bookmarks.getTree();
  }
  return bookmarkTreeCache;
}

// 清空缓存
function clearBookmarkTreeCache() {
  bookmarkTreeCache = null;
}

// 渲染收藏夹树
async function renderFoldersTree() {
  const foldersTreeEl = document.getElementById('foldersTree');
  if (!foldersTreeEl) return;

  try {
    const tree = await getBookmarkTree();
    const rootNode = tree[0]; // 根节点

    function renderTreeNode(node, level = 0) {
      // 跳过根节点本身，只处理其子节点
      if (node.id === '0') {
        if (!node.children) return '';
        return node.children
          .filter(child => !child.url) // 只显示文件夹
          .map(child => renderTreeNode(child, level))
          .join('');
      }

      // 如果是文件夹
      if (!node.url && node.children) {
        const hasChildren = node.children.some(child => !child.url);
        const indent = level * 16;
        
        let html = `
          <div class="tree-folder-item ${hasChildren ? 'has-children' : ''}" 
               data-folder-id="${node.id}" 
               data-folder-name="${escapeHtml(node.title)}"
               style="padding-left: ${indent}px;">
            <span class="tree-folder-item-text">${escapeHtml(node.title)}</span>
          </div>
        `;

        if (hasChildren) {
          html += `<div class="tree-folder-children">`;
          node.children
            .filter(child => !child.url) // 只处理文件夹
            .forEach(child => {
              html += renderTreeNode(child, level + 1);
            });
          html += `</div>`;
        }

        return html;
      }
      return '';
    }

    foldersTreeEl.innerHTML = renderTreeNode(rootNode);

    // 为树节点添加事件
    const treeItems = foldersTreeEl.querySelectorAll('.tree-folder-item');
    treeItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.getAttribute('data-folder-name');
        
        // 展开/折叠
        if (item.classList.contains('has-children')) {
          item.classList.toggle('expanded');
        }
        
        // 选中
        treeItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // 加载内容
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
      });
    });

    // 默认选中根节点并加载
    if (treeItems.length > 0) {
      treeItems[0].click();
    }
  } catch (error) {
    console.error('渲染收藏夹树失败:', error);
    foldersTreeEl.innerHTML = `
      <div class="folders-empty">
        <div class="folders-empty-text">加载失败</div>
      </div>
    `;
  }
}

// 更新面包屑导航
function updateBreadcrumb(folderId) {
  const breadcrumbEl = document.getElementById('foldersBreadcrumb');
  if (!breadcrumbEl) return;

  async function buildBreadcrumb(targetId) {
    const tree = await getBookmarkTree();
    const path = [];
    
    function findPath(nodes, targetId, currentPath = []) {
      for (const node of nodes) {
        const newPath = node.id === '0' ? [] : [...currentPath, { id: node.id, title: node.title }];
        
        if (node.id === targetId) {
          path.push(...newPath);
          return true;
        }
        
        if (node.children) {
          if (findPath(node.children, targetId, newPath)) {
            return true;
          }
        }
      }
      return false;
    }
    
    findPath(tree, targetId);
    
    let html = '<span class="breadcrumb-item active" data-folder-id="0">收藏夹</span>';
    
    path.forEach((folder, index) => {
      html += '<span class="breadcrumb-separator">›</span>';
      const isLast = index === path.length - 1;
      html += `
        <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
              data-folder-id="${folder.id}">
          ${escapeHtml(folder.title)}
        </span>
      `;
    });
    
    breadcrumbEl.innerHTML = html;
    
    // 为面包屑添加点击事件
    const breadcrumbItems = breadcrumbEl.querySelectorAll('.breadcrumb-item:not(.active)');
    breadcrumbItems.forEach(item => {
      item.addEventListener('click', () => {
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.textContent.trim();
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
        
        // 更新树选中状态
        const treeItems = document.querySelectorAll('.tree-folder-item');
        treeItems.forEach(treeItem => {
          treeItem.classList.remove('active');
          if (treeItem.getAttribute('data-folder-id') === folderId) {
            treeItem.classList.add('active');
            // 确保父节点都展开
            let parent = treeItem.parentElement;
            while (parent && !parent.classList.contains('folders-tree-content')) {
              const folderItem = parent.previousElementSibling;
              if (folderItem && folderItem.classList.contains('tree-folder-item')) {
                folderItem.classList.add('expanded');
              }
              parent = parent.parentElement;
            }
          }
        });
      });
    });
  }
  
  buildBreadcrumb(folderId);
}

// 加载收藏夹内容
async function loadFolderContent(folderId, folderName) {
  const viewContentEl = document.getElementById('foldersViewContent');
  if (!viewContentEl) return;

  try {
    viewContentEl.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>正在加载...</div>
      </div>
    `;

    const tree = await getBookmarkTree();
    let targetNode = null;
    
    // 查找目标节点
    function findNode(nodes, targetId) {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    }
    
    targetNode = findNode(tree, folderId);
    if (!targetNode || !targetNode.children) {
      viewContentEl.innerHTML = `
        <div class="folders-empty">
          <div class="folders-empty-icon">—</div>
          <div class="folders-empty-text">此收藏夹为空</div>
        </div>
      `;
      return;
    }

    const folders = [];
    const bookmarks = [];
    
    targetNode.children.forEach(child => {
      if (child.url) {
        // 书签
        bookmarks.push({
          id: child.id,
          title: child.title || '无标题',
          url: child.url
        });
      } else {
        // 子收藏夹
        folders.push({
          id: child.id,
          title: child.title
        });
      }
    });

    if (folders.length === 0 && bookmarks.length === 0) {
      viewContentEl.innerHTML = `
        <div class="folders-empty">
          <div class="folders-empty-icon">—</div>
          <div class="folders-empty-text">此收藏夹为空</div>
        </div>
      `;
      return;
    }

    // 渲染网格视图
    let html = '<div class="folders-grid">';
    
    // 先显示子收藏夹
    folders.forEach(folder => {
      html += `
        <div class="folder-grid-item" data-folder-id="${folder.id}" data-folder-name="${escapeHtml(folder.title)}">
          <div class="folder-grid-icon">📁</div>
          <div class="folder-grid-name">${escapeHtml(folder.title)}</div>
        </div>
      `;
    });
    
    // 再显示书签
    bookmarks.forEach(bookmark => {
      let domain = '';
      try {
        const urlObj = new URL(bookmark.url);
        domain = urlObj.hostname.replace('www.', '');
      } catch (e) {
        domain = bookmark.url;
      }
      
      html += `
        <div class="bookmark-grid-item" data-bookmark-id="${bookmark.id}" data-bookmark-url="${escapeHtml(bookmark.url)}">
          <div class="bookmark-grid-icon">🔖</div>
          <div class="bookmark-grid-name" title="${escapeHtml(bookmark.title)}">${escapeHtml(bookmark.title)}</div>
        </div>
      `;
    });
    
    html += '</div>';
    viewContentEl.innerHTML = html;

    // 为收藏夹和书签添加点击事件
    const folderItems = viewContentEl.querySelectorAll('.folder-grid-item');
    folderItems.forEach(item => {
      item.addEventListener('click', () => {
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.getAttribute('data-folder-name');
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
        
        // 更新树选中状态
        const treeItems = document.querySelectorAll('.tree-folder-item');
        treeItems.forEach(treeItem => {
          treeItem.classList.remove('active');
          if (treeItem.getAttribute('data-folder-id') === folderId) {
            treeItem.classList.add('active');
          }
        });
      });
    });

    const bookmarkItems = viewContentEl.querySelectorAll('.bookmark-grid-item');
    bookmarkItems.forEach(item => {
      item.addEventListener('click', () => {
        const url = item.getAttribute('data-bookmark-url');
        if (url) {
          openBookmark(url);
        }
      });
    });

  } catch (error) {
    console.error('加载收藏夹内容失败:', error);
    viewContentEl.innerHTML = `
      <div class="folders-empty">
        <div class="folders-empty-icon">—</div>
        <div class="folders-empty-text">加载失败</div>
      </div>
    `;
  }
}

// 侧边栏切换功能（统一处理所有页面）
function initSidebar() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const pageViews = document.querySelectorAll('.page-view');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.getAttribute('data-page');

      // 更新侧边栏激活状态
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // 切换页面视图
      pageViews.forEach(view => {
        view.classList.remove('active');
      });
      
      const targetView = document.getElementById(targetPage);
      if (targetView) {
        targetView.classList.add('active');
        
        // 根据不同的页面加载相应的内容
        if (targetPage === 'page-1') {
          // 收藏夹页面
          clearBookmarkTreeCache();
          renderFoldersTree();
        } else if (targetPage === 'page-2') {
          // 标签检索页面
          renderTagsList();
          initTagSearch();
        } else if (targetPage === 'api-settings') {
          // API配置页面
          initApiSettings();
          // 加载API列表
          loadApiList();
        } else if (targetPage === 'bookmark-map') {
          // 书签导图页面
          initBookmarkMindMapFrame();
        }
        // all-bookmarks 页面不需要特殊处理，因为已经在初始化时加载了
      }
    });
  });
}

// 获取所有标签及其数量
async function getAllTagsWithCount() {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    
    // 统计每个标签的数量
    const tagCounts = {};
    for (const bookmarkId in bookmarkTags) {
      const tags = bookmarkTags[bookmarkId];
      for (const tag of tags) {
        if (tagCounts[tag]) {
          tagCounts[tag]++;
        } else {
          tagCounts[tag] = 1;
        }
      }
    }
    
    // 转换为数组并排序（按使用次数降序）
    const tagsArray = Object.keys(tagCounts).map(tag => ({
      name: tag,
      count: tagCounts[tag]
    })).sort((a, b) => b.count - a.count);
    
    return tagsArray;
  } catch (error) {
    console.error('获取标签列表失败:', error);
    return [];
  }
}

// 渲染标签列表
async function renderTagsList() {
  const tagsListEl = document.getElementById('tagsList');
  if (!tagsListEl) return;

  try {
    tagsListEl.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>正在加载标签...</div>
      </div>
    `;

    const tags = await getAllTagsWithCount();

    if (tags.length === 0) {
      tagsListEl.classList.add('empty');
      tagsListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">暂无标签</div>
          <div class="empty-state-hint">请为书签添加标签后查看</div>
        </div>
      `;
      return;
    }

    // 移除 empty 类（如果有标签）
    tagsListEl.classList.remove('empty');

    tagsListEl.innerHTML = tags.map(tag => `
      <div class="tag-card" data-tag-name="${escapeHtml(tag.name)}">
        <div class="tag-card-name">#${escapeHtml(tag.name)}</div>
        <div class="tag-card-count">${tag.count}</div>
      </div>
    `).join('');

    // 为标签卡片添加点击事件（插入到搜索框）
    const tagCards = tagsListEl.querySelectorAll('.tag-card');
    tagCards.forEach(card => {
      card.addEventListener('click', () => {
        const tagName = card.getAttribute('data-tag-name');
        const searchInput = document.getElementById('tagSearchInput');
        if (searchInput) {
          const currentValue = searchInput.value.trim();
          const newTag = `#${tagName}`;
          
          // 如果搜索框中已经包含该标签，则不添加
          if (!currentValue.includes(newTag)) {
            searchInput.value = currentValue 
              ? `${currentValue} ${newTag}` 
              : newTag;
            // 触发搜索
            performTagSearch();
          }
        }
      });
    });

  } catch (error) {
    console.error('渲染标签列表失败:', error);
    tagsListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">加载失败</div>
      </div>
    `;
  }
}

// 初始化标签搜索功能
function initTagSearch() {
  const searchInput = document.getElementById('tagSearchInput');
  const searchBtn = document.getElementById('tagSearchBtn');
  const clearBtn = document.getElementById('tagSearchClearBtn');
  
  if (!searchInput || !searchBtn) return;

  // 搜索按钮点击事件
  searchBtn.addEventListener('click', performTagSearch);

  // 清除按钮点击事件
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      hideSearchResults();
    });
  }

  // 回车键搜索
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performTagSearch();
    }
  });

  // 输入时显示/隐藏清除按钮
  searchInput.addEventListener('input', () => {
    if (clearBtn) {
      clearBtn.style.display = searchInput.value.trim() ? 'inline-block' : 'none';
    }
  });
}

// 执行标签搜索
async function performTagSearch() {
  const searchInput = document.getElementById('tagSearchInput');
  const resultsEl = document.getElementById('tagSearchResults');
  const resultsListEl = document.getElementById('tagSearchResultsList');
  const resultsCountEl = document.getElementById('tagSearchResultsCount');
  
  if (!searchInput || !resultsEl || !resultsListEl) return;

  const searchText = searchInput.value.trim();
  
  // 如果搜索文本为空，隐藏搜索结果
  if (!searchText) {
    hideSearchResults();
    return;
  }

  // 解析标签（使用已有的parseTags函数）
  const searchTags = parseTags(searchText);
  
  if (searchTags.length === 0) {
    // 显示无标签提示
    resultsEl.style.display = 'block';
    resultsListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">请输入有效的标签格式</div>
        <div class="empty-state-hint">格式：#标签1 #标签2</div>
      </div>
    `;
    if (resultsCountEl) {
      resultsCountEl.textContent = '0 个结果';
    }
    return;
  }

  // 显示加载状态
  resultsEl.style.display = 'block';
  resultsListEl.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <div>正在搜索...</div>
    </div>
  `;

  try {
    // 获取所有书签及其标签
    const bookmarkTree = await chrome.bookmarks.getTree();
    const allBookmarks = await extractBookmarks(bookmarkTree, bookmarkTree);
    const allTags = await getAllBookmarkTags();

    // 搜索包含这些标签的书签
    const matchedBookmarks = allBookmarks.filter(bookmark => {
      const bookmarkTags = allTags[bookmark.id] || [];
      
      // 检查书签是否包含所有搜索的标签（AND逻辑：必须包含所有搜索标签）
      return searchTags.every(searchTag => bookmarkTags.includes(searchTag));
    });

    // 更新结果数量
    if (resultsCountEl) {
      resultsCountEl.textContent = `找到 ${matchedBookmarks.length} 个结果`;
    }

    // 渲染搜索结果
    if (matchedBookmarks.length === 0) {
      resultsListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">未找到匹配的书签</div>
          <div class="empty-state-hint">搜索标签：${searchTags.map(t => `#${t}`).join(' ')}</div>
        </div>
      `;
    } else {
      // 使用与书签列表相同的渲染方式
      resultsListEl.style.display = 'grid';
      resultsListEl.innerHTML = matchedBookmarks.map(bookmark => {
        // 提取域名用于显示
        let domain = '';
        try {
          const urlObj = new URL(bookmark.url);
          domain = urlObj.hostname.replace('www.', '');
        } catch (e) {
          domain = bookmark.url;
        }

        const bookmarkId = bookmark.id;
        const bookmarkUrl = bookmark.url;
        const bookmarkTitle = escapeHtml(bookmark.title);
        const escapedUrl = escapeHtml(bookmarkUrl);
        const tags = bookmark.tags || [];

        // 渲染tag HTML
        let tagsHtml = '';
        if (tags.length > 0) {
          tagsHtml = `
            <div class="bookmark-tags">
              ${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          `;
        }

        return `
          <div class="bookmark-item" data-bookmark-id="${bookmarkId}" data-bookmark-url="${escapedUrl}" data-bookmark-title="${bookmarkTitle}">
            <button class="bookmark-menu-btn" data-menu-id="${bookmarkId}">⋮</button>
            <div class="bookmark-menu" id="menu-${bookmarkId}">
              <button class="bookmark-menu-item details" data-bookmark-id="${bookmarkId}">详情</button>
              <button class="bookmark-menu-item edit" data-bookmark-id="${bookmarkId}">编辑</button>
              <button class="bookmark-menu-item edit-tags" data-bookmark-id="${bookmarkId}">编辑标签</button>
              <button class="bookmark-menu-item copy-link" data-url="${escapedUrl}">复制链接</button>
              <button class="bookmark-menu-item delete" data-bookmark-id="${bookmarkId}" data-bookmark-title="${bookmarkTitle}">删除</button>
            </div>
            <div class="bookmark-title" id="title-${bookmarkId}">${bookmarkTitle}</div>
            <input type="text" class="bookmark-title-edit" id="title-edit-${bookmarkId}" value="${bookmarkTitle}" style="display: none;">
            <div class="bookmark-url" title="${escapedUrl}">${escapeHtml(domain)}</div>
            ${tagsHtml}
            <div class="bookmark-folder">${escapeHtml(bookmark.folder)}</div>
          </div>
        `;
      }).join('');

      // 为搜索结果中的书签绑定事件（复用已有的书签菜单事件）
      // 由于使用事件委托，已经在其他地方绑定了
    }

  } catch (error) {
    console.error('搜索失败:', error);
    resultsListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">搜索失败</div>
        <div class="empty-state-hint">${error.message || '未知错误'}</div>
      </div>
    `;
  }
}

// 隐藏搜索结果
function hideSearchResults() {
  const resultsEl = document.getElementById('tagSearchResults');
  if (resultsEl) {
    resultsEl.style.display = 'none';
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化侧边栏
  initSidebar();
  
  // 初始化事件委托
  initEventDelegation();
  
  // 点击页面其他地方时关闭所有菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bookmark-menu-btn') && !e.target.closest('.bookmark-menu')) {
      closeAllMenus();
    }
  });
  
  // 只在"所有标签"页面加载书签
  loadBookmarks();
  
  // 在 DOM 加载后再设置存储监听器
  // 检查 chrome.storage API 是否可用
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.bookmarkChange) {
          const change = changes.bookmarkChange.newValue;
          if (change && change.timestamp > lastChangeTimestamp) {
            lastChangeTimestamp = change.timestamp;
            
            // 更新"所有标签"页面
            const allBookmarksView = document.getElementById('all-bookmarks');
            if (allBookmarksView && allBookmarksView.classList.contains('active')) {
              loadBookmarks();
            }
            
            // 更新收藏夹页面
            const foldersView = document.getElementById('page-1');
            if (foldersView && foldersView.classList.contains('active')) {
              clearBookmarkTreeCache();
              renderFoldersTree();
            }
            
            // 更新书签导图页面的数据更新时间戳
            bookmarkMapLastUpdateTime = change.timestamp;
            
            // 如果当前正在显示书签导图页面，立即刷新数据
            const bookmarkMapView = document.getElementById('bookmark-map');
            if (bookmarkMapView && bookmarkMapView.classList.contains('active')) {
              const iframe = document.getElementById('bookmarkMindMapFrame');
              if (iframe && iframe.src) {
                console.log('检测到书签变化，刷新书签导图数据');
                sendBookmarkDataToMindMap(iframe);
              }
            }
          }
        }
      });
      console.log('书签变化监听器已设置');
    } catch (error) {
      console.warn('无法监听存储变化:', error);
    }
  } else {
    console.warn('chrome.storage API 不可用，将使用页面可见性变化来更新');
  }

});

// ==================== API配置页面功能 ====================

/**
 * 初始化API配置页面
 */
function initApiSettings() {
  // 绑定"新建API"按钮事件
  const newApiBtn = document.getElementById('newApiBtn');
  if (newApiBtn) {
    newApiBtn.addEventListener('click', () => {
      openApiEditModal();
    });
  }

  // 绑定对话框关闭事件
  const modalCloseBtn = document.getElementById('apiEditModalClose');
  const modalCancelBtn = document.getElementById('apiEditCancelBtn');
  const modalOverlay = document.getElementById('apiEditModal');
  
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeApiEditModal);
  }
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeApiEditModal);
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeApiEditModal();
      }
    });
  }

  // 绑定保存按钮事件
  const modalSaveBtn = document.getElementById('apiEditSaveBtn');
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', async () => {
      await saveApiConfig();
    });
  }

  // 绑定连接测试按钮事件
  const modalTestBtn = document.getElementById('apiEditTestBtn');
  if (modalTestBtn) {
    modalTestBtn.addEventListener('click', async () => {
      await testApiConnection();
    });
  }

  // 绑定API类型选择变化事件，根据类型自动填充默认端点
  const apiProviderSelect = document.getElementById('apiProvider');
  if (apiProviderSelect) {
    apiProviderSelect.addEventListener('change', (e) => {
      updateApiDefaults(e.target.value);
    });
  }

  // 加载总开关状态
  loadGlobalApiEnabled();

  // 绑定总开关事件
  const globalEnabledCheckbox = document.getElementById('globalApiEnabled');
  if (globalEnabledCheckbox) {
    globalEnabledCheckbox.addEventListener('change', async (e) => {
      await handleGlobalToggleChange(e.target.checked);
    });
  }

  // 加载API列表
  loadApiList();

  // 绑定API列表的事件（使用事件委托）
  const apiListContainer = document.getElementById('apiListContainer');
  if (apiListContainer) {
    // 使用事件委托处理编辑按钮点击
    apiListContainer.addEventListener('click', async (e) => {
      if (e.target.classList.contains('api-item-edit')) {
        e.stopPropagation();
        const apiId = e.target.getAttribute('data-api-id');
        if (apiId) {
          await editApiConfig(apiId);
        }
      }
    });

    // 使用事件委托处理删除按钮点击
    apiListContainer.addEventListener('click', async (e) => {
      if (e.target.classList.contains('api-item-delete')) {
        e.stopPropagation();
        const apiId = e.target.getAttribute('data-api-id');
        if (apiId) {
          await deleteApiConfig(apiId);
        }
      }
    });

    // 使用事件委托处理API开关切换
    apiListContainer.addEventListener('change', async (e) => {
      if (e.target.classList.contains('api-item-toggle')) {
        e.stopPropagation();
        const apiId = e.target.getAttribute('data-api-id');
        const enabled = e.target.checked;
        if (apiId) {
          await handleApiToggleChange(apiId, enabled);
        }
      }
    });
  }
}

// 当前正在编辑的API ID（null表示新建模式）
let currentEditingApiId = null;

//打开API编辑对话框
async function openApiEditModal(apiId = null) {
  const modal = document.getElementById('apiEditModal');
  const modalTitle = document.getElementById('apiEditModalTitle');
  
  if (modal && modalTitle) {
    currentEditingApiId = apiId;
    
    if (apiId) {
      // 编辑模式
      modalTitle.textContent = '编辑API';
      await loadApiToForm(apiId);
    } else {
      // 新建模式
      modalTitle.textContent = '新建API';
      resetApiForm();
      // 设置默认值
      const apiProvider = document.getElementById('apiProvider');
      if (apiProvider) {
        updateApiDefaults(apiProvider.value);
      }
    }
    
    modal.style.display = 'flex';
  }
}

//编辑API配置
async function editApiConfig(apiId) {
  await openApiEditModal(apiId);
}

//加载API信息到表单（编辑模式）
async function loadApiToForm(apiId) {
  try {
    const allConfigs = await getAllApiConfigs();
    const api = allConfigs.apis.find(a => a.id === apiId);
    
    if (!api) {
      showNotification('未找到该API配置', 'error');
      closeApiEditModal();
      return;
    }

    // 解密API Key（如果已加密）
    let decryptedApiKey = '';
    if (api.apiKey) {
      if (api.apiKey.startsWith('ENCODED:')) {
        try {
          const encoded = api.apiKey.replace('ENCODED:', '');
          decryptedApiKey = decodeURIComponent(escape(atob(encoded)));
        } catch (e) {
          console.warn('API Key 解密失败:', e);
          // 如果解密失败，留空让用户重新输入
          decryptedApiKey = '';
        }
      } else {
        decryptedApiKey = api.apiKey;
      }
    }

    // 填充表单字段
    const nameInput = document.getElementById('apiName');
    const providerSelect = document.getElementById('apiProvider');
    const endpointInput = document.getElementById('apiEndpoint');
    const apiKeyInput = document.getElementById('apiKey');
    const modelInput = document.getElementById('apiModel');
    const temperatureInput = document.getElementById('apiTemperature');
    const maxTokensInput = document.getElementById('apiMaxTokens');
    const timeoutInput = document.getElementById('apiTimeout');

    if (nameInput) nameInput.value = api.name || '';
    if (providerSelect) {
      providerSelect.value = api.provider || 'custom';
      // 保存之前的值用于updateApiDefaults比较
      providerSelect.previousValue = api.provider || 'custom';
    }
    if (endpointInput) endpointInput.value = api.endpoint || '';
    if (apiKeyInput) apiKeyInput.value = decryptedApiKey; // 使用解密后的Key，如果解密失败则为空
    if (modelInput) modelInput.value = api.model || '';
    if (temperatureInput) temperatureInput.value = api.temperature !== undefined ? api.temperature : 0.7;
    if (maxTokensInput) maxTokensInput.value = api.maxTokens !== undefined ? api.maxTokens : 500;
    if (timeoutInput) timeoutInput.value = api.timeout !== undefined ? api.timeout : 30000;

    // 如果API Key已加密且解密失败，显示提示
    if (api.apiKey && api.apiKey.startsWith('ENCODED:') && !decryptedApiKey) {
      if (apiKeyInput) {
        apiKeyInput.placeholder = '请重新输入API Key（原密钥已加密，无法显示）';
        apiKeyInput.value = ''; // 确保值为空
      }
    }
  } catch (error) {
    console.error('加载API信息失败:', error);
    showNotification('加载API信息失败', 'error');
    closeApiEditModal();
  }
}

/**
 * 关闭API编辑对话框
 */
function closeApiEditModal() {
  const modal = document.getElementById('apiEditModal');
  if (modal) {
    modal.style.display = 'none';
    // 重置表单
    resetApiForm();
    // 清空当前编辑的API ID
    currentEditingApiId = null;
  }
}

/**
 * 重置API表单
 */
function resetApiForm() {
  const form = document.getElementById('apiEditForm');
  if (form) {
    form.reset();
    // 设置默认值
    const temperature = document.getElementById('apiTemperature');
    const maxTokens = document.getElementById('apiMaxTokens');
    const timeout = document.getElementById('apiTimeout');
    const apiKeyInput = document.getElementById('apiKey');
    
    if (temperature) temperature.value = '0.7';
    if (maxTokens) maxTokens.value = '500';
    if (timeout) timeout.value = '30000';
    if (apiKeyInput) apiKeyInput.placeholder = '您的API密钥'; // 重置placeholder
  }
  
  // 清空当前编辑的API ID
  currentEditingApiId = null;
}

/**
 * 根据API类型更新默认值
 */
function updateApiDefaults(provider) {
  const endpointInput = document.getElementById('apiEndpoint');
  const modelInput = document.getElementById('apiModel');
  
  if (!endpointInput || !modelInput) return;

  const defaults = {
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-3.5-turbo'
    },
    claude: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-sonnet-20240229'
    },
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat'
    },
    custom: {
      endpoint: '',
      model: ''
    }
  };

  const defaultValues = defaults[provider] || defaults.custom;
  
  if (endpointInput.value === '' || endpointInput.value === defaults[document.getElementById('apiProvider')?.previousValue || 'custom']?.endpoint) {
    endpointInput.value = defaultValues.endpoint;
  }
  
  if (modelInput.value === '' || modelInput.value === defaults[document.getElementById('apiProvider')?.previousValue || 'custom']?.model) {
    modelInput.value = defaultValues.model;
  }
  
  // 保存当前选择的值，用于下次比较
  if (document.getElementById('apiProvider')) {
    document.getElementById('apiProvider').previousValue = provider;
  }
}

// ==================== API配置存储功能 ====================

/**
 * 生成唯一ID
 */
function generateApiId() {
  return 'api_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 加密API Key（Base64编码）
 */
function encryptApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.startsWith('ENCODED:')) {
    return apiKey; // 已经加密
  }
  try {
    const encoded = btoa(unescape(encodeURIComponent(apiKey)));
    return 'ENCODED:' + encoded;
  } catch (error) {
    console.warn('API Key 加密失败:', error);
    return apiKey;
  }
}

/**
 * 验证API配置表单
 * @param {boolean} isEditMode - 是否为编辑模式
 */
function validateApiForm(isEditMode = false) {
  const name = document.getElementById('apiName')?.value.trim();
  const provider = document.getElementById('apiProvider')?.value;
  const endpoint = document.getElementById('apiEndpoint')?.value.trim();
  const apiKey = document.getElementById('apiKey')?.value.trim();
  const model = document.getElementById('apiModel')?.value.trim();
  const temperature = parseFloat(document.getElementById('apiTemperature')?.value);
  const maxTokens = parseInt(document.getElementById('apiMaxTokens')?.value);
  const timeout = parseInt(document.getElementById('apiTimeout')?.value);

  const errors = [];

  // 验证必填字段
  if (!endpoint) {
    errors.push('API端点是必填项');
  } else {
    try {
      const url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('API端点必须是 http 或 https 协议');
      }
    } catch (e) {
      errors.push('API端点格式不正确（应为有效的URL）');
    }
  }

  // API Key验证：编辑模式下可以为空（保留原值），新建模式下必须填写
  if (!isEditMode && !apiKey) {
    errors.push('API Key是必填项');
  }

  // 验证温度
  if (isNaN(temperature) || temperature < 0 || temperature > 2) {
    errors.push('温度必须在 0-2 之间');
  }

  // 验证最大Token数
  if (isNaN(maxTokens) || maxTokens < 1 || maxTokens > 4000) {
    errors.push('最大Token数必须在 1-4000 之间');
  }

  // 验证超时时间
  if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
    errors.push('超时时间必须在 1000-120000 毫秒之间');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    data: {
      name: name || '',
      provider: provider || 'custom',
      endpoint: endpoint,
      apiKey: apiKey,
      model: model || '',
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 500,
      timeout: timeout || 30000
    }
  };
}

/**
 * 获取所有API配置
 */
async function getAllApiConfigs() {
  try {
    const result = await chrome.storage.local.get('aiApiConfigV2');
    if (result.aiApiConfigV2) {
      return result.aiApiConfigV2;
    }
    // 如果没有配置，返回默认结构
    return {
      enabled: false,
      apis: []
    };
  } catch (error) {
    console.error('获取API配置失败:', error);
    return {
      enabled: false,
      apis: []
    };
  }
}

/**
 * 保存所有API配置
 */
async function saveAllApiConfigs(configs) {
  try {
    await chrome.storage.local.set({
      aiApiConfigV2: configs
    });
    console.log('API配置已保存，共', configs.apis.length, '个API');
    return true;
  } catch (error) {
    console.error('保存API配置失败:', error);
    throw error;
  }
}

/**
 * 保存API配置（从表单）
 */
async function saveApiConfig() {
  try {
    const isEditMode = !!currentEditingApiId;
    
    // 验证表单（编辑模式下API Key可以为空）
    const validation = validateApiForm(isEditMode);
    
    if (!validation.valid) {
      alert('表单验证失败：\n' + validation.errors.join('\n'));
      return;
    }

    // 获取表单数据
    const formData = validation.data;

    // 获取所有API配置
    const allConfigs = await getAllApiConfigs();

    if (currentEditingApiId) {
      // 编辑模式：更新现有API
      const apiIndex = allConfigs.apis.findIndex(a => a.id === currentEditingApiId);
      if (apiIndex === -1) {
        throw new Error('未找到要编辑的API配置');
      }

      const existingApi = allConfigs.apis[apiIndex];

      // 更新API配置
      // 如果API Key有输入新值，则加密保存；如果为空，则保持原值
      let apiKeyToSave = existingApi.apiKey; // 默认保持原值
      if (formData.apiKey && formData.apiKey.trim() !== '') {
        // 用户输入了新的API Key，需要加密
        apiKeyToSave = encryptApiKey(formData.apiKey);
      }

      allConfigs.apis[apiIndex] = {
        ...existingApi, // 保留原有属性（如id、enabled）
        name: formData.name || existingApi.name || (formData.provider === 'openai' ? 'OpenAI' : 
                                                     formData.provider === 'claude' ? 'Anthropic Claude' : 
                                                     formData.provider === 'deepseek' ? 'DeepSeek' : '自定义API'),
        provider: formData.provider,
        endpoint: formData.endpoint,
        apiKey: apiKeyToSave,
        model: formData.model,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
        timeout: formData.timeout
      };

      // 保存配置
      await saveAllApiConfigs(allConfigs);

      // 显示成功提示
      showNotification('API配置已更新', 'success');
    } else {
      // 新建模式：创建新API
      const newApi = {
        id: generateApiId(),
        name: formData.name || (formData.provider === 'openai' ? 'OpenAI' : 
                                formData.provider === 'claude' ? 'Anthropic Claude' : 
                                formData.provider === 'deepseek' ? 'DeepSeek' : '自定义API'),
        provider: formData.provider,
        endpoint: formData.endpoint,
        apiKey: encryptApiKey(formData.apiKey), // 加密API Key
        model: formData.model,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
        timeout: formData.timeout,
        enabled: false // 新建的API默认禁用
      };

      // 添加到API列表
      allConfigs.apis.push(newApi);

      // 保存配置
      await saveAllApiConfigs(allConfigs);

      // 显示成功提示
      showNotification('API配置已保存', 'success');
    }

    // 关闭对话框
    closeApiEditModal();

    // 刷新API列表
    await loadApiList();
  } catch (error) {
    console.error('保存API配置失败:', error);
    alert('保存失败：' + (error.message || '未知错误'));
  }
}

/**
 * 加载并显示API列表
 */
async function loadApiList() {
  const apiListContainer = document.getElementById('apiListContainer');
  if (!apiListContainer) return;

  try {
    // 显示加载状态
    apiListContainer.innerHTML = `
      <tr>
        <td colspan="6" class="api-table-empty">
          <div class="loading">
            <div class="loading-spinner"></div>
            <div>正在加载...</div>
          </div>
        </td>
      </tr>
    `;

    // 获取所有API配置
    const allConfigs = await getAllApiConfigs();
    const apis = Array.isArray(allConfigs?.apis) ? allConfigs.apis : [];
    const globalEnabled = allConfigs?.enabled || false;

    // 渲染API列表
    renderApiList(apis, globalEnabled);
  } catch (error) {
    console.error('加载API列表失败:', error);
    apiListContainer.innerHTML = `
      <tr>
        <td colspan="6" class="api-table-empty">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">加载失败：${escapeHtml(error.message)}</div>
        </td>
      </tr>
    `;
  }
}

/**
 * 渲染API列表
 * @param {Array} apis - API配置数组
 * @param {boolean} globalEnabled - 全局开关状态
 */
function renderApiList(apis, globalEnabled = false) {
  const apiListContainer = document.getElementById('apiListContainer');
  if (!apiListContainer) return;

  if (apis.length === 0) {
    apiListContainer.innerHTML = `
      <tr>
        <td colspan="6" class="api-table-empty">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">暂无API配置</div>
          <div class="empty-state-hint">点击"新建API"添加第一个API配置</div>
        </td>
      </tr>
    `;
    return;
  }

  // 获取提供商名称的辅助函数
  const getProviderName = (provider) => {
    const providerNames = {
      openai: 'OpenAI',
      claude: 'Anthropic Claude',
      deepseek: 'DeepSeek',
      custom: '自定义API'
    };
    return providerNames[provider] || provider || '自定义';
  };

  // 截断过长文本的辅助函数
  const truncateText = (text, maxLength) => {
    if (!text) return '未设置';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  // 获取状态文本和样式类
  const getStatusInfo = (apiEnabled) => {
    if (!globalEnabled) {
      // 总开关关闭时，统一显示"全局停用"
      return {
        text: '全局停用',
        class: 'disabled'
      };
    } else if (globalEnabled && apiEnabled) {
      // 总开关开启 + API开启 = 启用中
      return {
        text: '启用中',
        class: 'enabled'
      };
    } else {
      // 总开关开启 + API关闭 = 已禁用
      return {
        text: '已禁用',
        class: 'disabled'
      };
    }
  };

  // 生成表格行HTML
  const tableRowsHtml = apis.map(api => {
    const providerName = getProviderName(api.provider);
    const endpointDisplay = truncateText(api.endpoint, 40);
    const modelDisplay = api.model || '未设置';
    const statusInfo = getStatusInfo(api.enabled);
    const statusText = statusInfo.text;
    const statusClass = statusInfo.class;

    // 总开关关闭时，所有API开关都显示为关闭且禁用
    // 总开关开启时，根据api.enabled显示状态
    const apiSwitchChecked = globalEnabled && api.enabled;
    const apiSwitchDisabled = !globalEnabled;

    return `
      <tr class="api-table-row" data-api-id="${escapeHtml(api.id)}">
        <td class="api-table-name">${escapeHtml(api.name || '未命名')}</td>
        <td class="api-table-provider">${escapeHtml(providerName)}</td>
        <td class="api-table-endpoint" title="${escapeHtml(api.endpoint || '')}">${escapeHtml(endpointDisplay)}</td>
        <td class="api-table-model">${escapeHtml(modelDisplay)}</td>
        <td class="api-table-status">
          <span class="api-status-badge ${statusClass}">${statusText}</span>
        </td>
        <td class="api-table-actions">
          <label class="switch">
            <input type="checkbox" class="api-item-toggle" data-api-id="${escapeHtml(api.id)}" ${apiSwitchChecked ? 'checked' : ''} ${apiSwitchDisabled ? 'disabled' : ''}>
            <span class="slider"></span>
          </label>
          <button type="button" class="btn btn-link api-item-edit" data-api-id="${escapeHtml(api.id)}">编辑</button>
          <button type="button" class="btn btn-link api-item-delete" data-api-id="${escapeHtml(api.id)}">删除</button>
        </td>
      </tr>
    `;
  }).join('');

  apiListContainer.innerHTML = tableRowsHtml;
}

/**
 * 加载总开关状态
 */
async function loadGlobalApiEnabled() {
  try {
    const allConfigs = await getAllApiConfigs();
    const enabled = allConfigs?.enabled || false;
    
    const globalEnabledCheckbox = document.getElementById('globalApiEnabled');
    if (globalEnabledCheckbox) {
      globalEnabledCheckbox.checked = enabled;
    }
  } catch (error) {
    console.error('加载总开关状态失败:', error);
  }
}

/**
 * 保存总开关状态
 */
async function saveGlobalApiEnabled(enabled) {
  try {
    const allConfigs = await getAllApiConfigs();
    allConfigs.enabled = enabled;
    await saveAllApiConfigs(allConfigs);
    console.log('总开关状态已保存:', enabled);
  } catch (error) {
    console.error('保存总开关状态失败:', error);
    throw error;
  }
}

/**
 * 处理总开关状态变化
 */
async function handleGlobalToggleChange(enabled) {
  try {
    // 保存总开关状态
    await saveGlobalApiEnabled(enabled);

    if (!enabled) {
      // 总开关关闭时，关闭所有API开关
      const allConfigs = await getAllApiConfigs();
      allConfigs.apis.forEach(api => {
        api.enabled = false;
      });
      await saveAllApiConfigs(allConfigs);
    }

    // 刷新API列表以更新状态显示和开关状态
    await loadApiList();

    showNotification(
      enabled ? '智能标签功能已启用' : '智能标签功能已禁用',
      'success'
    );
  } catch (error) {
    console.error('处理总开关变化失败:', error);
    // 恢复原来的状态
    const globalEnabledCheckbox = document.getElementById('globalApiEnabled');
    if (globalEnabledCheckbox) {
      globalEnabledCheckbox.checked = !enabled;
    }
    showNotification('操作失败，请重试', 'error');
  }
}

/**
 * 处理API开关状态变化
 */
async function handleApiToggleChange(apiId, enabled) {
  try {
    // 总开关必须开启才能操作API开关
    const allConfigs = await getAllApiConfigs();
    if (!allConfigs.enabled) {
      // 如果总开关关闭，恢复开关状态
      const toggle = document.querySelector(`.api-item-toggle[data-api-id="${apiId}"]`);
      if (toggle) {
        toggle.checked = false;
      }
      return;
    }

    if (enabled) {
      // 开启一个API时，关闭其他所有API（互斥逻辑）
      allConfigs.apis.forEach(api => {
        api.enabled = (api.id === apiId);
      });
    } else {
      // 关闭当前API
      const api = allConfigs.apis.find(a => a.id === apiId);
      if (api) {
        api.enabled = false;
      }
    }

    // 保存更新后的配置
    await saveAllApiConfigs(allConfigs);

    // 刷新API列表以更新状态显示
    await loadApiList();

    if (enabled) {
      showNotification('API已启用', 'success');
    } else {
      showNotification('API已禁用', 'success');
    }
  } catch (error) {
    console.error('处理API开关变化失败:', error);
    // 恢复原来的状态
    const toggle = document.querySelector(`.api-item-toggle[data-api-id="${apiId}"]`);
    if (toggle) {
      toggle.checked = !enabled;
    }
    showNotification('操作失败，请重试', 'error');
  }
}

/**
 * 测试API连接
 */
async function testApiConnection() {
  const testResultEl = document.getElementById('apiTestResult');
  const testBtn = document.getElementById('apiEditTestBtn');
  
  if (!testResultEl || !testBtn) return;

  // 获取表单数据
  const endpoint = document.getElementById('apiEndpoint')?.value.trim();
  const apiKey = document.getElementById('apiKey')?.value.trim();
  const provider = document.getElementById('apiProvider')?.value;
  const model = document.getElementById('apiModel')?.value.trim();
  const timeout = parseInt(document.getElementById('apiTimeout')?.value) || 30000;

  // 验证必填字段
  if (!endpoint) {
    showTestResult('error', '请先填写API端点');
    return;
  }

  if (!apiKey) {
    showTestResult('error', '请先填写API Key');
    return;
  }

  // 显示测试中状态
  testBtn.disabled = true;
  testBtn.textContent = '测试中...';
  showTestResult('testing', '正在测试连接...');

  try {
    // 根据API类型构建测试请求
    const testRequest = buildTestRequest(provider, endpoint, apiKey, model);
    
    // 发送测试请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: testRequest.headers,
      body: JSON.stringify(testRequest.body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API返回错误 (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    
    // 检查响应格式
    if (data.error) {
      throw new Error(data.error.message || 'API返回错误');
    }

    // 测试成功
    showTestResult('success', '连接测试成功！API配置正确。');
    
  } catch (error) {
    let errorMessage = '连接测试失败：';
    
    if (error.name === 'AbortError') {
      errorMessage += '请求超时，请检查网络连接或增加超时时间。';
    } else if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += '未知错误，请检查API配置是否正确。';
    }
    
    showTestResult('error', errorMessage);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '连接测试';
  }
}

//构建测试请求
function buildTestRequest(provider, endpoint, apiKey, model) {
  const defaultModel = model || getDefaultModel(provider);
  
  switch (provider) {
    case 'openai':
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: defaultModel,
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ],
          max_tokens: 10
        }
      };
    
    case 'claude':
      return {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: {
          model: defaultModel,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ]
        }
      };
    
    case 'deepseek':
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: defaultModel,
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ],
          max_tokens: 10
        }
      };
    
    default: // custom
      // 对于自定义API，使用通用格式
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: defaultModel,
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ],
          max_tokens: 10
        }
      };
  }
}

//获取默认模型名称
function getDefaultModel(provider) {
  const defaultModels = {
    openai: 'gpt-3.5-turbo',
    claude: 'claude-3-haiku-20240307',
    deepseek: 'deepseek-chat',
    custom: 'default'
  };
  return defaultModels[provider] || 'default';
}

//显示测试结果
function showTestResult(type, message) {
  const testResultEl = document.getElementById('apiTestResult');
  if (!testResultEl) return;

  testResultEl.style.display = 'block';
  testResultEl.className = `api-test-result api-test-result-${type}`;
  testResultEl.textContent = message;

  // 如果是成功或错误，3秒后自动隐藏
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      if (testResultEl.textContent === message) {
        testResultEl.style.display = 'none';
      }
    }, 5000);
  }
}

//删除API配置
async function deleteApiConfig(apiId) {
  try {
    // 获取API信息用于确认对话框
    const allConfigs = await getAllApiConfigs();
    const api = allConfigs.apis.find(a => a.id === apiId);
    
    if (!api) {
      showNotification('未找到该API配置', 'error');
      return;
    }

    // 显示确认对话框
    const apiName = api.name || '未命名';
    const confirmMessage = `确定要删除API配置 "${apiName}" 吗？\n\n此操作无法撤销。`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    // 从列表中删除
    allConfigs.apis = allConfigs.apis.filter(a => a.id !== apiId);

    // 保存更新后的配置
    await saveAllApiConfigs(allConfigs);

    // 显示成功提示
    showNotification('API配置已删除', 'success');

    // 刷新API列表
    await loadApiList();
  } catch (error) {
    console.error('删除API配置失败:', error);
    showNotification('删除失败：' + (error.message || '未知错误'), 'error');
  }
}

// ==================== 书签导图页面功能 ====================

//获取书签数据供思维导图使用
async function getBookmarkDataForMindMap() {
  try {
    // 获取书签树结构
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 获取标签数据
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    
    // 返回原始数据，数据转换将在后续步骤中处理
    return {
      bookmarkTree: bookmarkTree,
      bookmarkTags: bookmarkTags
    };
  } catch (error) {
    console.error('获取书签数据失败:', error);
    throw error;
  }
}

//将书签树转换为思维导图数据格式
function convertBookmarksToMindMapData(bookmarkTree, bookmarkTags = {}) {
  if (!bookmarkTree || bookmarkTree.length === 0) {
    // 返回空数据
    return {
      root: {
        data: {
          text: '书签'
        },
        children: []
      },
      theme: {
        template: 'classic4',
        config: {}
      },
      layout: 'logicalStructure',
      config: {},
      view: null
    };
  }

  // 获取根节点（通常是第一个节点，id 为 '0'）
  const rootBookmarkNode = bookmarkTree[0];
  
  /**
   * 递归转换节点
   * @param {Object} node - 书签节点
   * @returns {Object} 思维导图节点
   */
  function convertNode(node) {
    const nodeData = {
      data: {
        text: node.title || '未命名'
      },
      children: []
    };

    // 如果是书签（有 url），可以在文本中添加 URL 信息
    if (node.url) {
      // 书签节点：显示标题，可以附加 URL
      try {
        const urlObj = new URL(node.url);
        const domain = urlObj.hostname.replace('www.', '');
        // 可以在文本中显示域名，或者使用富文本
        nodeData.data.text = `${node.title || '未命名'} (${domain})`;
        // 保存原始 URL 到扩展数据中（如果需要）
        nodeData.data.url = node.url;
        nodeData.data.bookmarkId = node.id;
      } catch (e) {
        nodeData.data.text = node.title || '未命名';
        nodeData.data.url = node.url;
        nodeData.data.bookmarkId = node.id;
      }
      
      // 如果有标签，可以在文本中显示
      const tags = bookmarkTags[node.id] || [];
      if (tags.length > 0) {
        nodeData.data.text += ` [${tags.join(', ')}]`;
      }
    } else {
      // 文件夹节点：只显示文件夹名称
      nodeData.data.text = node.title || '未命名文件夹';
      nodeData.data.folderId = node.id;
    }

    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childNode = convertNode(child);
        if (childNode) {
          nodeData.children.push(childNode);
        }
      });
    }

    return nodeData;
  }

  // 转换根节点
  const rootNode = convertNode(rootBookmarkNode);

  // 返回思维导图数据格式
  return {
    root: rootNode,
    theme: {
      template: 'classic4',
      config: {}
    },
    layout: 'logicalStructure',
    config: {},
    view: null
  };
}

/**
 * 初始化书签导图 iframe
 */
function initBookmarkMindMapFrame() {
  const iframe = document.getElementById('bookmarkMindMapFrame');
  const loadingEl = document.getElementById('mindmapLoading');
  
  if (!iframe) {
    console.error('未找到书签导图 iframe 元素');
    return;
  }

  // 监听来自 iframe 的消息（反向通信）
  setupMindMapMessageListener();

  // 设置响应式处理（窗口大小变化）
  setupMindMapResizeHandler(iframe);

  // 如果 iframe 已经有 src，说明已经加载过（页面切换回来）
  if (iframe.src) {
    console.log('书签导图页面已加载，检查是否需要刷新数据');
    
    // 检查是否需要刷新数据
    checkAndUpdateBookmarkMapData(iframe);
    return;
  }

  // 显示加载提示
  if (loadingEl) {
    loadingEl.style.display = 'flex';
  }
  if (iframe) {
    iframe.style.display = 'none';
  }

  // 使用 chrome.runtime.getURL() 获取正确的扩展 URL
  try {
    const mindMapUrl = chrome.runtime.getURL('mind-map-main/index.html');
    iframe.src = mindMapUrl;
    console.log('书签导图 iframe src 已设置:', mindMapUrl);

    // 监听 iframe 加载完成事件
    iframe.addEventListener('load', () => {
      console.log('书签导图 iframe 加载完成');
      
      // 验证资源路径（可选，用于调试）
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // 检查 iframe 内的资源路径
          const scripts = iframeDoc.querySelectorAll('script[src]');
          const links = iframeDoc.querySelectorAll('link[href]');
          console.log('iframe 内脚本数量:', scripts.length);
          console.log('iframe 内样式数量:', links.length);
          
          // 检查 externalPublicPath 设置
          const iframeWindow = iframe.contentWindow;
          if (iframeWindow && iframeWindow.externalPublicPath) {
            console.log('iframe externalPublicPath:', iframeWindow.externalPublicPath);
          }
        }
      } catch (e) {
        // 跨域限制，无法访问 iframe 内容（这是正常的）
        console.log('无法访问 iframe 内容（跨域限制，这是正常的）');
      }
      
      // 数据发送将在收到 MINDMAP_READY 消息时触发
      // 这里只隐藏加载提示，显示 iframe
      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
      if (iframe) {
        iframe.style.display = 'block';
      }
    });

    // 监听 iframe 加载错误
    iframe.addEventListener('error', () => {
      console.error('书签导图 iframe 加载失败');
      if (loadingEl) {
        loadingEl.innerHTML = `
          <div style="text-align: center; color: #dc3545;">
            <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
            <div>思维导图加载失败</div>
            <div style="font-size: 12px; margin-top: 8px; color: #999;">请刷新页面重试</div>
          </div>
        `;
      }
    });
  } catch (error) {
    console.error('设置书签导图 iframe src 失败:', error);
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="text-align: center; color: #dc3545;">
          <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
          <div>初始化失败: ${error.message}</div>
        </div>
      `;
    }
  }
}

/**
 * 设置思维导图消息监听器（反向通信）
 */
function setupMindMapMessageListener() {
  // 只设置一次监听器
  if (window.mindMapMessageListenerSetup) {
    return;
  }
  window.mindMapMessageListenerSetup = true;

  window.addEventListener('message', (event) => {
    // 验证消息来源（应该是 iframe 的 origin）
    // 在扩展环境中，iframe 的 origin 可能是 chrome-extension://[扩展ID]
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
    
    // 验证消息类型
    if (!event.data || typeof event.data !== 'object') {
      return;
    }

    const { type, data } = event.data;

    switch (type) {
      case 'OPEN_BOOKMARK':
        // 打开书签链接
        if (data && data.url) {
          openBookmark(data.url);
          console.log('打开书签:', data.url);
        }
        break;
      
      case 'MINDMAP_READY':
        // 思维导图已准备好接收数据
        console.log('思维导图已准备好，发送书签数据');
        const iframe = document.getElementById('bookmarkMindMapFrame');
        const loadingEl = document.getElementById('mindmapLoading');
        
        // 隐藏加载提示，显示 iframe
        if (loadingEl) {
          loadingEl.style.display = 'none';
        }
        if (iframe) {
          iframe.style.display = 'block';
        }
        
        // 发送书签数据
        if (iframe) {
          sendBookmarkDataToMindMap(iframe);
        }
        break;
      
      default:
        // 忽略其他类型的消息
        break;
    }
  });
}

/**
 * 检查并更新书签导图数据（页面切换回来时调用）
 * @param {HTMLIFrameElement} iframe - iframe 元素
 */
async function checkAndUpdateBookmarkMapData(iframe) {
  try {
    // 检查书签数据是否有更新
    // 可以通过监听书签变化事件来更新 bookmarkMapLastUpdateTime
    // 这里简化处理：如果距离上次发送超过一定时间，或者书签数据有变化，则刷新
    
    const shouldRefresh = shouldRefreshBookmarkMapData();
    
    if (shouldRefresh) {
      console.log('检测到书签数据变化，刷新思维导图');
      sendBookmarkDataToMindMap(iframe);
    } else {
      console.log('书签数据未变化，保持当前状态');
      // 不刷新数据，保持 iframe 的当前状态（包括用户的视图位置、缩放等）
    }
  } catch (error) {
    console.error('检查书签数据更新失败:', error);
    // 出错时也尝试刷新，确保数据是最新的
    sendBookmarkDataToMindMap(iframe);
  }
}

/**
 * 判断是否需要刷新书签导图数据
 * @returns {boolean} 是否需要刷新
 */
function shouldRefreshBookmarkMapData() {
  // 方案1：如果从未发送过数据，需要刷新
  if (!bookmarkMapDataTimestamp) {
    return true;
  }
  
  // 方案2：如果书签数据有更新（通过 bookmarkMapLastUpdateTime 判断）
  if (bookmarkMapLastUpdateTime && bookmarkMapDataTimestamp < bookmarkMapLastUpdateTime) {
    return true;
  }
  
  // 方案3：如果距离上次发送超过一定时间（例如5分钟），也刷新
  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟
  if (Date.now() - bookmarkMapDataTimestamp > REFRESH_INTERVAL) {
    return true;
  }
  
  return false;
}

/**
 * 发送书签数据到思维导图 iframe
 * @param {HTMLIFrameElement} iframe - iframe 元素
 * @param {number} retryCount - 重试次数（内部使用）
 */
async function sendBookmarkDataToMindMap(iframe, retryCount = 0) {
  const MAX_RETRY = 3;
  const RETRY_DELAY = 500;

  try {
    // 检查 iframe 是否已加载
    if (!iframe || !iframe.contentWindow) {
      if (retryCount < MAX_RETRY) {
        console.warn(`iframe contentWindow 不可用，${RETRY_DELAY}ms 后重试 (${retryCount + 1}/${MAX_RETRY})`);
        setTimeout(() => sendBookmarkDataToMindMap(iframe, retryCount + 1), RETRY_DELAY);
      } else {
        console.error('iframe contentWindow 不可用，已达到最大重试次数');
      }
      return;
    }

    // 方案B：父页面准备好数据后，等待 iframe 加载完成再发送
    // 1. 先获取书签数据（父页面准备数据）
    console.log('开始获取书签数据...');
    const { bookmarkTree, bookmarkTags } = await getBookmarkDataForMindMap();
    
    // 2. 转换为思维导图格式
    console.log('转换书签数据为思维导图格式...');
    const mindMapData = convertBookmarksToMindMapData(bookmarkTree, bookmarkTags);
    
    // 3. 获取扩展的 origin
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1); // 移除末尾的 '/'
    
    // 4. 准备消息数据
    const messageData = {
      type: 'BOOKMARK_DATA',
      data: {
        mindMapData: mindMapData,
        mindMapConfig: {},
        lang: 'zh',
        localConfig: null
      }
    };
    
    // 5. 确保 iframe 已加载完成后再发送
    // 检查 iframe 的 readyState（如果可用）
    if (iframe.contentDocument && iframe.contentDocument.readyState !== 'complete') {
      if (retryCount < MAX_RETRY) {
        console.warn(`iframe 文档未完全加载，${RETRY_DELAY}ms 后重试 (${retryCount + 1}/${MAX_RETRY})`);
        setTimeout(() => sendBookmarkDataToMindMap(iframe, retryCount + 1), RETRY_DELAY);
        return;
      }
    }
    
    // 6. 发送消息到 iframe
    iframe.contentWindow.postMessage(messageData, extensionOrigin);
    
    // 更新发送时间戳
    bookmarkMapDataTimestamp = Date.now();
    
    console.log('已发送书签数据到思维导图，节点数量:', 
      mindMapData.root ? (countNodes(mindMapData.root) || 0) : 0);
    
  } catch (error) {
    console.error('发送书签数据到思维导图失败:', error);
    if (retryCount < MAX_RETRY) {
      console.warn(`${RETRY_DELAY}ms 后重试 (${retryCount + 1}/${MAX_RETRY})`);
      setTimeout(() => sendBookmarkDataToMindMap(iframe, retryCount + 1), RETRY_DELAY);
    }
  }
}

/**
 * 递归计算节点数量（用于日志）
 * @param {Object} node - 思维导图节点
 * @returns {number} 节点数量
 */
function countNodes(node) {
  if (!node) return 0;
  let count = 1; // 当前节点
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => {
      count += countNodes(child);
    });
  }
  return count;
}

/**
 * 设置思维导图响应式处理（窗口大小变化）
 * @param {HTMLIFrameElement} iframe - iframe 元素
 */
function setupMindMapResizeHandler(iframe) {
  // 使用防抖函数，避免频繁触发
  let resizeTimer = null;
  const RESIZE_DELAY = 300; // 300ms 防抖延迟

  function handleResize() {
    // 清除之前的定时器
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    // 延迟执行，避免频繁触发
    resizeTimer = setTimeout(() => {
      // iframe 使用 CSS 百分比自适应，会自动调整尺寸
      // 但需要通知 iframe 内的思维导图应用调整尺寸（如果应用支持）
      try {
        if (iframe && iframe.contentWindow) {
          // 发送窗口大小变化消息给 iframe（如果应用支持）
          const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
          iframe.contentWindow.postMessage({
            type: 'WINDOW_RESIZE',
            data: {
              width: iframe.offsetWidth,
              height: iframe.offsetHeight
            }
          }, extensionOrigin);
        }
      } catch (error) {
        // 跨域限制或其他错误，忽略
        console.debug('无法发送窗口大小变化消息:', error);
      }
    }, RESIZE_DELAY);
  }

  // 监听窗口大小变化
  window.addEventListener('resize', handleResize);

  // 保存清理函数，以便在需要时移除监听器
  if (!window.mindMapResizeHandlers) {
    window.mindMapResizeHandlers = [];
  }
  window.mindMapResizeHandlers.push({
    iframe: iframe,
    handler: handleResize,
    cleanup: () => {
      window.removeEventListener('resize', handleResize);
    }
  });
}
