/**
 * 内容清洗工具
 * 用于清洗和优化从网页提取的内容，准备发送给AI API
 */


//清洗内容

function cleanContent(pageContent, options = {}) {
  const {
    maxLength = 4000,
    minLength = 100
  } = options;
  
  try {
    // 清洗标题
    const cleanedTitle = cleanText(pageContent.title || '');

    // 清洗描述
    const cleanedDescription = cleanText(pageContent.description || '');

    // 清洗关键词
    const cleanedKeywords = cleanKeywords(pageContent.keywords || '');

    // 清洗标题层级
    const cleanedHeadings = cleanHeadings(pageContent.headings || []);

    // 清洗主要内容
    const cleanedMainContent = cleanMainContent(pageContent.mainContent || '', {
      maxLength,
      minLength,
      title: cleanedTitle,
      description: cleanedDescription,
      headings: cleanedHeadings
    });

    // 构建结构化内容对象
    const cleanedContent = {
      title: cleanedTitle,
      description: cleanedDescription,
      keywords: cleanedKeywords,
      headings: cleanedHeadings,
      content: cleanedMainContent,
      url: pageContent.url || '',
      domain: pageContent.domain || '',
      // 生成用于AI的完整文本
      fullText: buildFullText({
        title: cleanedTitle,
        description: cleanedDescription,
        headings: cleanedHeadings,
        content: cleanedMainContent
      })
    };

    return cleanedContent;
  } catch (error) {
    console.error('清洗内容失败:', error);
    // 返回降级方案
    return {
      title: pageContent.title || '',
      description: pageContent.description || '',
      keywords: '',
      headings: [],
      content: '',
      url: pageContent.url || '',
      domain: pageContent.domain || '',
      fullText: pageContent.title || ''
    };
  }
}

//清洗文本内容
function cleanText(text) {
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ')  // 多个空白字符替换为单个空格
    .replace(/\n\s*\n/g, '\n')  // 多个换行替换为单个换行
    .replace(/[\r\t]/g, ' ')  // 替换回车和制表符为空格
    .trim();
}

//清洗关键词
function cleanKeywords(keywords) {
  if (!keywords) return [];

  return keywords
    .split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => keyword.length > 0 && keyword.length <= 50)  // 过滤空值和过长关键词
    .slice(0, 10);  // 最多保留10个关键词
}

//清洗标题层级
function cleanHeadings(headings) {
  if (!Array.isArray(headings)) return [];

  return headings
    .map(heading => cleanText(heading))
    .filter(heading => heading.length > 0 && heading.length <= 200)  // 过滤空值和过长标题
    .slice(0, 20);  // 最多保留20个标题
}

//清洗主要内容
function cleanMainContent(content, options = {}) {
  const {
    maxLength = 4000,
    minLength = 100,
    title = '',
    description = '',
    headings = []
  } = options;

  if (!content) {
    // 如果没有主要内容，尝试从标题和描述构建
    const fallbackContent = [title, description].filter(Boolean).join(' ');
    return truncateText(fallbackContent, maxLength);
  }

  // 清洗文本
  let cleaned = cleanText(content);

  // 移除重复的段落（简单检测）
  cleaned = removeDuplicateParagraphs(cleaned);

  // 如果内容太短，尝试补充标题和描述
  if (cleaned.length < minLength && (title || description)) {
    const supplement = [title, description].filter(Boolean).join(' ');
    cleaned = supplement + '\n\n' + cleaned;
  }

  // 限制长度
  cleaned = truncateText(cleaned, maxLength);

  return cleaned;
}

//移除重复段落
function removeDuplicateParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/);
  const seen = new Set();
  const uniqueParagraphs = [];
    
    for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length > 0) {
      // 使用前50个字符作为唯一标识（避免完全相同的段落）
      const key = trimmed.substring(0, 50).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueParagraphs.push(trimmed);
      }
    }
  }

  return uniqueParagraphs.join('\n\n');
}

//截断文本到指定长度
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
}

  // 尝试在句子边界截断
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('\n')
  );

  if (lastSentenceEnd > maxLength * 0.7) {
    // 如果找到合适的截断点（在70%之后），使用该点
    return truncated.substring(0, lastSentenceEnd + 1);
  }

  // 否则在单词边界截断（针对英文）
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  // 最后的选择：直接截断
  return truncated + '...';
}

//构建完整文本用于发送给AI
function buildFullText(parts) {
  const { title, description, headings, content } = parts;
  const sections = [];

  // 标题
  if (title) {
    sections.push(`标题：${title}`);
  }

  // 描述
  if (description) {
    sections.push(`描述：${description}`);
  }

  // 标题层级
  if (headings && headings.length > 0) {
    sections.push(`主要标题：\n${headings.slice(0, 5).join('\n')}`);
}

  // 主要内容
  if (content) {
    sections.push(`内容：\n${content}`);
  }

  return sections.join('\n\n');
}

// 如果在浏览器环境中，将函数导出到全局
if (typeof window !== 'undefined') {
  window.cleanContent = cleanContent;
}
