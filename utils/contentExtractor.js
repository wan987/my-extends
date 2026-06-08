 /**
 * 内容提取工具
 * 用于从网页中提取主要内容，包括标题、描述、文本内容等
 */

//提取页面内容
function extractPageContent() {
  try {
    const result = {
      title: extractTitle(),
      description: extractDescription(),
      keywords: extractKeywords(),
      headings: extractHeadings(),
      mainContent: extractMainContent(),
      url: window.location.href,
      domain: window.location.hostname
    };

    return result;
  } catch (error) {
    console.error('提取页面内容失败:', error);
    // 返回基本信息的降级方案
    return {
      title: document.title || '',
      description: '',
      keywords: '',
      headings: [],
      mainContent: '',
      url: window.location.href,
      domain: window.location.hostname
    };
  }
}

//提取页面标题
function extractTitle() {
  // 优先使用 og:title，然后是 document.title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && ogTitle.content) {
    return ogTitle.content.trim();
  }
  
  return document.title || '';
}

//提取页面描述
function extractDescription() {
  // 尝试多种方式获取描述
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && metaDescription.content) {
    return metaDescription.content.trim();
  }
  
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription && ogDescription.content) {
    return ogDescription.content.trim();
  }
  
  return '';
}

//提取关键词
function extractKeywords() {
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords && metaKeywords.content) {
    return metaKeywords.content.trim();
            }
  
  return '';
}

//提取标题层级
function extractHeadings() {
  const headings = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headingElements.forEach(heading => {
    // 跳过隐藏元素
    if (isElementVisible(heading)) {
      const text = heading.textContent.trim();
      if (text && text.length > 0) {
        headings.push(text);
      }
    }
  });
  
  return headings;
}

//提取主要内容
function extractMainContent() {
  // 优先查找常见的内容容器
  const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '.post',
      '.article',
      '.entry-content',
      '#content',
    '#main-content'
  ];
  
  let contentElement = null;
  
  for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && isElementVisible(element)) {
      contentElement = element;
      break;
      }
    }

  // 如果没找到，使用body（但排除导航、页脚等）
  if (!contentElement) {
    contentElement = document.body;
  }
  
  // 提取可见文本内容
  return extractVisibleText(contentElement);
}

//提取元素的可见文本内容
function extractVisibleText(element) {
  if (!element) return '';
  
  // 克隆元素以避免修改原始DOM
  const clone = element.cloneNode(true);

  // 移除脚本、样式等无关元素
  const elementsToRemove = clone.querySelectorAll('script, style, noscript, iframe, embed, object, svg, canvas');
  elementsToRemove.forEach(el => el.remove());
  
  // 移除隐藏元素
  const allElements = clone.querySelectorAll('*');
  allElements.forEach(el => {
    if (!isElementVisible(el)) {
      el.remove();
    }
  });
  
  // 移除导航、页脚、侧边栏等常见非内容区域
  const nonContentSelectors = [
      'nav',
      'header',
      'footer',
      'aside',
    '.nav',
      '.navigation',
    '.header',
    '.footer',
    '.sidebar',
      '.menu',
      '.ad',
      '.advertisement',
    '.ads',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]'
    ];

  nonContentSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
  });
  
  // 提取文本内容
  let text = clone.textContent || clone.innerText || '';

  // 清理文本：去除多余空白字符
  text = text
    .replace(/\s+/g, ' ')  // 多个空白字符替换为单个空格
    .replace(/\n\s*\n/g, '\n')  // 多个换行替换为单个换行
    .trim();

  return text;
}

//检查元素是否可见
function isElementVisible(element) {
  if (!element) return false;
  
  // 检查display样式
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
}

  // 检查hidden属性
  if (element.hasAttribute('hidden')) {
    return false;
}

  // 检查是否在视口外（可选，可能影响性能）
  // 这里暂时不检查，因为有些内容可能在视口外但仍然是有用的内容
  
  return true;
}

// 如果在浏览器环境中，将函数导出到全局
if (typeof window !== 'undefined') {
  window.extractPageContent = extractPageContent;
}
