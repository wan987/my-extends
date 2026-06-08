/**
 * 智能标签生成工具
 * 用于生成书签的智能标签
 */

//构建标签生成Prompt
function buildPrompt(pageContent, existingTags = []) {
  if (!pageContent) {
    throw new Error('页面内容不能为空');
  }

  // 构建现有标签列表文本
  let existingTagsText = '';
  if (existingTags && existingTags.length > 0) {
    // 限制显示数量，避免提示词过长（最多显示100个标签）
    const displayTags = existingTags.slice(0, 100);
    existingTagsText = displayTags.map(tag => `#${tag}`).join(' ');
    if (existingTags.length > 100) {
      existingTagsText += ` ...（共${existingTags.length}个标签，仅显示前100个）`;
    }
  }

  const prompt = `请为以下网页内容生成3-8个简洁的标签，并简要概括网站的内容。

**重要提示：请首先识别该网页内容是否符合已有的标签。如果能够匹配现有标签，请优先使用现有标签；如果无法匹配，则使用新标签。**

现有标签库（${existingTags?.length || 0}个标签）：
${existingTagsText || '（暂无现有标签）'}

标签要求：
1. 优先从现有标签库中选择匹配的标签
2. 当现有标签库中标签与网页内容不匹配时，生成新标签
3. 准确反映网页的主要主题和内容
4. 使用中文，简洁明了（每个标签2-8个字符）
5. 以#开头，多个标签用空格分隔
6. 避免过于宽泛或过于具体的标签
7. 优先选择最能代表内容核心的标签

内容概括要求：
1. 简要概括网站的主要内容、功能或特点
2. 字数不超过100字
3. 使用中文，简洁明了
4. 准确反映网站的核心价值

网页信息：
${pageContent.fullText || pageContent.content || pageContent.title || '无内容'}

请按照以下格式返回结果（必须严格遵循此格式）：
标签：#标签1 #标签2 #标签3
概括：[这里填写网站内容概括，不超过100字]`;

  return prompt;
}

//解析API返回的标签和概括文本
function parseTagsAndSummary(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'string') {
    console.warn('API响应不是有效的字符串:', apiResponse);
    return { tags: [], summary: '' };
  }

  // 清理响应文本
  let text = apiResponse.trim();

  // 移除可能的markdown格式标记
  text = text.replace(/```[\s\S]*?```/g, ''); // 移除代码块
  text = text.replace(/`([^`]+)`/g, '$1'); // 移除行内代码标记
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // 移除粗体标记
  text = text.replace(/\*([^*]+)\*/g, '$1'); // 移除斜体标记

  let tags = [];
  let summary = '';

  // 尝试解析格式化的响应（标签：#标签1 #标签2\n概括：...）
  const tagMatch = text.match(/标签[：:]\s*(.+?)(?:\n|概括|$)/i);
  const summaryMatch = text.match(/概括[：:]\s*(.+?)(?:\n|$)/i);

  if (tagMatch) {
    // 解析标签行
    const tagLine = tagMatch[1].trim();
    const tagParts = tagLine.split(/\s+/);
    
    for (const part of tagParts) {
      let tag = part.trim();
      // 移除#号（如果有）
      if (tag.startsWith('#')) {
        tag = tag.substring(1);
      }
      // 移除其他可能的标点符号（在标签末尾）
      tag = tag.replace(/[，。！？、；：,\.!?;:]+$/, '');
      // 验证标签
      if (tag && tag.length >= 1 && tag.length <= 20 && !tag.includes(' ')) {
        tags.push(tag);
      }
    }
  }

  if (summaryMatch) {
    summary = summaryMatch[1].trim();
    // 限制概括长度（最多100字）
    if (summary.length > 100) {
      summary = summary.substring(0, 100);
    }
  }

  // 如果没有找到格式化响应，尝试旧格式（仅标签）
  if (tags.length === 0) {
    tags = parseTags(apiResponse);
  }

  // 去重标签
  const uniqueTags = [...new Set(tags)];
  
  return {
    tags: uniqueTags.slice(0, 8), // 限制标签数量（最多8个）
    summary: summary
  };
}

//解析API返回的标签文本（）
//保留该旧函数以兼容
function parseTags(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'string') {
    console.warn('API响应不是有效的字符串:', apiResponse);
    return [];
  }

  // 清理响应文本
  let text = apiResponse.trim();

  // 移除可能的markdown格式标记
  text = text.replace(/```[\s\S]*?```/g, ''); // 移除代码块
  text = text.replace(/`([^`]+)`/g, '$1'); // 移除行内代码标记
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // 移除粗体标记
  text = text.replace(/\*([^*]+)\*/g, '$1'); // 移除斜体标记

  // 尝试提取标签部分（可能包含说明文字）
  // 查找包含#的行或段落
  const lines = text.split('\n');
  let tagLine = '';

  for (const line of lines) {
    // 如果行中包含#，可能是标签行
    if (line.includes('#')) {
      tagLine = line.trim();
      break;
    }
  }

  // 如果没有找到包含#的行，尝试从整个文本中提取
  if (!tagLine) {
    // 查找所有#标签的模式
    const tagMatches = text.match(/#[\w\u4e00-\u9fa5]+/g);
    if (tagMatches && tagMatches.length > 0) {
      tagLine = tagMatches.join(' ');
    } else {
      // 如果还是没有，使用整个文本
      tagLine = text;
    }
  }

  // 解析标签
  const tags = [];
  const parts = tagLine.split(/\s+/);

  for (const part of parts) {
    let tag = part.trim();

    // 移除#号（如果有）
    if (tag.startsWith('#')) {
      tag = tag.substring(1);
    }

    // 移除其他可能的标点符号（在标签末尾）
    tag = tag.replace(/[，。！？、；：,\.!?;:]+$/, '');

    // 验证标签
    if (tag && tag.length >= 1 && tag.length <= 20) {
      // 标签不能包含空格
      if (!tag.includes(' ')) {
        tags.push(tag);
      }
    }
  }

  // 去重
  const uniqueTags = [...new Set(tags)];

  // 限制标签数量（最多8个）
  return uniqueTags.slice(0, 8);
}

//生成智能标签和内容概括
async function generateSmartTags(bookmarkId, pageContent, existingTags = []) {
  try {
    // 检查必要的函数是否可用
    if (typeof getActiveApiConfig !== 'function') {
      throw new Error('getActiveApiConfig 函数不可用，请确保已引入 aiApiClient.js');
    }
    if (typeof callAIApi !== 'function') {
      throw new Error('callAIApi 函数不可用，请确保已引入 aiApiClient.js');
    }

    // 获取启用的API配置
    const apiConfig = await getActiveApiConfig();
    if (!apiConfig) {
      throw new Error('未找到启用的API配置。请前往设置页面：1) 开启智能标签总开关；2) 至少启用一个API配置');
    }

    // 构建Prompt（传入现有标签）
    const prompt = buildPrompt(pageContent, existingTags);

    console.log('开始生成智能标签和内容概括，书签ID:', bookmarkId);
    console.log('使用API:', apiConfig.name || apiConfig.provider);
    console.log('现有标签数量:', existingTags?.length || 0);

    // 调用AI API
    const apiResponse = await callAIApi(apiConfig, prompt);

    console.log('API响应:', apiResponse.substring(0, 200));

    // 解析标签和概括
    const result = parseTagsAndSummary(apiResponse);

    if (result.tags.length === 0) {
      console.warn('未能从API响应中解析出标签');
      // 返回空结果而不是抛出错误，让调用者决定如何处理
      return { tags: [], summary: result.summary };
    }

    console.log('生成的标签:', result.tags);
    console.log('生成的内容概括:', result.summary);

    // 保存标签到存储（可选，这里不保存，由调用者决定）
    // 标签保存逻辑将在background.js中处理

    return result;
  } catch (error) {
    console.error('生成智能标签和内容概括失败:', error);
    throw error;
  }
}

